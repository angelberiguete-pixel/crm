-- Family Power: retain the single known product reference from its paused
-- standalone Supabase without treating missing commercial data as approved.
-- Source catalog inspected 2026-11-09 before standalone project was paused.
-- This is a one-way, idempotent import into Empresia's existing tenant.
begin;
insert into public.products(
  tenant_id,sku,name,description,status,source_system,
  sale_price,currency,tax_rate,stock_snapshot,metadata
)
select
  t.id,
  'FP-LEGACY-INDUETRONIC-5F823B28',
  'Inversor INDUETRONIC — documentación provisional',
  'Referencia provisional recuperada del antiguo catálogo independiente de Family Power. Requiere comprobar modelo, fotografía, ficha técnica, inventario y precio antes de habilitar cotización.',
  'inactive','crm',0,'USD',0,null,
  jsonb_build_object(
    'brand','INDUETRONIC',
    'model','',
    'category','Inversores',
    'verification_status','pending',
    'quote_eligible',false,
    'price_verified',false,
    'stock_verified',false,
    'source_document_url','https://drive.google.com/file/d/1_FieR9-H0XVxplrfs1roE-nNGOLgRIxr/view',
    'technical_sheet_url','https://drive.google.com/file/d/1_FieR9-H0XVxplrfs1roE-nNGOLgRIxr/view',
    'legacy_source_project','rltnmstwqorxtoeqsbgh',
    'legacy_source_table','public.fp_products',
    'legacy_source_id','5f823b28-ae68-4ed1-93b7-ab501b767be2',
    'import_note','Documento original pendiente de validación técnica; no representa precio, inventario ni certificación de producto'
  )
from public.tenants t
where t.slug='family-power'
  and t.id='c1f2433e-e241-4771-a522-cdd5803e16d6'::uuid
  and t.status='active'
on conflict(tenant_id,sku) do nothing;
commit;
