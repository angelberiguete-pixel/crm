import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QA_CASES, EMPTY_QA_RECORD, qaSummary, validateQARecord, parseQAReport } from "../lib/qa-mobile.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("issue 69 keeps explicit, unique checks and no fake approvals",()=>{
  assert.equal(new Set(QA_CASES.map(x=>x.id)).size,QA_CASES.length);
  assert.ok(QA_CASES.some(x=>x.scope==="staging"));
  assert.ok(QA_CASES.some(x=>x.scope==="integracion"));
  assert.ok(QA_CASES.some(x=>x.scope==="fixture"));
  assert.equal(qaSummary({}).releaseReady,false);
  assert.equal(qaSummary({}).approvedFixture,0);
});
test("fixtures need actual evidence, never just a toggle",()=>{
  const one=QA_CASES.find(x=>x.scope==="fixture");
  const good={...EMPTY_QA_RECORD,status:"aprobada",operator:"QA",device:"Android 390x844",
    commitSha:"64e4ec71",observation:"Ejecución completada sin errores",evidenceUrl:"https://github.com/example/demo/actions/runs/123"};
  assert.equal(validateQARecord(one,good),null);
  assert.equal(qaSummary({[one.id]:good}).approvedFixture,1);
  assert.match(validateQARecord(one,{...good,evidenceUrl:"https://example.com/report?token=private"}),/Enlace HTTPS/);
  assert.match(validateQARecord(one,{...good,commitSha:"fake"}),/SHA/);
});
test("real staging and official integrations cannot be certified in local mode",()=>{
  for(const item of QA_CASES.filter(x=>x.scope!=="fixture")){
    const attempt={...EMPTY_QA_RECORD,status:"aprobada",observation:"Afirmación no verificada"};
    assert.match(validateQARecord(item,attempt),/Sin staging verificado/);
  }
});
test("import rejects forged real approvals",()=>{
  const real=QA_CASES.find(x=>x.scope==="staging");
  const obj={schemaVersion:1,issue:69,mode:"fixture-only",generatedAt:"",records:{
    [real.id]:{...EMPTY_QA_RECORD,status:"aprobada",observation:"No es un ensayo real"}
  }};
  assert.throws(()=>parseQAReport(obj),/Sin staging verificado/);
});
test("QA route is disabled by default and in production, with no Supabase imports or mutations",()=>{
  const page=read("app/qa/mobile/page.tsx");
  const cockpit=read("components/qa-mobile-control-center.tsx");
  assert.match(page,/EMPRESIA_QA_CENTER_ENABLED/);
  assert.match(page,/VERCEL_ENV === "production"/);
  assert.match(page,/notFound\(\)/);
  const proxy=read("proxy.ts");
  assert.match(proxy,/EMPRESIA_QA_CENTER_ENABLED/);
  assert.match(proxy,/VERCEL_ENV === "preview"/);
  assert.match(proxy,/path === "\/qa\/mobile"/);
  assert.match(proxy,/status: 404/);
  assert.doesNotMatch(cockpit,/from ["']@\/lib\/supabase|supabase\.|fetch\(|\.insert\(|\.update\(/);
  assert.match(cockpit,/localStorage/);
  assert.match(cockpit,/schemaVersion: 1/);
});
