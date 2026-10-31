// Rendering check using built Next.js output, not just string matching.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3169";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3169","-H","127.0.0.1"],{stdio:["ignore","ignore","inherit"]});
let browser;
try {
 let ready=false;
 for(let i=0;i<60;i++){try{ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,500))}
 assert.ok(ready,"test server ready");
 browser=await chromium.launch({headless:true,...(process.env.CRM_TEST_CHROMIUM_PATH?{executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{channel:"chromium"})});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.goto(base+"/login");
 const logo=page.getByRole("img",{name:"LOOK SOCIAL MEDIA"});
 await logo.waitFor({state:"visible"});
 const img=await logo.evaluate(async element=>{
   try{await element.decode()}catch{}
   return {complete:element.complete,naturalWidth:element.naturalWidth,naturalHeight:element.naturalHeight,src:element.getAttribute("src")};
 });
 assert.ok(img.complete&&img.naturalWidth>0&&img.naturalHeight>0,JSON.stringify(img));
 assert.equal(img.src,"/look-social-media-logo.svg");
 const loading=await page.evaluate(()=>{
   const div=document.createElement("div");div.className="loading";div.textContent="Cargando…";document.body.appendChild(div);
   const background=getComputedStyle(div,"::before").backgroundImage;
   div.remove();return background;
 });
 assert.equal(loading,"none","neutral loading must not leak Look branding into another client workspace");
 console.log("PASS Android mobile: original Look logo remains on its own login and generic loading stays brand-neutral.");
} finally {if(browser)await browser.close();if(server)server.kill()}
