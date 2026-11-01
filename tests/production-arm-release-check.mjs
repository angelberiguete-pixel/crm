// Confirms the real pre-existing public domain received the ARM release,
// rather than merely proving that CI can build the repository.
const base=process.env.CRM_PRODUCTION_URL||"https://crm-revenue-os.vercel.app";
const expected="Family Power ARM inside the shared CRM — release 20261101";
const url=new URL("/family-power-arm-release-20261101.txt",base);
let confirmed=false;
for(let attempt=1;attempt<=18;attempt++){
 try{
  const response=await fetch(url,{
   redirect:"follow",
   headers:{"Cache-Control":"no-cache","User-Agent":"family-power-arm-release-verification"},
   signal:AbortSignal.timeout(12000)
  });
  if(response.ok){
   const body=await response.text();
   if(body.trim()===expected){
    console.log("VERIFIED: published Family Power ARM asset at "+response.url);
    confirmed=true;break;
   }
  }
  console.log("Waiting for deployment: attempt "+attempt+" HTTP "+response.status);
 }catch(e){console.log("Deploy check "+attempt+" retry: "+String(e));}
 if(attempt<18)await new Promise(resolve=>setTimeout(resolve,10000));
}
if(!confirmed)throw new Error("The new ARM build could not be verified on the original CRM domain.");
