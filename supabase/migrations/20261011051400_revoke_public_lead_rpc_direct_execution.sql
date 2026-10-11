revoke all on function public.capture_public_lead(text,text,text,text,text,text,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.get_public_lead_page(text) from public, anon, authenticated;

comment on function public.capture_public_lead(text,text,text,text,text,text,jsonb,boolean)
is 'Internal legacy lead capture RPC. Public submissions must use look-social-media-lead-capture Edge Function.';

comment on function public.get_public_lead_page(text)
is 'Internal legacy public-page metadata RPC. Direct anonymous execution disabled.';
