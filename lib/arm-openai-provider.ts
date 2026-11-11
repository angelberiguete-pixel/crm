/** Server-side OpenAI Responses inference provider; no CRM actions or public routes. */
export type ArmAiMessage={role:"system"|"user"|"assistant";content:string};
export type ArmAiResponse={text:string;model:string;inputTokens:number|null;outputTokens:number|null};
export async function openAiArmCompletion(messages:readonly ArmAiMessage[],signal?:AbortSignal):Promise<ArmAiResponse>{
 if(typeof window!=="undefined")throw new Error("Server-only ARM provider");
 const key=process.env.OPENAI_API_KEY,model=process.env.ARM_OPENAI_MODEL;
 if(!key||!model)throw new Error("OpenAI ARM provider is not configured");
 if(!/^[a-zA-Z0-9._-]{2,100}$/.test(model))throw new Error("Invalid ARM model");
 if(!messages.length||messages.length>20||messages.some(m=>!["system","user","assistant"].includes(m.role)||!m.content.trim()||m.content.length>12000))throw new Error("Invalid ARM messages");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),25000);
 const cancel=()=>controller.abort();signal?.addEventListener("abort",cancel,{once:true});
 try{
  const response=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",headers:{"authorization":`Bearer ${key}`,"content-type":"application/json"},
   body:JSON.stringify({model,store:false,input:messages.map(m=>({role:m.role,content:m.content})),max_output_tokens:650}),
   cache:"no-store",signal:controller.signal,redirect:"error"
  });
  if(!response.ok)throw new Error(`ARM inference failed (HTTP ${response.status})`);
  const data:unknown=await response.json();
  const result=data as {status?:string;output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>;usage?:{input_tokens?:number;output_tokens?:number}};
  if(result.status!=="completed")throw new Error("ARM inference did not complete");
  const text=(result.output??[]).flatMap(item=>item.type==="message"?(item.content??[]):[]).filter(c=>c.type==="output_text"&&typeof c.text==="string").map(c=>c.text).join("\n");
  if(!text.trim())throw new Error("ARM inference returned no text");
  return {text:text.slice(0,16000),model,inputTokens:result.usage?.input_tokens??null,outputTokens:result.usage?.output_tokens??null};
 }finally{clearTimeout(timeout);signal?.removeEventListener("abort",cancel);}
}
