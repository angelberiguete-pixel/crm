-- QA-18: PostgreSQL contract test; must be run ONLY in a disposable DB.
-- Both tenants, phone IDs, contacts, messages and channels below are fictional.
\set ON_ERROR_STOP on
DO $qa$
BEGIN
 IF has_function_privilege('anon',
    'public.ingest_verified_whatsapp_text(text,text,text,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated',
    'public.ingest_verified_whatsapp_text(text,text,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'qa18: browser role can invoke inbound router'; END IF;
 IF NOT has_function_privilege('service_role',
    'public.ingest_verified_whatsapp_text(text,text,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'qa18: service role cannot invoke inbound router'; END IF;
END;
$qa$;

INSERT INTO public.tenants(id,status) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active');
INSERT INTO public.channels(id,tenant_id,provider,status) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','whatsapp','connected'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','whatsapp','connected');
INSERT INTO public.meta_whatsapp_routes
 (tenant_id,channel_id,phone_number_id,waba_id,verified_at,verified_reference,is_enabled) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
  '777777777777777','111111111111111',now(),'qa-synthetic-a',true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
  '888888888888888','222222222222222',now(),'qa-synthetic-b',false);

SET ROLE service_role;

DO $qa$
DECLARE r text;
BEGIN
 r:=public.ingest_verified_whatsapp_text(
 '999999999999999','111111111111111','wamid.SYNTH-UNKNOWN','999999990001','','hola');
 IF r <> 'unverified_route' THEN RAISE EXCEPTION 'qa18: unknown phone %',r; END IF;
 r:=public.ingest_verified_whatsapp_text(
 '777777777777777','222222222222222','wamid.SYNTH-WRONG-WABA','999999990001','','hola');
 IF r <> 'unverified_route' THEN RAISE EXCEPTION 'qa18: WABA mismatch %',r; END IF;
 r:=public.ingest_verified_whatsapp_text(
 '888888888888888','222222222222222','wamid.SYNTH-DISABLED','999999990001','','hola');
 IF r <> 'unverified_route' THEN RAISE EXCEPTION 'qa18: disabled route %',r; END IF;
 r:=public.ingest_verified_whatsapp_text(
 '777777777777777','111111111111111','wamid.SYNTH-INVALID','123','','hola');
 IF r <> 'invalid_message' THEN RAISE EXCEPTION 'qa18: invalid sender %',r; END IF;
 IF (SELECT count(*) FROM public.meta_whatsapp_inbound_receipts) <> 0
    OR (SELECT count(*) FROM public.contacts) <> 0
    OR (SELECT count(*) FROM public.conversations) <> 0
    OR (SELECT count(*) FROM public.messages) <> 0
    OR (SELECT count(*) FROM public.tasks) <> 0
 THEN RAISE EXCEPTION 'qa18: negative events created rows'; END IF;
END;
$qa$;

DO $qa$
DECLARE r text;
BEGIN
 r:=public.ingest_verified_whatsapp_text(
 '777777777777777','111111111111111','wamid.SYNTH-A-01','999999990001','','Hola QA');
 IF r <> 'stored' THEN RAISE EXCEPTION 'qa18: first A message %',r; END IF;
 r:=public.ingest_verified_whatsapp_text(
 '777777777777777','111111111111111','wamid.SYNTH-A-01','999999990001','','Hola QA');
 IF r <> 'duplicate' THEN RAISE EXCEPTION 'qa18: replay %',r; END IF;
 r:=public.ingest_verified_whatsapp_text(
 '777777777777777','111111111111111','wamid.SYNTH-A-02','999999990001','','Segunda consulta');
 IF r <> 'stored' THEN RAISE EXCEPTION 'qa18: second A message %',r; END IF;
 IF (SELECT count(*) FROM public.meta_whatsapp_inbound_receipts)<>2
    OR (SELECT count(*) FROM public.contacts)<>1
    OR (SELECT count(*) FROM public.conversations)<>1
    OR (SELECT count(*) FROM public.messages)<>2
    OR (SELECT count(*) FROM public.tasks)<>1
 THEN RAISE EXCEPTION 'qa18: A dedupe/contact/conversation/task cardinality wrong'; END IF;
 IF (SELECT display_name FROM public.contacts LIMIT 1)<>'Contacto WhatsApp'
 THEN RAISE EXCEPTION 'qa18: unverified profile name was promoted'; END IF;
 IF EXISTS (SELECT 1 FROM public.tasks WHERE metadata->>'requires_human'<>'true')
 THEN RAISE EXCEPTION 'qa18: task not explicitly human'; END IF;
END;
$qa$;

RESET ROLE;
-- Toggle ONLY synthetic tenant B inside this disposable test DB.
UPDATE public.meta_whatsapp_routes SET is_enabled=true WHERE
 tenant_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE service_role;

DO $qa$
DECLARE r text;
BEGIN
 -- Same sender and message ID in different verified phone routes must remain isolated.
 r:=public.ingest_verified_whatsapp_text(
 '888888888888888','222222222222222','wamid.SYNTH-A-01','999999990001','','Hola QA B');
 IF r <> 'stored' THEN RAISE EXCEPTION 'qa18: tenant B routing %',r; END IF;
 IF (SELECT count(*) FROM public.contacts)<>2
    OR (SELECT count(DISTINCT tenant_id) FROM public.contacts)<>2
    OR (SELECT count(*) FROM public.conversations)<>2
    OR (SELECT count(DISTINCT tenant_id) FROM public.messages)<>2
    OR (SELECT count(*) FROM public.tasks)<>2
    OR (SELECT count(*) FROM public.meta_whatsapp_inbound_receipts)<>3
 THEN RAISE EXCEPTION 'qa18: A/B message/contact/task isolation failed'; END IF;
 IF EXISTS (SELECT 1 FROM public.conversations cv JOIN public.contacts c
   ON cv.contact_id=c.id WHERE cv.tenant_id<>c.tenant_id)
 THEN RAISE EXCEPTION 'qa18: cross-tenant contact link'; END IF;
 IF EXISTS (SELECT 1 FROM public.messages WHERE direction<>'inbound')
 THEN RAISE EXCEPTION 'qa18: unexpected outbound message'; END IF;
 IF EXISTS (SELECT 1 FROM public.contacts WHERE metadata->>'consent'<>'not_verified')
 THEN RAISE EXCEPTION 'qa18: consent was invented'; END IF;
END;
$qa$;
RESET ROLE;
\echo QA18_POSTGRES_ROUTING_PASS
