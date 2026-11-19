import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectPublicBackend,EMPRESIA_PRODUCTION_PROJECT_REF} from "../lib/qa-backend-selection.ts";

const qaRef="aaaaaaaaaaaaaaaaaaaa";
const qa={
  projectRef:qaRef,
  url:"https://"+qaRef+".supabase.co",
  publishableKey:"sb_publishable_qa_test_key_123456789",
};

test("Vercel production retains canonical backend, ignoring preview env overrides",()=>{
  const choice=selectPublicBackend("production",{...qa,url:"https://evil.example"});
  assert.equal(choice.mode,"production");
  assert.equal(choice.ready,true);
  assert.match(choice.url,/ygipjqgyreeahslzorik[.]supabase[.]co/);
});

test("missing, unknown and local CI targets never fall back to production",()=>{
  for(const target of [undefined,"unverified","ci","unknown", ""]){
    const choice=selectPublicBackend(target,qa);
    assert.equal(choice.ready,false,String(target));
    assert.equal(choice.mode,"blocked");
    assert.doesNotMatch(choice.url,/ygipjqgyreeahslzorik/);
  }
  for(const target of ["preview","development"]){
    const choice=selectPublicBackend(target,{});
    assert.equal(choice.ready,false,target);
    assert.match(choice.url,/qa-not-configured[.]invalid/);
  }
});

test("isolated preview QA endpoint requires an independent matching 20-character project ref",()=>{
  assert.equal(selectPublicBackend("preview",qa).mode,"qa");
  assert.equal(selectPublicBackend("preview",qa).url,qa.url);
  const failures=[
    {...qa,projectRef:EMPRESIA_PRODUCTION_PROJECT_REF,
      url:"https://"+EMPRESIA_PRODUCTION_PROJECT_REF+".supabase.co"},
    {...qa,projectRef:""},
    {...qa,projectRef:"abcd"},
    {...qa,projectRef:"bbbbbbbbbbbbbbbbbbbb"},
    {...qa,url:"http://"+qaRef+".supabase.co"},
    {...qa,url:"https://"+qaRef+".supabase.co/v1"},
    {...qa,url:"https://"+qaRef+".supabase.co?test=1"},
    {...qa,url:"https://"+qaRef+".supabase.co.attacker.net"},
    {...qa,publishableKey:"service_role_secret"},
    {...qa,publishableKey:""}
  ];
  for(const invalid of failures){
    const choice=selectPublicBackend("preview",invalid);
    assert.equal(choice.ready,false,JSON.stringify({...invalid,publishableKey:"REDACTED"}));
    assert.equal(choice.mode,"blocked");
    assert.doesNotMatch(choice.url,/ygipjqgyreeahslzorik/);
  }
});

test("selected backend is wired to Vercel build target and never browser-selected at runtime",()=>{
  const base=new URL("../",import.meta.url);
  const supabase=readFileSync(new URL("lib/supabase.ts",base),"utf8");
  const next=readFileSync(new URL("next.config.ts",base),"utf8");
  assert.match(supabase,/selectPublicBackend\(process[.]env[.]EMPRESIA_BUILD_TARGET/);
  assert.match(supabase,/NEXT_PUBLIC_EMPRESIA_QA_PROJECT_REF/);
  assert.match(supabase,/NEXT_PUBLIC_EMPRESIA_QA_SUPABASE_URL/);
  assert.match(supabase,/NEXT_PUBLIC_EMPRESIA_QA_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(supabase,/const url = "https:\/\/ygipjqgyreeahslzorik/);
  assert.match(next,/process[.]env[.]VERCEL_ENV==="preview"/);
  assert.match(next,/EMPRESIA_BUILD_TARGET: buildTarget/);
});
