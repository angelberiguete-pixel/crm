import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import ts from "typescript";
const load=(name)=>{const src=readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),"utf8");const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function("exports","require",js)(exports,()=>{throw Error("Unexpected dependency")});return exports};
const {openAiArmCompletion}=load("arm-openai-provider");
test("OpenAI request uses Responses API, disables storage and reports usage",async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldModel=process.env.ARM_OPENAI_MODEL;
 try{
  process.env.OPENAI_API_KEY="test-secret";process.env.ARM_OPENAI_MODEL="gpt-4.1-mini";
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,"https://api.openai.com/v1/responses");
   assert.equal(options.headers.authorization,"Bearer test-secret");
   const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,650);
   return {ok:true,json:async()=>({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Respuesta segura"}]}],usage:{input_tokens:12,output_tokens:7}})};
  };
  assert.deepEqual(await openAiArmCompletion([{role:"user",content:"Hola"}]),{text:"Respuesta segura",model:"gpt-4.1-mini",inputTokens:12,outputTokens:7});
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldModel===undefined)delete process.env.ARM_OPENAI_MODEL;else process.env.ARM_OPENAI_MODEL=oldModel;}
});
test("Rejects empty messages without contacting API",async()=>{
 await assert.rejects(()=>openAiArmCompletion([{role:"user",content:""}]),/Invalid ARM messages|not configured/);
});
