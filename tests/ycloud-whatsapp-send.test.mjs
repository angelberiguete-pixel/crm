import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../supabase/functions/ycloud-whatsapp-send/index.ts",import.meta.url),"utf8");
test("YCloud sender cannot be enabled implicitly and has no embedded credential",()=>{
 for(const marker of ["YCLOUD_OUTBOUND_ENABLED","YCLOUD_API_KEY","getUser(match[1])",
  'from("memberships")','from("conversations")','from("ycloud_whatsapp_routes")',
  'eq("is_enabled",true)','from("messages")','"inbound"',"clientRequestId",
  'membership.role==="agent"','conversation.assigned_to!==user.id',
  "service_window_closed_template_required",
  "human_approved:true",'externalId:pending.id']) assert.ok(src.includes(marker),marker);
 assert.ok(src.indexOf('from("memberships")')<src.indexOf('fetch("https://api.ycloud.com'));
 assert.ok(src.indexOf('from("messages").insert(')<src.indexOf('fetch("https://api.ycloud.com'));
 assert.doesNotMatch(src,/NEXT_PUBLIC_YCLOUD_API_KEY|D360-API-KEY|auto_reply\s*:\s*true/i);
});
test("YCloud sender is human-only and does not send unapproved templates or campaigns",()=>{
 assert.match(src,/if\(membership\.role==="agent"&&conversation\.assigned_to!==user\.id\)/);
 assert.match(src,/Date\.now\(\)-lastMs>23\*60\*60\*1000/);
 assert.match(src,/type:"text"/);
 assert.doesNotMatch(src,/type:"template"|marketing|whatsapp\.smb\.history/);
});
