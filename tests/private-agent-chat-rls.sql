-- Read-only verification of the existing production policies.
-- No DDL or data changes. Run against Supabase after deployment.
select
  (select qual like '%crm_can_view_conversation(tenant_id, id)%'
   from pg_policies where schemaname='public' and tablename='conversations'
     and policyname='conversations_select') as conversation_view_is_authorized,
  (select qual like '%crm_can_view_conversation(tenant_id, conversation_id)%'
   from pg_policies where schemaname='public' and tablename='messages'
     and policyname='messages_select') as message_view_matches_conversation,
  pg_get_functiondef('private.crm_can_view_conversation(uuid,uuid)'::regprocedure)
    like '%crm_is_ai_handoff_queue%' as only_ai_unassigned_pool_visible_to_sellers,
  pg_get_functiondef('private.crm_can_edit_conversation(uuid,uuid)'::regprocedure)
    like '%c.assigned_to=auth.uid()%' as private_seller_edits_enforced,
  pg_get_functiondef('private.crm_can_insert_conversation_message(uuid,uuid,uuid,text,text)'::regprocedure)
    like '%p_sender_user_id=auth.uid()%' as seller_message_owner_checked,
  pg_get_functiondef('public.tenant_assign_conversation(uuid,uuid,uuid)'::regprocedure)
    like '%v_ai%' as assignment_requires_ai_queue;
