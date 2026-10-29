// Public commercial sandbox mobile fixture. No login, paid APIs, external providers or customer data.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3189";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,
 ["node_modules/next/dist/bin/next","start","-p","3189","-H","127.0.0.1"],
 {stdio:["ignore","ignore","inherit"]});
let browser;
try{
 let ready=false;
 for(let i=0;i<60;i++){try{ready=(await fetch(base+"/demo/look-digital-staff",{signal:AbortSignal.timeout(1100)})).ok;if(ready)break;}catch{}
 await new Promise(r=>setTimeout(r,450));}
 assert.ok(ready,"demo page must be available");
 browser=await chromium.launch({headless:true,channel:"chromium"});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const outbound=[];
 page.on("request",request=>{if(!request.url().startsWith(base))outbound.push(request.url());});
 await page.goto(base+"/demo/look-digital-staff",{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:/Tu empresa\. Tu CRM/}).waitFor();
 await page.getByLabel("Nombre comercial").fill("Clínica Horizonte");
 await page.getByRole("button",{name:/Simular borrador/}).click();
 await page.getByText("Gracias por escribir a Clínica Horizonte",{exact:false}).waitFor();
 await page.getByRole("button",{name:"Simular aprobación"}).click();
 await page.getByText(/No se envió ni registró nada/).waitFor();
 await page.getByLabel("Tipo de consulta").selectOption("factura");
 await page.getByRole("button",{name:/Simular borrador/}).click();
 await page.getByText(/un responsable verificará el documento/).waitFor();
 await page.getByRole("button",{name:/A medida/}).click();
 await page.getByText("Look Digital Staff — A medida",{exact:false}).waitFor();
 const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
 assert.ok(widths.scroll<=widths.inner+2,JSON.stringify(widths));
 assert.equal(outbound.length,0,"demo must never contact third party APIs");
 console.log("PASS: public 390px sales demo with 4 profiles, local approval, no network calls or payments.");
}finally{if(browser)await browser.close();if(server)server.kill("SIGTERM");}
