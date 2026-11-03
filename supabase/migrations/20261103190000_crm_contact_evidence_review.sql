-- Evidencia verificable para contactos del CRM (propuesta, NO aplicada en producción).
-- Patrón inspirado en los controles de procedencia de trycompai/crm (MIT).
-- No se copian sus datos ni su modelo de autenticación single-tenant.
-- Evidencia y revisión son append-only. Ninguna decisión actualiza el contacto
-- ni activa IA, automatizaciones, canales o envíos a clientes.

create table public.crm_contact_evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null,
  field_key text not null check (field_key in
    ('name','job_title','company','phone','email','address','product_interest','other')),
  claim_text text not null check (char_length(btrim(claim_text)) between 3 and 1200),
  source_kind text not null check (source_kind in
    ('manual','conversation','document','website','ai_run')),
  source_reference text check (source_reference is null or
    char_length(btrim(source_reference)) between 1 and 500),
  source_excerpt text check (source_excerpt is null or
    char_length(btrim(source_excerpt)) between 1 and 1000),
  ai_run_id uuid,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id,id),
  constraint crm_contact_evidence_contact_fk
    foreign key (tenant_id,contact_id)
    references public.contacts(tenant_id,id) on delete cascade,
  constraint crm_contact_evidence_run_fk
    foreign key (tenant_id,ai_run_id)
    references public.ai_agent_runs(tenant_id,id) on delete cascade,
  constraint crm_contact_evidence_ai_origin check (
    (source_kind='ai_run' and ai_run_id is not null)
    or (source_kind<>'ai_run' and ai_run_id is null)
  )
);
create index crm_contact_evidence_tenant_recent
  on public.crm_contact_evidence(tenant_id,created_at desc);
create index crm_contact_evidence_contact_recent
  on public.crm_contact_evidence(tenant_id,contact_id,created_at desc);

alter table public.crm_contact_evidence enable row level security;
revoke all on public.crm_contact_evidence from public,anon,authenticated;
grant select,insert on public.crm_contact_evidence to authenticated;
grant all on public.crm_contact_evidence to service_role;

create policy crm_contact_evidence_owner_read
  on public.crm_contact_evidence for select to authenticated using (
    private.is_tenant_admin(tenant_id)
    and private.crm_active_tenant_matches(tenant_id)
  );
create policy crm_contact_evidence_owner_submit
  on public.crm_contact_evidence for insert to authenticated with check (
    private.is_tenant_admin(tenant_id)
    and private.crm_active_tenant_matches(tenant_id)
    and created_by=(select auth.uid())
    and source_kind<>'ai_run' and ai_run_id is null
  );

-- An immutable decision is a separate row: no UPDATE/DELETE granted to clients.
create table public.crm_contact_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  evidence_id uuid not null,
  decision text not null check (decision in ('verified','rejected')),
  reviewer_id uuid not null default auth.uid() references auth.users(id),
  note text check (\n    (decision='verified' and char_length(btrim(coalesce(note,''))) between 8 and 1000)\n    or (decision='rejected' and (note is null or char_length(note)<=1000))\n  ),
  reviewed_at timestamptz not null default now(),
  unique(tenant_id,evidence_id),
  constraint crm_contact_evidence_reviews_source_fk
    foreign key (tenant_id,evidence_id)
    references public.crm_contact_evidence(tenant_id,id) on delete cascade
);
create index crm_contact_evidence_reviews_recent
  on public.crm_contact_evidence_reviews(tenant_id,reviewed_at desc);

alter table public.crm_contact_evidence_reviews enable row level security;
revoke all on public.crm_contact_evidence_reviews from public,anon,authenticated;
grant select,insert on public.crm_contact_evidence_reviews to authenticated;
grant all on public.crm_contact_evidence_reviews to service_role;

create policy crm_contact_evidence_reviews_owner_read
  on public.crm_contact_evidence_reviews for select to authenticated using (
    private.is_tenant_admin(tenant_id)
    and private.crm_active_tenant_matches(tenant_id)
  );
create policy crm_contact_evidence_reviews_owner_decide
  on public.crm_contact_evidence_reviews for insert to authenticated with check (
    private.is_tenant_admin(tenant_id)
    and private.crm_active_tenant_matches(tenant_id)
    and reviewer_id=(select auth.uid())
    and exists (
      select 1 from public.crm_contact_evidence e
      where e.tenant_id=crm_contact_evidence_reviews.tenant_id
        and e.id=crm_contact_evidence_reviews.evidence_id
    )
  );

comment on table public.crm_contact_evidence is
  'Propuestas factuales por contacto, aisladas por tenant; no constituyen datos verificados ni modifican contactos.';
comment on table public.crm_contact_evidence_reviews is
  'Revisiones humanas inmutables y únicas por evidencia; aprobar no modifica contactos ni envía mensajes.';
