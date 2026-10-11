-- Security regression: both public property lead RPCs must be inaccessible to anon.
select has_function_privilege('anon','public.register_land_lead(text,text,text,text,text,text,text,text,text)','EXECUTE') as unsafe_lead_rpc, has_function_privilege('anon','public.track_land_sales_click(text,text,text)','EXECUTE') as unsafe_click_rpc;
