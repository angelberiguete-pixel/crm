/** Server-only Ollama inference adapter. Never import from client components. */
import "server-only";

export type PrivateAiMessage={role:"system"|"user"|"assistant";content:string};
export type PrivateAiResult={text:string;model:string};

function privateConfig(){
 const endpoint=process.env.ARM_OLLAMA_URL;
 const model=process.env.ARM_OLLAMA_MODEL;
 const token=process.env.ARM_OLLAMA_TOKEN;
 if(!endpoint||!model)throw new Error("Private ARM AI is not configured");
 const url=new URL(endpoint);
 if(url.protocol!=="https:"&&!(url.protocol==="http:"&&["127.0.0.1","localhost","::1"].includes(url.hostname)))
  throw new Error("Private ARM AI requires HTTPS or loopback");
 if(url.username||url.password||url.search||url.hash)throw new Error("Invalid Ollama endpoint");
 if(!/^[a-zA-Z0-9._:/-]{1,128}$/.test(model))throw new Error("Invalid Ollama model");
 return {url,model,token};
}

export async function privateArmCompletion(messages:readonly PrivateAiMessage[],signal?:AbortSignal):Promise<PrivateAiResult>{
 const {url,model,token}=privateConfig();
 if(!messages.length||messages.length>20||messages.some(m=>!["system","user","assistant"].includes(m.role)||!m.content||m.content.length>12000))
  throw new Error("Invalid private AI messages");
 const target=new URL(url.toString());
 target.pathname=target.pathname.replace(/\\/$/,"")+"/api/chat";
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30000);
 const cancel=()=>controller.abort();signal?.addEventListener("abort",cancel,{once:true});
 try{
  const response=await fetch(target,{method:"POST",headers:{"content-type":"application/json",...(token?{"authorization":`Bearer ${token}`}:{})},body:JSON.stringify({model,messages,stream:false,options:{temperature:0.2,num_predict:700}}),cache:"no-store",signal:controller.signal,redirect:"error"});
  if(!response.ok)throw new Error(`Private AI unavailable (HTTP ${response.status})`);
  const data:unknown=await response.json();
  const text=(data as {message?:{content?:unknown}})?.message?.content;
  if(typeof text!=="string"||!text.trim())throw new Error("Empty private AI response");
  return {text:text.slice(0,16000),model};
 }finally{clearTimeout(timeout);signal?.removeEventListener("abort",cancel);}
}
