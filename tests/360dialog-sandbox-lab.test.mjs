import {test} from "node:test";
import assert from "node:assert/strict";
import {BASE,buildSandboxMessage,validateWebhookUrl} from "../scripts/360dialog-sandbox-lab.mjs";

test("Sandbox uses official sandbox endpoint, never production API",()=>{
 assert.equal(BASE,"https://waba-sandbox.360dialog.io");
});
test("Webhook setup permits HTTPS only and blocks embedded credentials and localhost",()=>{
 assert.equal(validateWebhookUrl("https://webhook.site/123e4567-e89b-12d3-a456-426614174000"),
              "https://webhook.site/123e4567-e89b-12d3-a456-426614174000");
 for(const x of ["http://webhook.site/test","https://admin:secret@domain.example/","https://localhost/x",
                 "https://domain.example/#fragment", "invalid"])
   assert.throws(()=>validateWebhookUrl(x));
});
test("Sandbox outbound is only a single self-recipient message (phone or BSUID)",()=>{
 const msg=buildSandboxMessage("phone","+1 (849) 570-6550","Prueba ficticia");
 assert.deepEqual(msg,{messaging_product:"whatsapp",recipient_type:"individual",
   type:"text",text:{body:"Prueba ficticia"},to:"18495706550"});
 const byId=buildSandboxMessage("bsuid","test-user-id-123456","Mensaje ficticio");
 assert.equal(byId.recipient,"test-user-id-123456");
 assert.equal(byId.to,undefined);
 for (const bad of ["","abc","1"])assert.throws(()=>buildSandboxMessage("phone",bad,"Hola"));
 assert.throws(()=>buildSandboxMessage("phone","+18495706550",""));
 assert.throws(()=>buildSandboxMessage("phone","+18495706550","x".repeat(1001)));
});
