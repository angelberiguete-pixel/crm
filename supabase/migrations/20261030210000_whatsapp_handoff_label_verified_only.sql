-- Staged, human-only triage of inbound WhatsApp text.
-- No paid AI inference, outbound WhatsApp, Make activation, status or seller changes.
-- Only verified WABA/Phone receipts from prior service-role ingestion are eligible.
create or replace function public.whatsapp_triage_verified_text()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
 v_text text;
 v_intent text:='general_information';
 v_next text:='prepare_draft_only';
 v_handoff boolean:=false;
begin
 if NEW.direction<>'inbound' or NEW.message_type<>'text' or NEW.sender_type<>'contact'
    or NEW.metadata->>'provider'<>'whatsapp'
    or NEW.external_message_id is null then
   return NEW;
 end if;
 if not exists (
   select 1 from public.meta_whatsapp_inbound_receipts r
   where r.tenant_id=NEW.tenant_id
     and r.external_message_id=NEW.external_message_id
     and r.phone_number_id=NEW.metadata->>'phone_number_id'
 ) then return NEW; end if;

 v_text:=lower(translate(left(coalesce(NEW.body,''),1600),'áéíóúÁÉÍÓÚñÑ','aeiouaeiounn'));
 if v_text ~ '(hablar|quiero|necesito|prefiero|pasame|transferir|conectar|comunicar).{0,70}(asesor|humano|persona real|vendedor|representante|supervisor|operador)' then
   v_intent:='human_requested';v_next:='transfer_to_human';v_handoff:=true;
 elsif v_text ~ '(acepto|apruebo|confirmo|autorizo).{0,55}(cotizacion|propuesta|presupuesto|oferta)'
   or v_text ~ '(cotizacion|propuesta|presupuesto|oferta).{0,55}(aceptada|aprobada)' then
   v_intent:='quote_acknowledgment';v_next:='verify_quote_approval';v_handoff:=true;
 elsif v_text ~ '(reclamo|queja|reembolso|devolucion|factura|cobro|pago indebido)' then
   v_intent:='billing_or_complaint';v_next:='review_billing';v_handoff:=true;
 elsif v_text ~ '(cotizar|cotizacion|presupuesto|cuanto cuesta|precio|costos?)' then
   v_intent:='quote_requested';v_next:='review_quote';v_handoff:=true;
 elsif v_text ~ '(agendar|agenda|cita|reservar|disponibilidad|visita tecnica)' then
   v_intent:='appointment_requested';v_next:='verify_calendar';v_handoff:=true;
 end if;
 update public.conversations c
 set metadata=c.metadata||pg_catalog.jsonb_build_object(
   'handoff_intent',v_intent,'handoff_next_step',v_next,
   'handoff_requires_human',v_handoff,'handoff_source','rule_based_not_ai',
   'handoff_auto_sent',false)
 where c.id=NEW.conversation_id and c.tenant_id=NEW.tenant_id;
 -- It deliberately DOES NOT assign a seller, create a sale, generate an AI
 -- response, enable auto_reply or send anything via WhatsApp/Make.
 return NEW;
end;
$$;
revoke all on function public.whatsapp_triage_verified_text() from public,anon,authenticated;
drop trigger if exists whatsapp_triage_on_inbound_text on public.messages;
create trigger whatsapp_triage_on_inbound_text after insert on public.messages
for each row execute function public.whatsapp_triage_verified_text();
comment on function public.whatsapp_triage_verified_text() is
 'Label verified inbound WhatsApp conversation for human review; never send or approve quotes.';
