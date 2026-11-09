"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Plus, Save, Sparkles, RefreshCw, ShieldCheck, ClipboardCopy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import DigitalEmployeeReviewQueue from "@/components/digital-employee-review-queue";
import CrmAgentAdvicePanel from "@/components/crm-agent-advice-panel";
import DigitalEmployeeChannelBinding from "@/components/digital-employee-channel-binding";
import { EMPLOYEE_ROLES, normalizeEmployeeKnowledge, validateEmployeeKnowledge,
  type EmployeeRole, type EmployeeKnowledge } from "@/lib/digital-employee";

type AgentRow = {
  id:string; name:string; purpose:string|null; status:string;
  approval_mode:string; settings:Record<string,unknown>; created_at:string;
};
const fields: Array<{key:keyof EmployeeKnowledge;label:string;hint:string;rows?:number}>=[
  {key:"business_name",label:"Nombre del negocio",hint:"Nombre comercial real"},
  {key:"services",label:"Servicios y productos comprobados",hint:"Lista y descripción verificadas",rows:4},
  {key:"hours",label:"Horarios",hint:"Si no están verificados, déjalo vacío"},
  {key:"location",label:"Ubicación",hint:"Dirección o área de servicio"},
  {key:"prices",label:"Precios y condiciones autorizados",hint:"Si dependen de una evaluación, indícalo",rows:3},
  {key:"booking",label:"Proceso de citas",hint:"Cómo solicitar una cita; no inventar disponibilidad",rows:2},
  {key:"faq",label:"Preguntas frecuentes comprobadas",hint:"Información oficial del negocio",rows:4},
  {key:"human_contact",label:"Transferencia a persona",hint:"Cómo contactar al encargado autorizado"},
];
const fresh=():EmployeeKnowledge=>normalizeEmployeeKnowledge({});

export default function DigitalEmployeeStudio(){
  const tenant=useActiveTenant(),tenantId=tenant?.tenant_id??null;
  const currentTenant=useRef(tenantId);
  currentTenant.current=tenantId;
  const permitted=["owner","admin"].includes(tenant?.membership_role??"");
  const [agents,setAgents]=useState<AgentRow[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [name,setName]=useState("Recepcionista IA");
  const [role,setRole]=useState<EmployeeRole>("recepcionista");
  const [knowledge,setKnowledge]=useState<EmployeeKnowledge>(fresh);
  const [sample,setSample]=useState("Hola, quisiera saber qué servicios ofrecen y cómo puedo solicitar una cita.");
  const [draft,setDraft]=useState("");
  const [insight,setInsight]=useState<{intent:string;next_step:string;requires_human:boolean;estimated_cost_micros:number}|null>(null);
  const [busy,setBusy]=useState(false),[testing,setTesting]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [reload,setReload]=useState(0);
  const active=useMemo(()=>agents.find(x=>x.id===selectedId)??null,[selectedId,agents]);

  useEffect(()=>{
    setAgents([]);setSelectedId(null);setRole("recepcionista");setKnowledge(fresh());
    setName("Recepcionista IA");setDraft("");setInsight(null);setError("");setNotice("");
  },[tenantId]);
  useEffect(()=>{
    if(!tenantId||!permitted){setLoading(false);return;}
    let current=true;setLoading(true);
    (async()=>{
      const response=await supabase.from("ai_agents")
        .select("id,name,purpose,status,approval_mode,settings,created_at")
        .eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100);
      if(!current)return;
      if(response.error)setError("No se pudieron cargar los empleados digitales: "+response.error.message);
      else setAgents(response.data as AgentRow[]??[]);
      setLoading(false);
    })().catch(()=>{if(current){setError("No se pudieron cargar los agentes.");setLoading(false);}});
    return()=>{current=false;};
  },[tenantId,permitted,reload]);
  function selectAgent(agent:AgentRow){
    const settings=agent.settings??{},kind=settings.role;
    if(["tecnico","seguimiento","supervision"].includes(String(settings.arm_role??""))){
      setSelectedId(null);
      setError("Este perfil ARM permanece en preparación.");
      return;
    }
    setSelectedId(agent.id);
    setRole(kind==="vendedor"||kind==="secretaria"||kind==="cobros"?kind:"recepcionista");
    setName(agent.name);
    setKnowledge(normalizeEmployeeKnowledge(settings.knowledge));
    setDraft("");setInsight(null);setError("");setNotice("");
  }
  function newAgent(){
    setSelectedId(null);setName("Recepcionista IA");setRole("recepcionista");
    setKnowledge(fresh());setDraft("");setInsight(null);setError("");setNotice("");
  }
  const updateKnowledge=(key:keyof EmployeeKnowledge,value:string)=>
    setKnowledge(prev=>({...prev,[key]:value}));

  async function save(e:FormEvent){
    e.preventDefault();
    if(!tenantId||!permitted||busy)return;
    const originalTenant=tenantId;
    const invalid=validateEmployeeKnowledge(knowledge);
    if(invalid){setError("Completa el nombre del negocio y los servicios verificados.");return;}
    if(name.trim().length<3||name.trim().length>90){setError("Introduce un nombre válido para el agente.");return;}
    setBusy(true);setError("");setNotice("");
    const payload={
      name:name.trim(),purpose:EMPLOYEE_ROLES[role].purpose,
      status:"draft",approval_mode:"human_approval",
      allowed_tools:[] as string[],
      system_prompt:EMPLOYEE_ROLES[role].instructions,
      model_provider:"openai",model_name:"server-configured",
      max_output_tokens:450,
      settings:{role,knowledge:normalizeEmployeeKnowledge(knowledge)},
    };
    try{
      const query=selectedId?
        supabase.from("ai_agents").update(payload).eq("id",selectedId).eq("tenant_id",tenantId).select("id").single():
        supabase.from("ai_agents").insert({...payload,tenant_id:tenantId}).select("id").single();
      const result=await query;
      if(result.error)throw result.error;
      if(currentTenant.current!==originalTenant)return;
      if(!result.data?.id)throw new Error("No se confirmó el guardado.");
      setSelectedId(result.data.id);setNotice("Configuración guardada. El empleado sigue en borrador y no envía mensajes.");
      setReload(v=>v+1);
    }catch(e){if(currentTenant.current===originalTenant)setError("Error al guardar: "+(e instanceof Error?e.message:"Intenta nuevamente."));}
    finally{if(currentTenant.current===originalTenant)setBusy(false);}
  }
  async function generate(e:FormEvent){
    e.preventDefault();
    if(!tenantId||!permitted||!selectedId||testing)return;
    const originalTenant=tenantId;
    setTesting(true);setDraft("");setInsight(null);setError("");setNotice("");
    try{
      const response=await supabase.functions.invoke("ai-employee-draft",{
        body:{tenant_id:tenantId,agent_id:selectedId,request_id:crypto.randomUUID(),question:sample.trim()}
      });
      if(currentTenant.current!==originalTenant)return;
      if(response.error||response.data?.ok!==true)throw new Error(String(response.data?.error??"El proveedor de IA no está conectado o no respondió."));
      if(typeof response.data.draft!=="string")throw new Error("Respuesta no verificada.");
      setDraft(response.data.draft);
      setInsight({
        intent:String(response.data.intent??"otro"),
        next_step:String(response.data.next_step??"transferir_humano"),
        requires_human:response.data.requires_human===true,
        estimated_cost_micros:Number(response.data.estimated_cost_micros??0),
      });
      setNotice("Borrador generado por IA y registrado para revisión. No se envió ningún mensaje.");
    }catch(e){if(currentTenant.current===originalTenant)setError("No se pudo generar el borrador: "+(e instanceof Error?e.message:"Intenta más tarde."));}
    finally{if(currentTenant.current===originalTenant)setTesting(false);}
  }

  if(!tenant)return <main className="content"><p>Selecciona una empresa antes de configurar empleados digitales.</p></main>;
  if(!permitted)return <main className="content"><div className="notice" role="alert">La administración de agentes digitales requiere acceso propietario o administrador de la empresa.</div></main>;

  if(tenant.tenant_slug==="family-power"){
    const armRoles=[
      {key:"recepcion",name:"Recepción digital",legacy:"recepcionista"},
      {key:"ventas",name:"Ventas",legacy:"vendedor"},
      {key:"tecnico",name:"Asesor técnico",legacy:"tecnico"},
      {key:"seguimiento",name:"Seguimiento",legacy:"seguimiento"},
      {key:"supervision",name:"Supervisor",legacy:"supervisor"}
    ];
    const getArmAgent=(item:typeof armRoles[number])=>agents.find(agent=>{
      const settings=agent.settings??{};
      return settings.arm_role===item.key||settings.role===item.legacy||agent.name===item.name;
    });
    return <main className="content" style={{maxWidth:1020,margin:"0 auto"}}>
      <header className="topbar"><h1>Agentes</h1>
        <div className="top-actions"><Link className="button" href="/crm/arm">Volver</Link>
          <button className="button" type="button" onClick={()=>setReload(v=>v+1)}><RefreshCw size={16}/> Actualizar</button>
        </div>
      </header>
      {error&&<div className="notice" role="alert">{error}</div>}
      {notice&&<div className="notice" role="status">{notice}</div>}
      <section className="card">
        <div className="topbar"><h2>Equipo digital</h2><span className="pill">{loading?"…":agents.length+" registrados"}</span></div>
        <div className="stack gap-12">
          {armRoles.map(item=>{
            const agent=getArmAgent(item);
            const editable=agent&&!["tecnico","seguimiento","supervision"].includes(String(agent.settings?.arm_role??""));
            return <div className="priority-item" key={item.key} style={{display:"flex",alignItems:"center",gap:12,justifyContent:"space-between",flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Bot size={19}/><div><strong>{item.name}</strong><small className="muted" style={{display:"block"}}>
                  {agent?(agent.status==="draft"?"Borrador":agent.status):"Pendiente"}</small></div>
              </div>
              {editable&&<button type="button" className="button small" onClick={()=>selectAgent(agent)}>Configurar</button>}
            </div>;
          })}
        </div>
      </section>
      {selectedId&&active&&<section className="card section-gap" style={{marginTop:16}}>
        <div className="topbar"><h2>{active.name}</h2><button className="button" type="button" onClick={()=>setSelectedId(null)}>Cerrar</button></div>
        <form onSubmit={save} className="stack gap-12">
          <label>Nombre interno<input value={name} maxLength={90} minLength={3} required onChange={e=>setName(e.target.value)}/></label>
          {fields.filter(f=>["business_name","services"].includes(f.key)).map(f=><label key={f.key}>{f.label}
            {f.rows?<textarea value={knowledge[f.key]} rows={3} placeholder={f.hint} onChange={e=>updateKnowledge(f.key,e.target.value)}/>:
             <input value={knowledge[f.key]} placeholder={f.hint} onChange={e=>updateKnowledge(f.key,e.target.value)}/>}
          </label>)}
          <details><summary style={{cursor:"pointer",fontWeight:650}}>Otros datos del negocio</summary>
            <div className="stack gap-12" style={{paddingTop:12}}>
              {fields.filter(f=>!["business_name","services"].includes(f.key)).map(f=><label key={f.key}>{f.label}
                {f.rows?<textarea value={knowledge[f.key]} rows={2} placeholder={f.hint} onChange={e=>updateKnowledge(f.key,e.target.value)}/>:
                 <input value={knowledge[f.key]} placeholder={f.hint} onChange={e=>updateKnowledge(f.key,e.target.value)}/>}
              </label>)}
            </div>
          </details>
          <button type="submit" className="button primary" disabled={busy}><Save size={16}/> {busy?"Guardando…":"Guardar borrador"}</button>
        </form>
      </section>}
      {selectedId&&active&&<section className="card section-gap" aria-label="Prueba segura de IA para Family Power" style={{marginTop:16}}>
        <div className="eyebrow">Family Power · Laboratorio privado</div>
        <h2>Probar respuesta con OpenAI</h2>
        <div className="notice"><ShieldCheck size={17}/> Esta prueba genera únicamente un borrador interno sujeto a aprobación humana. No contacta clientes ni envía WhatsApp.</div>
        <p className="muted">Primero guarda los servicios reales y verificados del negocio. La cuenta debe ser propietaria o administradora. No introduzcas información personal de clientes.</p>
        {validateEmployeeKnowledge(knowledge)&&
          <div className="notice" role="status">Para habilitar la prueba, completa el nombre de Family Power y los servicios verificados, luego pulsa «Guardar borrador».</div>}
        <form className="stack gap-12" onSubmit={generate}>
          <label>Consulta ficticia de prueba
            <textarea value={sample} minLength={3} maxLength={1200} required rows={3}
              onChange={e=>setSample(e.target.value)}/>
          </label>
          <button type="submit" className="button primary"
            disabled={testing||busy||!!validateEmployeeKnowledge(knowledge)||sample.trim().length<3}>
            <Sparkles size={16}/> {testing?"Consultando OpenAI…":"Generar borrador para aprobación"}
          </button>
        </form>
        {draft&&<div className="card section-gap" role="status" style={{marginTop:12}}>
          <strong>Respuesta de IA: pendiente de revisión humana</strong>
          {insight&&<p className="muted">Intención: {insight.intent} · Siguiente paso: {insight.next_step.replaceAll("_"," ")} · Coste estimado: US${(insight.estimated_cost_micros/1000000).toFixed(4)}.</p>}
          <p style={{whiteSpace:"pre-wrap"}}>{draft}</p>
          <p className="muted">El borrador se registra en la bandeja de aprobaciones. No se envió ni aprobó automáticamente.</p>
        </div>}
      </section>}
      {tenantId&&<DigitalEmployeeReviewQueue tenantId={tenantId} compact/>}
    </main>;
  }
  return <main className="content" style={{maxWidth:1300,margin:"0 auto"}}>
    <header className="topbar">
      <div><div className="eyebrow">{tenant.tenant_slug==="family-power"?"Family Power · ARM":"Look Social Media · Digital Staff"}</div>
<h1>{tenant.tenant_slug==="family-power"?"Agentes digitales":"Empleados digitales con IA"}</h1>{tenant.tenant_slug!=="family-power"&&<p className="muted">{tenant.tenant_name} · Configuración por empresa</p>}</div>
      <div className="top-actions">
        <Link className="button" href="/crm">Volver al CRM</Link>
        <button type="button" className="button" onClick={()=>setReload(v=>v+1)}><RefreshCw size={15}/> Actualizar</button>
      </div>
    </header>
    <div className="notice" style={{marginBottom:16}}><ShieldCheck size={17}/> {tenant.tenant_slug==="family-power"?"Borradores con revisión humana. Sin envíos automáticos.":"Etapa piloto: los agentes preparan borradores para revisión humana. No hay envíos automáticos, llamadas, reservas confirmadas ni acceso autónomo a herramientas. Para generar respuestas con IA se requiere configurar de forma segura el proveedor del servidor."}</div>
    {error&&<div className="notice" role="alert" style={{marginBottom:16}}>{error}</div>}
    {notice&&<div className="notice" role="status" style={{marginBottom:16}}>{notice}</div>}
    <div className="grid two-col">
      <section className="card">
        <div className="topbar"><h2>Empleados de esta empresa</h2><button className="button small" type="button" onClick={newAgent}><Plus size={15}/> Nuevo</button></div>
        {loading?<p>Cargando empleados…</p>:agents.length===0?<div className="empty">Todavía no hay empleados digitales. Crea el primero con información comprobada del negocio.</div>:
        <div className="stack gap-12">{agents.map(agent=><button type="button" key={agent.id}
          onClick={()=>selectAgent(agent)} className={"button "+(selectedId===agent.id?"primary":"")} style={{textAlign:"left",justifyContent:"flex-start"}}>
          <Bot size={16}/> {agent.name} · {agent.status==="draft"?"Borrador":agent.status}
        </button>)}</div>}
        <p className="muted" style={{marginTop:16}}>Cuatro roles configurables en modo borrador; voz y acciones reales requieren proveedores y verificaciones independientes.</p>
      </section>
      <section className="card">
        <h2>{active?"Configurar empleado":"Crear empleado digital"}</h2>
        <form onSubmit={save} className="stack gap-12">
          <label>Tipo de empleado<select value={role} onChange={e=>{const val=e.target.value as EmployeeRole;setRole(val);if(!selectedId)setName(EMPLOYEE_ROLES[val].label);setDraft("");}}>
            <option value="recepcionista">Recepcionista IA</option><option value="vendedor">Asesor comercial IA</option><option value="secretaria">Secretaría administrativa IA</option><option value="cobros">Asistente de cobros IA</option>
          </select></label>
          <p className="muted">{EMPLOYEE_ROLES[role].purpose}</p>
          <label>Nombre interno<input value={name} maxLength={90} minLength={3} required onChange={e=>setName(e.target.value)}/></label>
          {fields.map(f=><label key={f.key}>{f.label}
            {f.rows?<textarea value={knowledge[f.key]} rows={f.rows} placeholder={f.hint} onChange={e=>updateKnowledge(f.key,e.target.value)} />:
              <input value={knowledge[f.key]} placeholder={f.hint} onChange={e=>updateKnowledge(f.key,e.target.value)}/>}
          </label>)}
          <button className="button primary" type="submit" disabled={busy}><Save size={16}/> {busy?"Guardando…":"Guardar empleado en borrador"}</button>
        </form>
      </section>
    </div>
    <section className="card section-gap" aria-label="Laboratorio de respuesta IA" style={{marginTop:18}}>
      <div className="eyebrow">Prueba controlada · Sin mensajes a clientes</div>
      <h2>Ensayar una conversación</h2>
      <p className="muted">Introduce un escenario ficticio, sin datos personales ni información de clientes. La IA generará un texto para que lo revises. Antes de probar guarda la configuración del empleado.</p>
      <form onSubmit={generate} className="stack gap-12">
        <label>Pregunta de prueba<textarea value={sample} rows={3} maxLength={1200} minLength={3} required onChange={e=>setSample(e.target.value)}/></label>
        <button className="button primary" type="submit" disabled={!selectedId||testing||!sample.trim()||busy}><Sparkles size={16}/> {testing?"Consultando IA…":"Generar borrador con IA"}</button>
      </form>
      {draft&&<div className="card section-gap" style={{marginTop:16}}>
        <div className="eyebrow">Resultado generado · Revisión humana obligatoria</div>
        {insight&&<p className="muted" role="status">Intención detectada: <strong>{insight.intent}</strong> · Próximo paso sugerido: <strong>{insight.next_step.replaceAll("_"," ")}</strong> · {insight.requires_human?"Escalamiento humano sugerido":"Revisión humana obligatoria"} · Coste del modelo estimado: US${(insight.estimated_cost_micros/1000000).toFixed(4)}.</p>}
        <p style={{whiteSpace:"pre-wrap"}}>{draft}</p>
        <button className="button" type="button" onClick={()=>void navigator.clipboard.writeText(draft)}><ClipboardCopy size={15}/> Copiar borrador para revisar</button>
        <p className="muted">Copiar no envía el contenido ni constituye una aprobación comercial.</p>
      </div>}
    </section>
    {tenantId&&<div className="section-gap" style={{marginTop:18}}><CrmAgentAdvicePanel tenantId={tenantId} compact/></div>}
    {tenantId&&<DigitalEmployeeChannelBinding tenantId={tenantId} agentId={selectedId}/>}
    {tenantId&&<DigitalEmployeeReviewQueue tenantId={tenantId}/>}
  </main>;
}
