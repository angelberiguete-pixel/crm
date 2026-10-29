-- Optional idempotent onboarding provision of four non-operational assistant drafts.
-- Never sends WhatsApp, calls a paid provider or enables tools.
create or replace function public.platform_prepare_client_digital_staff(p_tenant_id uuid)
returns integer
language plpgsql security invoker set search_path=''
as $$
declare
 v_name text;
 v_role text;
 v_count integer:=0;
 v_display text;
 v_purpose text;
 v_instructions text;
begin
 if auth.uid() is null or not private.is_platform_admin() then
   raise exception 'platform_admin_only' using errcode='42501';
 end if;
 if p_tenant_id is null then raise exception 'invalid_tenant' using errcode='22023'; end if;
 select t.name into v_name from public.tenants t
 where t.id=p_tenant_id and t.status='active';
 if v_name is null then raise exception 'tenant_not_found_or_inactive' using errcode='22023'; end if;
 -- Lock prevents concurrent invocations from inserting a duplicate role.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('look-staff-onboarding-'||p_tenant_id::text,0));
 foreach v_role in array array['recepcionista','vendedor','secretaria','cobros'] loop
   if not exists (
     select 1 from public.ai_agents a
     where a.tenant_id=p_tenant_id and a.settings->>'role'=v_role
       and a.status in ('draft','active','paused')
   ) then
     v_display:=case v_role
       when 'recepcionista' then 'Recepcionista IA'
       when 'vendedor' then 'Asesor comercial IA'
       when 'secretaria' then 'Secretaría administrativa IA'
       else 'Asistente de cobros IA' end;
     v_purpose:=case v_role
       when 'recepcionista' then 'Preparar respuestas informativas y solicitudes de cita.'
       when 'vendedor' then 'Preparar calificación comercial y propuestas para revisión.'
       when 'secretaria' then 'Preparar tareas administrativas y agenda no confirmada.'
       else 'Preparar aclaraciones de facturas verificadas, sin ejecutar cobros.' end;
     v_instructions:='Borrador de configuración. No inventes información empresarial, precios, fechas ni saldos. No envíes mensajes ni ejecutes herramientas. Exige revisión humana antes de cualquier respuesta externa.';
     insert into public.ai_agents(
       tenant_id,name,purpose,status,model_provider,model_name,
       system_prompt,max_output_tokens,approval_mode,allowed_tools,settings)
     values(
       p_tenant_id,v_display,v_purpose,'draft','openai','server-configured',
       v_instructions,450,'human_approval','[]'::jsonb,
       pg_catalog.jsonb_build_object('role',v_role,'knowledge',
         pg_catalog.jsonb_build_object(
           'business_name',left(v_name,120),'services','','hours','','location','',
           'prices','','booking','','faq','','human_contact',''),
         'onboarding_placeholder',true,'requires_verified_knowledge',true)
     );
     v_count:=v_count+1;
   end if;
 end loop;
 return v_count;
end;
$$;
revoke all on function public.platform_prepare_client_digital_staff(uuid)
  from public,anon,authenticated;
grant execute on function public.platform_prepare_client_digital_staff(uuid)
  to authenticated;
comment on function public.platform_prepare_client_digital_staff(uuid) is
 'Platform-admin-only seed of four nonoperational draft profiles; refuses external sending and has no AI provider call.';
