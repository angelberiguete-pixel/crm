// Controlled browser regressions for /crm/files. No real Storage requests or credentials.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base = process.env.CRM_FILES_TEST_BASE_URL || "http://127.0.0.1:3171";
const server = process.env.CRM_FILES_TEST_BASE_URL ? null :
  spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3171","-H","127.0.0.1"],{stdio:["ignore","ignore","inherit"]});
let browser;
try {
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    try {ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(ready,"CRM responds");
  browser=await chromium.launch({headless:true,channel:"chromium"});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const user={id:"11111111-1111-4111-8111-111111111111",aud:"authenticated",role:"authenticated",email:"qa@example.invalid",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[Buffer.from("{}").toString("base64url"),Buffer.from(JSON.stringify({sub:user.id,role:"authenticated",exp})).toString("base64url"),"qa-signature"].join(".");
  await context.addInitScript(({user,token,exp})=>{
    localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
      access_token:token,refresh_token:"qa-refresh",expires_at:exp,expires_in:3600,token_type:"bearer",user
    }));
  },{user,token,exp});
  let active=A, stored=null, uploads=0,downloads=0,deletes=0;
  await context.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    let payload=[], status=200, contentType="application/json";
    if(path.endsWith("/list_my_tenants")) payload=[A,B].map((id,i)=>({
      tenant_id:id,tenant_name:i?"QA B":"QA A",tenant_slug:i?"qa-b":"qa-a",membership_role:"owner",is_active:active===id
    }));
    else if(path.endsWith("/set_active_tenant")){active=req.postDataJSON().p_tenant_id;payload={tenant_id:active};}
    else if(path.endsWith("/tenant_current_permissions")) payload={all:true};
    else if(path.endsWith("/tenant_effective_modules")) payload=[{module_key:"dashboard",enabled:true}];
    else if(path.endsWith("/platform_current_access")) payload={is_platform_admin:false};
    else if(path.endsWith("/user")) payload=user;
    else if(path.endsWith("/tenant_files")){
      if(req.method()==="POST"){
        const input=req.postDataJSON(),row=Array.isArray(input)?input[0]:input;
        assert.equal(row.tenant_id,A,"new file belongs to current selected tenant A");
        assert.equal(row.uploaded_by,user.id);
        stored={...row,status:"reserved",created_at:new Date().toISOString(),object_path:A+"/"+row.id+".pdf"};
        payload=[stored];
      }else{
        const tenant=url.searchParams.get("tenant_id");
        assert.equal(tenant,"eq."+active,"list is filtered to current tenant");
        payload=stored&&stored.tenant_id===active?[stored]:[];
      }
    }else if(path.endsWith("/crm_finalize_tenant_file")){
      assert.equal(req.postDataJSON().p_file_id,stored.id);
      stored.status="ready";payload=stored;
    }else if(path.endsWith("/crm_cancel_tenant_file")){
      assert.equal(req.postDataJSON().p_file_id,stored.id);
      stored=null;payload=true;
    }else if(path.startsWith("/storage/v1/object/authenticated/crm-documents/")){
      assert.equal(active,A);downloads++;contentType="application/pdf";payload="%PDF-qa";
    }else if(path.startsWith("/storage/v1/object/crm-documents")){
      if(req.method()==="POST"){assert.ok(stored);uploads++;payload={Key:stored.object_path};}
      else if(req.method()==="DELETE"){assert.ok(stored);deletes++;payload=[{name:stored.object_path}];}
    }
    await route.fulfill({status,contentType,body:typeof payload==="string"?payload:JSON.stringify(payload),
      headers:{"access-control-allow-origin":"*","content-range":"0-0/1"}});
  });
  const page=await context.newPage();
  await page.goto(base+"/crm/files");
  await page.getByRole("heading",{name:"Archivos privados"}).waitFor();
  await page.locator("#tenant-file-upload").setInputFiles({
    name:"qa.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-QA-file")
  });
  await page.getByRole("button",{name:"Subir documento"}).click();
  await page.waitForTimeout(1200);
  console.log("QA_FILES_UPLOAD",JSON.stringify({uploads,stored,alerts:await page.getByRole("alert").allTextContents(),notices:await page.locator(".notice").allTextContents()}));
  await page.getByText("Documento subido y verificado.").waitFor();
  assert.equal(uploads,1,"Storage upload requested exactly once");
  await page.getByText("qa.pdf",{exact:true}).waitFor();
  await page.getByLabel("Empresa activa").selectOption(B);
  await page.getByText("Todavía no hay documentos disponibles.").waitFor();
  assert.equal(await page.getByText("qa.pdf",{exact:true}).count(),0,"tenant change unmounts A documents");
  await page.getByLabel("Empresa activa").selectOption(A);
  await page.getByText("qa.pdf",{exact:true}).waitFor();
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Descargar"}).click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),"qa.pdf");
  assert.equal(downloads,1,"authenticated Storage download only");
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Eliminar"}).click();
  await page.getByText("Documento eliminado.").waitFor();
  await page.getByText("Todavía no hay documentos disponibles.").waitFor();
  assert.equal(deletes,1,"Storage object removed");
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(width.scroll<=width.viewport+1,"files page fits mobile");
  console.log("PASS: files mobile UI, reservation, upload, finalization, tenant switch isolation, authenticated download and deletion (mocked API).");
}finally{
  if(browser)await browser.close();
  if(server)server.kill();
}
