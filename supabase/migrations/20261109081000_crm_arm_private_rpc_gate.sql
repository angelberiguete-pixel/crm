-- Move privileged intervention functions into non-exposed private schema.
-- Keep only SECURITY INVOKER wrappers on the public PostgREST API.
begin;

alter function public.crm_arm_propose_intervention(uuid,uuid,text) set schema private;
revoke all on function private.crm_arm_propose_intervention(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.crm_arm_propose_intervention(uuid,uuid,text) to authenticated;

create function public.crm_arm_propose_intervention(p_tenant_id uuid,p_opportunity_id uuid,p_recommendation_key text)
returns uuid language sql security invoker set search_path=''
as $wrapper$
 select private.crm_arm_propose_intervention(p_tenant_id,p_opportunity_id,p_recommendation_key);
$wrapper$;
revoke all on function public.crm_arm_propose_intervention(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.crm_arm_propose_intervention(uuid,uuid,text) to authenticated;

alter function public.crm_arm_review_intervention(uuid,uuid,boolean) set schema private;
revoke all on function private.crm_arm_review_intervention(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.crm_arm_review_intervention(uuid,uuid,boolean) to authenticated;

create function public.crm_arm_review_intervention(p_tenant_id uuid,p_intervention_id uuid,p_approve boolean)
returns text language sql security invoker set search_path=''
as $wrapper$
 select private.crm_arm_review_intervention(p_tenant_id,p_intervention_id,p_approve);
$wrapper$;
revoke all on function public.crm_arm_review_intervention(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.crm_arm_review_intervention(uuid,uuid,boolean) to authenticated;

alter function public.crm_arm_execute_intervention(uuid,uuid) set schema private;
revoke all on function private.crm_arm_execute_intervention(uuid,uuid) from public,anon,authenticated;
grant execute on function private.crm_arm_execute_intervention(uuid,uuid) to authenticated;

create function public.crm_arm_execute_intervention(p_tenant_id uuid,p_intervention_id uuid)
returns uuid language sql security invoker set search_path=''
as $wrapper$
 select private.crm_arm_execute_intervention(p_tenant_id,p_intervention_id);
$wrapper$;
revoke all on function public.crm_arm_execute_intervention(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_arm_execute_intervention(uuid,uuid) to authenticated;

alter function public.crm_arm_complete_intervention_task(uuid,uuid) set schema private;
revoke all on function private.crm_arm_complete_intervention_task(uuid,uuid) from public,anon,authenticated;
grant execute on function private.crm_arm_complete_intervention_task(uuid,uuid) to authenticated;

create function public.crm_arm_complete_intervention_task(p_tenant_id uuid,p_intervention_id uuid)
returns boolean language sql security invoker set search_path=''
as $wrapper$
 select private.crm_arm_complete_intervention_task(p_tenant_id,p_intervention_id);
$wrapper$;
revoke all on function public.crm_arm_complete_intervention_task(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_arm_complete_intervention_task(uuid,uuid) to authenticated;

alter function public.crm_arm_measure_intervention(uuid,uuid) set schema private;
revoke all on function private.crm_arm_measure_intervention(uuid,uuid) from public,anon,authenticated;
grant execute on function private.crm_arm_measure_intervention(uuid,uuid) to authenticated;

create function public.crm_arm_measure_intervention(p_tenant_id uuid,p_intervention_id uuid)
returns text language sql security invoker set search_path=''
as $wrapper$
 select private.crm_arm_measure_intervention(p_tenant_id,p_intervention_id);
$wrapper$;
revoke all on function public.crm_arm_measure_intervention(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_arm_measure_intervention(uuid,uuid) to authenticated;

commit;
