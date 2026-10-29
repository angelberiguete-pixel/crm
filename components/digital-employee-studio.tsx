"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Plus, Save, Sparkles, RefreshCw, ShieldCheck, ClipboardCopy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
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
  const [busy,setBusy]=useState(false),[testing,setTesting]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [reload,setReload]=useState(0);
  const active=useMemo(()=>agents.find(x=>x.id===selectedId)??null,[selectedId,agents]);

  useEffect(()=>{
    setAgents([]);setSelectedId(null);setRole("recepcionista");setKnowledge(fresh());
    setName("Recepcionista IA");setDraft("");setError("");setNotice("");
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
    setSelectedId(agent.id);
    setRole(kind==="vendedor"?"vendedor":"recepcionista");
    setName(agent.name);
    setKnowledge(normalizeEmployeeKnowledge(settings.knowledge));
    setDraft("");setError("");setNotice("");
  }
  function newAgent(){
    setSelectedId(null);setName("Recepcionista IA");setRole("recepcionista");
    setKnowledge(fresh());setDraft("");setError("");setNotice("");
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
    setTesting(true);setDraft("");setError("");setNotice("");
    try{
      const response=await supabase.functions.invoke("ai-employee-draft",{
        body:{tenant_id:tenantId,agent_id:selectedId,request_id:crypto.randomUUID(),question:sample.trim()}
      });
      if(currentTenant.current!==originalTenant)return;
      if(response.error||response.data?.ok!==true)throw new Error(String(response.data?.error??"El proveedor de IA no está conectado o no respondió."));
      if(typeof response.data.draft!=="string")throw new Error("Respuesta no verificada.");
      setDraft(response.data.draft);
      setNotice("Borrador generado por IA y registrado para revisión. No se envió ningún mensaje.");
    }catch(e){if(currentTenant.current===originalTenant)setError("No se pudo generar el borrador: "+(e instanceof Error?e.message:"Intenta más tarde."));}
    finally{if(currentTenant.current===originalTenant)setTesting(false);}
  }

  if(!tenant)return <main className="content"><p>Selecciona una empresa antes de configurar empleados digitales.</p></main>;
  if(!permitted)return <main className="content"><div className="notice" role="alert">La administración de agentes digitales requiere acceso propietario o administrador de la empresa.</div></main>;
  return <main className="content" style={{maxWidth:1300,margin:"0 auto"}}>
    <header className="topbar">
      <div><div className="eyebrow">Look Social Media · Digital Staff</div><h1>Empleados digitales con IA</h1><p className="muted">{tenant.tenant_name} · Configuración separada y segura por empresa</p></div>
      <div className="top-actions">
        <Link className="button" href="/crm">Volver al CRM</Link>
        <button type="button" className="button" onClick={()=>setReload(v=>v+1)}><RefreshCw size={15}/> Actualizar</button>
      </div>
    </header>
    <div className="notice" style={{marginBottom:16}}><ShieldCheck size={17}/> Etapa piloto: los agentes preparan borradores para revisión humana. No hay envíos automáticos, llamadas, reservas confirmadas ni acceso autónomo a herramientas. Para generar respuestas con IA se requiere configurar de forma segura el proveedor del servidor.</div>
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
        <p className="muted" style={{marginTop:16}}>Roles iniciales: Recepcionista y Asesor comercial. Secretaría, cobros y voz se incorporarán tras validar la primera operación.</p>
      </section>
      <section className="card">
        <h2>{active?"Configurar empleado":"Crear empleado digital"}</h2>
        <form onSubmit={save} className="stack gap-12">
          <label>Tipo de empleado<select value={role} onChange={e=>{const val=e.target.value as EmployeeRole;setRole(val);if(!selectedId)setName(EMPLOYEE_ROLES[val].label);setDraft("");}}>
            <option value="recepcionista">Recepcionista IA</option><option value="vendedor">Asesor comercial IA</option>
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
        <p style={{whiteSpace:"pre-wrap"}}>{draft}</p>
        <button className="button" type="button" onClick={()=>void navigator.clipboard.writeText(draft)}><ClipboardCopy size={15}/> Copiar borrador para revisar</button>
        <p className="muted">Copiar no envía el contenido ni constituye una aprobación comercial.</p>
      </div>}
    </section>
  </main>;
}
