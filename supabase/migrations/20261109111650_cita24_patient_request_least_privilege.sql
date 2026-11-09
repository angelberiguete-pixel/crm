-- Applied to Empresia Supabase migration 20261109111650.
-- Limit patient request PII to authorized CRM operators.
drop policy if exists cita24_requests_select on public.cita24_visit_requests;
create policy cita24_requests_select on public.cita24_visit_requests
  for select to authenticated using(private.can_operate_crm(tenant_id));
revoke update on public.cita24_visit_requests from authenticated;
grant update(status,updated_at) on public.cita24_visit_requests to authenticated;
