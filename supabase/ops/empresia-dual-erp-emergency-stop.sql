-- Emergency stop: no new outbox events for any tenant, retain evidence.
begin;
update private.erp_dual_tenant_enrollments
 set enabled=false where enabled=true;
commit;
