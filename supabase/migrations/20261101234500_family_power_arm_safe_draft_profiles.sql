-- Family Power ARM: add safe draft-only identities inside the existing multi-tenant CRM.
-- No other tenant is modified. This does not connect AI providers, tools, or WhatsApp.
begin;
with profiles(arm_role,name,purpose,guardrail) as (
 values
 ('ventas','Vendedor digital','Preparar diagnósticos y ofertas para aprobación.',
  'Borrador interno: usa solo precios y fichas verificados; no envíes mensajes ni comprometas ventas.'),
 ('tecnico','Asesor técnico digital','Preparar análisis técnicos con documentación aprobada.',
  'Borrador interno: sin ficha homologada, solicita revisión técnica; no inventes potencia ni garantías.'),
 ('seguimiento','Seguimiento comercial','Detectar tareas y contactos pendientes para revisión.',
  'Borrador interno: no envíes mensajes, no dupliques acciones y respeta permisos y consentimiento.'),
 ('supervision','Supervisor digital','Revisar evidencia, autorizaciones y acciones propuestas.',
  'Borrador interno: no autoapruebes excepciones ni otorgues permisos o ejecutes acciones externas.')
)
insert into public.ai_agents(
 tenant_id,name,purpose,status,model_provider,model_name,system_prompt,
 approval_mode,allowed_tools,settings
)
select t.id,r.name,r.purpose,'draft','unconfigured','not-connected',
 r.guardrail,'human_approval','[]'::jsonb,
 jsonb_build_object('arm_role',r.arm_role,'provider_status','not_connected','review_required',true)
from public.tenants t cross join profiles r
where t.slug='family-power' and t.status='active'
and not exists (
 select 1 from public.ai_agents a
 where a.tenant_id=t.id and (
   a.settings->>'arm_role'=r.arm_role
   or a.name=r.name
   or (r.arm_role='ventas' and a.settings->>'role'='vendedor')
 )
);
commit;
