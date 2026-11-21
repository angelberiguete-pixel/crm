import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

// QA-18: run the actual Meta Edge handler with a fake Deno runtime and DB client.
// No Meta requests, Supabase connections, real phone numbers or production writes.
const SECRET='qa-secret-abcdefghijklmnopqrst';
const TOKEN='qa-verify-abcdefghijklmnopqrst';
const dbCalls=[];
let dbResult='stored', missingConfig=false;

globalThis.__qaMetaCreateClient=(url,key)=>{
  assert.equal(url,'https://qa.invalid');
  assert.equal(key,'qa-fake-service-role');
  return {rpc:async (name,params)=>{
    assert.equal(name,'ingest_verified_whatsapp_text');
    dbCalls.push(params);
    return {error:null,data:dbResult};
  }};
};
globalThis.Deno={
  env:{get:(k)=>({
    META_APP_SECRET:missingConfig?undefined:SECRET,
    META_WHATSAPP_VERIFY_TOKEN:TOKEN,
    SUPABASE_URL:'https://qa.invalid',
    SUPABASE_SERVICE_ROLE_KEY:'qa-fake-service-role'
  }[k])},
  serve:(handler)=>{globalThis.handler=handler;}
};

const edgeFile=new URL('../supabase/functions/meta-whatsapp-inbound/index.ts',import.meta.url);
const parserUrl=new URL('../lib/meta-whatsapp-inbound.ts',import.meta.url);
let source=readFileSync(edgeFile,'utf8');
const originalImport='import {createClient} from "npm:@supabase/supabase-js@2.116.0";';
const parserImport='from "../../../lib/meta-whatsapp-inbound.ts"';
assert.ok(source.includes(originalImport),'Supabase Edge import must exist');
assert.ok(source.includes(parserImport),'PR #209 parser import must exist');
// Replace ONLY network client import and parser URI; the remaining Edge handler
// is loaded unchanged after Node type-stripping.
source=source.replace(originalImport,'const createClient=globalThis.__qaMetaCreateClient;')
  .replace(parserImport,'from "'+parserUrl.href+'"');
const js=stripTypeScriptTypes(source,{mode:'strip'});
await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

const payload={object:'whatsapp_business_account',entry:[{
  id:'123456789012345',changes:[{field:'messages',value:{
    metadata:{phone_number_id:'987654321012345'},
    contacts:[{wa_id:'18095550123',profile:{name:'Persona QA'}}],
    messages:[{from:'18095550123',id:'wamid.QA18A',type:'text',
      text:{body:'Hola, información de inversores'}}]
  }}]
}]};

async function signedRequest(data,secret=SECRET){
  const body=typeof data==='string'?data:JSON.stringify(data);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=Buffer.from(await crypto.subtle.sign(
    'HMAC',key,new TextEncoder().encode(body))).toString('hex');
  return new Request('https://qa.invalid/receiver',{method:'POST',
    headers:{'x-hub-signature-256':'sha256='+digest},body});
}

test('valid Meta challenge succeeds, wrong verification token returns 403',async()=>{
  const good=await globalThis.handler(new Request(
    'https://qa.invalid/?hub.mode=subscribe&hub.verify_token='+TOKEN+'&hub.challenge=12345'));
  assert.equal(good.status,200);
  assert.equal(await good.text(),'12345');
  const bad=await globalThis.handler(new Request(
    'https://qa.invalid/?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345'));
  assert.equal(bad.status,403);
});

test('unsigned webhook returns 401 and never invokes database',async()=>{
  const before=dbCalls.length;
  const res=await globalThis.handler(new Request('https://qa.invalid/receiver',
    {method:'POST',body:JSON.stringify(payload)}));
  assert.equal(res.status,401);
  assert.equal(dbCalls.length,before);
});

test('incorrect HMAC returns 401 without invoking database',async()=>{
  const before=dbCalls.length;
  const res=await globalThis.handler(await signedRequest(payload,'wrong-signature-1234567890'));
  assert.equal(res.status,401);
  assert.equal(dbCalls.length,before);
});

test('signed text reaches mock RPC with verified-style Meta routing identifiers',async()=>{
  const before=dbCalls.length;
  const res=await globalThis.handler(await signedRequest({...payload,tenant_id:'malicious-qa-b'}));
  assert.equal(res.status,200);
  assert.equal(dbCalls.length,before+1);
  assert.deepEqual(Object.keys(dbCalls.at(-1)).sort(),[
    'p_body','p_contact_name','p_from','p_message_id','p_phone_number_id','p_waba_id']);
  assert.equal(dbCalls.at(-1).p_body,'Hola, información de inversores');
  assert.equal(dbCalls.at(-1).p_phone_number_id,'987654321012345');
  assert.equal(dbCalls.at(-1).p_waba_id,'123456789012345');
});

test('duplicate and unverified route results do not cause direct auto-send',async()=>{
  for (const status of ['duplicate','unverified_route']){
    dbResult=status;
    assert.equal((await globalThis.handler(await signedRequest(payload))).status,200);
  }
  dbResult='stored';
});

test('signed invalid JSON returns 400 without invoking database',async()=>{
  const before=dbCalls.length;
  assert.equal((await globalThis.handler(await signedRequest('not-json'))).status,400);
  assert.equal(dbCalls.length,before);
});

test('unsupported media and malformed WABA do not invoke database',async()=>{
  const before=dbCalls.length;
  const image=structuredClone(payload);
  image.entry[0].changes[0].value.messages[0].type='image';
  assert.equal((await globalThis.handler(await signedRequest(image))).status,200);
  image.entry[0].id='bad';
  assert.equal((await globalThis.handler(await signedRequest(image))).status,200);
  assert.equal(dbCalls.length,before);
});

test('missing Meta secret fails closed with 503',async()=>{
  const before=dbCalls.length;
  missingConfig=true;
  try{
    assert.equal((await globalThis.handler(await signedRequest(payload))).status,503);
    assert.equal(dbCalls.length,before);
  }finally{missingConfig=false;}
});
