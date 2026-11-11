-- Emergency kill switch: disable new event capture for ALL tenants without deleting audit evidence.
-- Does not remove triggers, tables, prior decisions or tasks.
begin;
update private.empresia_brain_tenant_pilots
 set enabled=false where enabled=true;
commit;
