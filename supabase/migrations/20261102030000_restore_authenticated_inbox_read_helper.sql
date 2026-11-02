-- Restore read-only RLS helper execution for authenticated CRM members.
-- Production symptom (Family Power, mobile): 42501 "permission denied for
-- function crm_can_view_conversation" when loading the Conversations inbox.
--
-- conversations_select and messages_select both evaluate this private helper.
-- The function already checks auth.uid(), active tenant and active membership/
-- assignment. This migration does not change those authorization rules, grant
-- anonymous access, connect channels or enable outbound messaging.
revoke execute on function private.crm_can_view_conversation(uuid, uuid) from public, anon;
grant execute on function private.crm_can_view_conversation(uuid, uuid) to authenticated;
