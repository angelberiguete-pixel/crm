"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Props = {url:string; publishableKey:string};
type Account = { userId:string; tenantId:string; slug:string; token:string; logout:()=>Promise<void> };
type Result = { label:string; passed:boolean; detail:string };

function sessionClient(url:string,key:string) {
  return createClient(url,key,{
    auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
  });
}

async function mcp(token:string,method:string,params?:Record<string,unknown>) {
  const response=await fetch("/api/mcp",{
    method:"POST",cache:"no-store",redirect:"error",
    headers: {
      Authorization:"Bearer "+token,
      "Content-Type":"application/json",
      Accept:"application/json, text/event-stream",
      ...(method==="initialize"?{}:{"MCP-Protocol-Version":"2025-11-25"})
    },
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,...(params?{params}:{})})
  });
  if(!response.ok)throw Error("Servidor MCP HTTP "+response.status);
  const body=await response.json();
  if(body.error)throw Error("MCP: "+body.error.message);
  return body.result;
}

async function login(url:string,key:string,email:string,password:string,expectedSlug:string):Promise<Account> {
  const client=sessionClient(url,key);
  const { data,error }=await client.auth.signInWithPassword({email,password});
  if(error||!data.session||!data.user)throw Error("No se pudo autenticar la cuenta de prueba de "+expectedSlug);
  const membership=await client.rpc("list_my_tenants");
  if(membership.error)throw Error("No se pudo comprobar la empresa activa de "+expectedSlug);
  const active=(membership.data??[]).filter((item:{is_active:boolean})=>item.is_active===true);
  if(active.length!==1||active[0].tenant_slug!==expectedSlug)throw Error("La cuenta de "+expectedSlug+" debe tener esa empresa seleccionada como única activa.");
  return {logout:async()=>{await client.auth.signOut({scope:"local"});}, userId:data.user.id,tenantId:active[0].tenant_id,slug:active[0].tenant_slug,token:data.session.access_token};
}

async function toolCall(token:string,name:string,tenantId?:string) {
  const args=tenantId?{tenant_id:tenantId,limit:1}:{};
  const reply=await mcp(token,"tools/call",{name,arguments:args});
  const content=reply?.content?.[0]?.text;
  const data=content?JSON.parse(content):null;
  return { denied:reply?.isError===true, data };
}

export default function McpPilotTest({url,publishableKey}:Props) {
  const [familyEmail,setFamilyEmail]=useState("");
  const [familyPassword,setFamilyPassword]=useState("");
  const [otherEmail,setOtherEmail]=useState("");
  const [otherPassword,setOtherPassword]=useState("");
  const [running,setRunning]=useState(false);
  const [results,setResults]=useState<Result[]>([]);
  const [error,setError]=useState("");
  const [passed,setPassed]=useState(false);

  async function run(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRunning(true);setResults([]);setPassed(false);setError("");
    const sessions:Account[]=[];
    const checks:Result[]=[];
    function record(label:string,passed:boolean,detail:string){
      checks.push({label,passed,detail});
      if(!passed)throw Error("Prueba fallida: "+label);
    }
    try {
      if(familyEmail.trim().toLowerCase()===otherEmail.trim().toLowerCase())throw Error("Usa dos cuentas diferentes.");
      const family=await login(url,publishableKey,familyEmail,familyPassword,"family-power");
      sessions.push(family);
      const other=await login(url,publishableKey,otherEmail,otherPassword,"sublimaciones-lazala");
      sessions.push(other);
      // Clear passwords immediately after authentication.
      setFamilyPassword("");setOtherPassword("");
      record("Dos usuarios distintos",family.userId!==other.userId,"Identidades independientes");
      record("Dos empresas activas distintas",family.tenantId!==other.tenantId,"Contextos separados");

      for (const account of sessions) {
        const greeting=await mcp(account.token,"initialize",{
          protocolVersion:"2025-11-25",capabilities:{},
          clientInfo:{name:"family-power-preview-pilot",version:"0.1.0"}
        });
        record("Conexión MCP "+account.slug,greeting.protocolVersion==="2025-11-25","Protocolo verificado");
        const catalog=await mcp(account.token,"tools/list",{});
        record("Herramientas autorizadas "+account.slug,
          (catalog.tools??[]).some((item:{name:string})=>item.name==="crm.list_contacts"),
          "La consulta de contactos está habilitada");
        const context=await toolCall(account.token,"crm.get_workspace_context");
        record("Empresa seleccionada "+account.slug,
          !context.denied&&context.data?.company?.tenant_id===account.tenantId,
          "El servidor reconoce el usuario y su empresa");
      }

      const a=await toolCall(family.token,"crm.list_contacts",family.tenantId);
      record("Family Power: consulta propia",!a.denied &&
        a.data?.tenant_id===family.tenantId &&
        Array.isArray(a.data.records) &&
        a.data.records.every((r:{tenant_id:string})=>r.tenant_id===family.tenantId),
        "Lectura limitada a Family Power");

      const b=await toolCall(other.token,"crm.list_contacts",other.tenantId);
      record("Lazala: consulta propia",!b.denied &&
        b.data?.tenant_id===other.tenantId &&
        Array.isArray(b.data.records) &&
        b.data.records.every((r:{tenant_id:string})=>r.tenant_id===other.tenantId),
        "Lectura limitada a Sublimaciones Lazala");

      const blockedA=await toolCall(family.token,"crm.list_contacts",other.tenantId);
      record("Family Power → Lazala: denegado",blockedA.denied===true,"Sin acceso a otra empresa");
      const blockedB=await toolCall(other.token,"crm.list_contacts",family.tenantId);
      record("Lazala → Family Power: denegado",blockedB.denied===true,"Sin acceso a Family Power");
      setPassed(true);
    } catch(err) {
      setError(err instanceof Error?err.message:"La verificación no pudo completarse.");
    } finally {
      setResults(checks);
      // Destroy in-memory sessions without signing out other browser sessions.
      await Promise.allSettled(sessions.map(a=>a.logout()));
      setFamilyPassword("");setOtherPassword("");setRunning(false);
    }
  }

  return <main style={{margin:"0 auto",maxWidth:750,padding:"32px 20px",fontFamily:"system-ui, sans-serif"}}>
    <p style={{fontSize:12,letterSpacing:1.2,textTransform:"uppercase"}}>Diagnóstico técnico · Vista previa</p>
    <h1>Prueba de aislamiento MCP</h1>
    <p>Este panel verifica con dos cuentas de prueba que Family Power y Sublimaciones Lazala pueden consultar sus propios datos, pero no los de la otra empresa. Solo se muestran los resultados de seguridad; nunca mostramos los contactos.</p>
    <p><strong>Atención:</strong> este entorno de código usa la base de datos general. Usa exclusivamente cuentas de prueba autorizadas, no cuentas personales. Las contraseñas no se guardan y las sesiones se descartan al finalizar.</p>
    <form onSubmit={run} autoComplete="off" style={{display:"grid",gap:16}}>
      <fieldset disabled={running} style={{padding:16,border:"1px solid #999",borderRadius:8}}>
        <legend>Cuenta de prueba · Family Power</legend>
        <label style={{display:"block",marginBottom:6}}>Correo autorizado</label>
        <input type="email" value={familyEmail} onChange={e=>setFamilyEmail(e.target.value)} autoComplete="off" required style={{width:"100%",padding:9,marginBottom:12}}/>
        <label style={{display:"block",marginBottom:6}}>Contraseña</label>
        <input type="password" value={familyPassword} onChange={e=>setFamilyPassword(e.target.value)} autoComplete="new-password" required style={{width:"100%",padding:9}}/>
      </fieldset>
      <fieldset disabled={running} style={{padding:16,border:"1px solid #999",borderRadius:8}}>
        <legend>Cuenta de prueba · Sublimaciones Lazala</legend>
        <label style={{display:"block",marginBottom:6}}>Correo autorizado</label>
        <input type="email" value={otherEmail} onChange={e=>setOtherEmail(e.target.value)} autoComplete="off" required style={{width:"100%",padding:9,marginBottom:12}}/>
        <label style={{display:"block",marginBottom:6}}>Contraseña</label>
        <input type="password" value={otherPassword} onChange={e=>setOtherPassword(e.target.value)} autoComplete="new-password" required style={{width:"100%",padding:9}}/>
      </fieldset>
      <button type="submit" disabled={running} style={{padding:"13px 16px",background:"#161e34",color:"#fff",border:0,borderRadius:8,fontWeight:600}}>
        {running?"Verificando…":"Ejecutar prueba real de aislamiento"}
      </button>
    </form>
    {error&&<p role="alert" style={{padding:12,border:"1px solid #be123c",marginTop:16}}>{error}</p>}
    {results.length>0&&<section aria-live="polite" style={{marginTop:18}}>
      <h2>{passed?"Todas las verificaciones aprobadas":"Resultados parciales; NO aprobado"}</h2>
      <ul>{results.map((r,i)=><li key={i} style={{padding:6}}>
        <strong>{r.passed?"✓":"✗"} {r.label}</strong> — {r.detail}
      </li>)}</ul>
    </section>}
  </main>;
}
