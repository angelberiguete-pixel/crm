import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("existing CRM contacts can be edited without creating duplicates",()=>{
 const ui=read("components/crm-workspace.tsx");
 const editor=read("components/crm-contact-editor.tsx");
 assert.match(ui,/import CrmContactEditor from/);
 assert.match(ui,/setEditingContactId\(r\.id\)/);
 assert.match(ui,/q\.get\("contactId"\)/);
 assert.match(ui,/CrmContactEditor key=\{tenantId\+":"\+editingContactId\}/);
 assert.match(editor,/\.from\("contacts"\)\.update\(/);
 assert.match(editor,/\.eq\("tenant_id",tenantId\)\.eq\("id",contactId\)\.select\("id"\)\.single\(\)/);
 assert.doesNotMatch(editor,/\.from\("contacts"\)\.insert\(|\.delete\(/);
});

test("tenant contact editor enforces role and module checks with database RLS",()=>{
 const editor=read("components/crm-contact-editor.tsx");
 assert.match(editor,/const active=tenant\?\.tenant_id===tenantId/);
 assert.match(editor,/supabase\.rpc\("tenant_current_permissions"/);
 assert.match(editor,/supabase\.rpc\("tenant_effective_modules"/);
 assert.match(editor,/p\.all===true\|\|p\.contacts===true/);
 assert.match(editor,/module_key==="contacts"/);
 assert.match(editor,/\.eq\("tenant_id",tenantId\)\.eq\("id",contactId\)\.maybeSingle\(\)/);
 assert.match(editor,/if\(!record\|\|!allowed\|\|!active\|\|saving\|\|record\.id!==contactId\)return/);
 assert.doesNotMatch(editor,/service_role|NEXT_PUBLIC_SERVICE_ROLE|fetch\(|\.invoke\(/);
});

test("Look private prospect phone and email mirrors only under platform authorization",()=>{
 const editor=read("components/crm-contact-editor.tsx");
 const profile=read("components/arm-agency-prospect-profile.tsx");
 const desk=read("components/arm-agency-sales-desk.tsx");
 assert.match(editor,/tenant\?\.tenant_slug==="eurevector"/);
 assert.match(editor,/supabase\.rpc\("platform_current_access"\)/);
 assert.match(editor,/\.is_platform_admin===true/);
 assert.match(editor,/\.eq\("contact_id",contactId\)\.limit\(25\)/);
 assert.match(editor,/const refs=\[\.\.\.new Set\(/);
 assert.match(editor,/if\(refs\.length===1\)/);
 assert.match(editor,/\.from\("agency_prospects"\)/);
 assert.match(editor,/\.update\(\{phone,email\}\)\.eq\("id",refs\[0\]\)/);
 assert.match(editor,/La ficha privada de prospección no se pudo sincronizar/);
 assert.match(profile,/contactId\?:string\|null/);
 assert.match(profile,/\/crm\/contacts\?contactId=/);
 assert.match(desk,/contactId=\{linked\?\.contact_id\?\?null\}/);
});

test("contact changes are explicitly operator-driven, never remote messages",()=>{
 const editor=read("components/crm-contact-editor.tsx");
 assert.match(editor,/No hay cambios pendientes/);
 assert.match(editor,/WhatsApp aquí no activan ni envían mensajes/);
 assert.doesNotMatch(editor,/whatsapp-test-send|ycloud-whatsapp-send|sendMail|sendMessage\(/i);
});
