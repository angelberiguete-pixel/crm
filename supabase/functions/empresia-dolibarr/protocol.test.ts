/// <reference lib="deno.ns" />
import {
  dolibarrBaseUrl, isUuid, publicProduct, listDolibarrProducts
} from "./dolibarr-protocol.ts";

Deno.test("only server-owned secure Dolibarr API URLs are eligible", () => {
  const ok="https://erp.empresia.example.com/api/index.php";
  if(dolibarrBaseUrl(ok)!==ok)throw Error("secure url rejected");
  const bad=[
    "http://erp.example.com/api/index.php",
    "https://127.0.0.1/api/index.php",
    "https://localhost/api/index.php",
    "https://192.168.1.2/api/index.php",
    "https://[::1]/api/index.php",
    "https://admin:pass@erp.example.com/api/index.php",
    "https://erp.example.com:8443/api/index.php",
    "https://erp.example.com/admin",
    "https://erp.example.com/api/index.php?api_key=xyz",
    "https://erp.example.com/api/index.php#admin",
    "https://erp.example.com/foo/../api/index.php",
    "https://server.internal/api/index.php",
  ];
  for(const u of bad)if(dolibarrBaseUrl(u)!==null)throw Error("unsafe url accepted: "+u);
});

Deno.test("UUID checks reject arbitrary caller tenant values", () => {
  if(!isUuid("c1f2433e-e241-4eef-9999-323f483cac92"))throw Error("uuid rejected");
  if(isUuid("family-power")||isUuid("not-uuid"))throw Error("unsafe tenant");
});

Deno.test("sanitizes Dolibarr product data and strips private fields", () => {
  const p=publicProduct({id:123,ref:"A-1",label:"Panel Solar",price:"197.12349",
    token:"should-not-leak",email:"a@example.com",purchase_price:5});
  if(!p||p.id!=="123"||p.price!==197.1235||"token" in p||"email" in p)
    throw Error("product privacy violation");
  if(publicProduct({id:"x",ref:"bad",label:"x"})!==null)throw Error("bad id allowed");
});

Deno.test("server uses GET, DOLAPIKEY header and strict request origin without redirects", async() => {
  let calls=0;
  const key="private-server-side-key-only";
  const products=await listDolibarrProducts("https://erp.example.com/api/index.php",key,
    {page:0,limit:2},async(input,init)=>{
      calls++;
      const u=new URL(String(input));
      if(u.pathname!=="/api/index.php/products"||u.searchParams.get("limit")!=="2"||
        init?.method!=="GET"||init?.redirect!=="error"||
        new Headers(init?.headers).get("DOLAPIKEY")!==key)
        throw Error("unsafe upstream request");
      return new Response(JSON.stringify([
        {id:1,ref:"EA-001",label:"Inversor",price:80,secret:"hidden"},
        {id:2,ref:"EA-002",label:"Batería",price:125.5}
      ]),{status:200,headers:{"content-type":"application/json"}});
    });
  if(calls!==1||products.length!==2||Object.keys(products[0]).join(",")!=="id,ref,label,price")
    throw Error("unexpected normalized results");
});

Deno.test("provider permission errors never expose upstream details",async()=>{
  let failed=false;
  try{
    await listDolibarrProducts("https://erp.example.com/api/index.php","secret-value",
      {page:0,limit:1},async()=>new Response("API private stack traces and secrets",{status:403}));
  }catch(e){failed=(e as Error).message==="provider_permission_denied";}
  if(!failed)throw Error("provider error not sanitized");
});

Deno.test("invalid pagination and provider response shape are fail closed",async()=>{
  for(const limit of [0,26,1.4]){
    let blocked=false;
    try{
      await listDolibarrProducts("https://erp.example.com/api/index.php","secret-value",
        {page:0,limit},async()=>new Response("[]"));
    }catch(e){blocked=(e as Error).message==="invalid_pagination";}
    if(!blocked)throw Error("pagination allowed: "+limit);
  }
  let shapeBlocked=false;
  try{
    await listDolibarrProducts("https://erp.example.com/api/index.php","secret-value",
      {page:0,limit:1},async()=>new Response('{"error":"not an array"}',{status:200}));
  }catch(e){shapeBlocked=(e as Error).message==="provider_invalid_products";}
  if(!shapeBlocked)throw Error("invalid product data accepted");
});
