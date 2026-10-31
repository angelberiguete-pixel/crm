"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CircleAlert, Gauge, Inbox, RefreshCw, Search, Target, UserRound, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "@/components/crm-inbox-mobile.module.css";

type Channel = { id: string; provider: string; name: string; status: string };
type Assignee = { user_id: string; display_name: string; team_role: string };
const channelLabel: Record<string,string> = {whatsapp:"WhatsApp",instagram:"Instagram",email:"Correo",messenger:"Messenger",webchat:"Chat web",sms:"SMS",manual:"Registro manual"};
const priorityLabel: Record<string,string> = {low:"Baja",normal:"Normal",high:"Alta",urgent:"Urgente"};
const statusLabel: Record<string,string> = {open:"Abierta",pending:"Pendiente",snoozed:"Pospuesta",closed:"Cerrada"};
const messageStatusLabel:Record<string,string>={pending:"Pendiente",queued:"En cola",sent:"Enviado",delivered:"Entregado",read:"Leído",received:"Recibido",failed:"Error de entrega"};
const messageTypeLabel:Record<string,string>={text:"Texto",image:"Imagen",audio:"Audio",video:"Vídeo",document:"Documento",file:"Archivo",template:"Plantilla"};
type Contact = { id: string; company_id: string | null; display_name: string; email: string | null; phone: string | null; whatsapp_phone: string | null; source: string | null; status: string };
type Company = { id: string; name: string };
type Opportunity = { id: string; title: string; value: number; currency: string; status: string; next_action: string | null; next_action_at: string | null };
type Conversation = { id: string; channel_id: string; contact_id: string | null; opportunity_id: string | null; subject: string | null; status: string; priority: string; assigned_to: string | null; unread_count: number; last_message_at: string | null; metadata: Record<string, unknown> };
type Message = { id: string; conversation_id: string; direction: string; sender_type: string; message_type: string; body: string | null; status: string; sent_at: string | null; delivered_at: string | null; read_at: string | null; created_at: string };

const when = new Intl.DateTimeFormat("es-DO", { dateStyle: "short", timeStyle: "short" });
const money = new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP", maximumFractionDigits: 0 });

export default function OmnichannelInbox() {
  const activeTenant = useActiveTenant();
  const tenantId = activeTenant?.tenant_id ?? null;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [assignees,setAssignees]=useState<Assignee[]>([]);
  const [currentUserId,setCurrentUserId]=useState<string|null>(null);
  const [assignmentFilter,setAssignmentFilter]=useState("all");
  const [channelFilter,setChannelFilter]=useState("all");
  const [assigning,setAssigning]=useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [replyDraft,setReplyDraft]=useState("");
  const [replySending,setReplySending]=useState(false);
  const [replyFeedback,setReplyFeedback]=useState("");

  useEffect(() => {
    // Reset the visible conversation immediately when the active company changes.
    setChannels([]); setConversations([]); setContacts([]); setCompanies([]);
    setOpportunities([]); setAssignees([]); setMessages([]); setSelectedId(null);
    setCurrentUserId(null); setMobileThreadOpen(false); setQuery(""); setStatus("all");
    setOnlyUnread(false); setAssignmentFilter("all"); setChannelFilter("all");
    setReplyDraft(""); setReplyFeedback("");
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) { setLoading(false); setError("Selecciona una empresa para abrir Conversaciones."); return; }
    let active = true;
    setLoading(true); setError("");
    (async () => {
      try {
        const [channelRes, conversationRes, contactRes, companyRes, opportunityRes, assigneeRes, sessionRes] = await Promise.all([
          supabase.from("channels").select("id,provider,name,status").eq("tenant_id", tenantId).order("name"),
          supabase.from("conversations").select("id,channel_id,contact_id,opportunity_id,subject,status,priority,assigned_to,unread_count,last_message_at,metadata").eq("tenant_id", tenantId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200),
          supabase.from("contacts").select("id,company_id,display_name,email,phone,whatsapp_phone,source,status").eq("tenant_id", tenantId),
          supabase.from("companies").select("id,name").eq("tenant_id", tenantId),
          supabase.from("opportunities").select("id,title,value,currency,status,next_action,next_action_at").eq("tenant_id", tenantId),
          supabase.rpc("tenant_inbox_assignees", {p_tenant_id:tenantId}),
          supabase.auth.getUser()
        ]);
        if (!active) return;
        const failure = [channelRes, conversationRes, contactRes, companyRes, opportunityRes, assigneeRes].find(r => r.error)?.error;
        if (failure) { setError("No se pudo actualizar la bandeja: " + failure.message); return; }
        const rows = (conversationRes.data ?? []) as Conversation[];
        setChannels((channelRes.data ?? []) as Channel[]);
        setConversations(rows);
        setContacts((contactRes.data ?? []) as Contact[]);
        setCompanies((companyRes.data ?? []) as Company[]);
        setOpportunities((opportunityRes.data ?? []) as Opportunity[]);
        setAssignees((assigneeRes.data ?? []) as Assignee[]);
        setCurrentUserId(sessionRes.data.user?.id ?? null);
        setSelectedId(previous => rows.some(row => row.id === previous) ? previous : rows[0]?.id ?? null);
      } catch {
        if (active) setError("No se pudo actualizar la bandeja. Comprueba la conexión y vuelve a intentarlo.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tenantId, reload]);

  useEffect(() => {
    if (!tenantId || !selectedId) { setMessages([]); setMessagesLoading(false); return; }
    let active = true;
    setMessages([]);
    setMessagesLoading(true);
    (async () => {
      try {
        const result = await supabase.from("messages")
          .select("id,conversation_id,direction,sender_type,message_type,body,status,sent_at,delivered_at,read_at,created_at")
          .eq("tenant_id", tenantId).eq("conversation_id", selectedId).order("created_at", { ascending: true }).limit(500);
        if (!active) return;
        if (result.error) { setError("No se pudo cargar el historial: " + result.error.message); return; }
        setMessages((result.data ?? []) as Message[]);
      } catch {
        if (active) setError("No se pudo cargar el historial. Pulsa Actualizar para volver a intentarlo.");
      } finally {
        if (active) setMessagesLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tenantId, selectedId, reload]);

  // Until a verified realtime publication is approved, refresh active inboxes
  // automatically through normal tenant-scoped RLS queries. This is polling,
  // not an instantaneous delivery guarantee; hidden tabs make zero requests.
  useEffect(()=>{
    if(!tenantId)return;
    let active=true,working=false;
    const refreshVisible=async()=>{
      if(!active||working||document.visibilityState!=="visible")return;
      working=true;
      try{
        const c=await supabase.from("conversations")
          .select("id,channel_id,contact_id,opportunity_id,subject,status,priority,assigned_to,unread_count,last_message_at,metadata")
          .eq("tenant_id",tenantId).order("last_message_at",{ascending:false,nullsFirst:false}).limit(200);
        if(!active)return;
        if(c.error){setConversations([]);setMessages([]);setSelectedId(null);return;}
        const rows=(c.data??[]) as Conversation[];
        setConversations(rows);
        if(selectedId&&!rows.some(row=>row.id===selectedId)){
          setMessages([]);setSelectedId(null);return;
        }
        if(selectedId){
          const m=await supabase.from("messages")
            .select("id,conversation_id,direction,sender_type,message_type,body,status,sent_at,delivered_at,read_at,created_at")
            .eq("tenant_id",tenantId).eq("conversation_id",selectedId)
            .order("created_at",{ascending:true}).limit(500);
          if(!active)return;
          if(m.error){setMessages([]);return;}
          setMessages((m.data??[]) as Message[]);
        }
      }catch{
        // A transient polling failure never permits cross-tenant fallback.
      }finally{working=false;}
    };
    const timer=window.setInterval(()=>void refreshVisible(),8000);
    const onFocus=()=>void refreshVisible();
    document.addEventListener("visibilitychange",onFocus);
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onFocus);};
  },[tenantId,selectedId]);

  const contactMap = useMemo(() => new Map(contacts.map((row) => [row.id, row])), [contacts]);
  const companyMap = useMemo(() => new Map(companies.map((row) => [row.id, row])), [companies]);
  const opportunityMap = useMemo(() => new Map(opportunities.map((row) => [row.id, row])), [opportunities]);
  const channelMap = useMemo(() => new Map(channels.map((row) => [row.id, row])), [channels]);
  const filtered = useMemo(() => conversations.filter((row) => {
    const contact = row.contact_id ? contactMap.get(row.contact_id) : null;
    const opportunity = row.opportunity_id ? opportunityMap.get(row.opportunity_id) : null;
    const haystack = `${row.subject ?? ""} ${contact?.display_name ?? ""} ${contact?.email ?? ""} ${contact?.phone ?? ""} ${opportunity?.title ?? ""}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || row.status === status) && (!onlyUnread || row.unread_count > 0) && (assignmentFilter === "all" || (assignmentFilter==="mine" ? row.assigned_to===currentUserId : row.assigned_to===null)) && (channelFilter==="all" || channelMap.get(row.channel_id)?.provider===channelFilter);
  }), [conversations, contactMap, opportunityMap, query, status, onlyUnread, assignmentFilter, currentUserId,channelFilter,channelMap]);
  const selected = conversations.find((row) => row.id === selectedId) ?? null;
  const contact = selected?.contact_id ? contactMap.get(selected.contact_id) : null;
  const company = contact?.company_id ? companyMap.get(contact.company_id) : null;
  const opportunity = selected?.opportunity_id ? opportunityMap.get(selected.opportunity_id) : null;
  const channel = selected ? channelMap.get(selected.channel_id) : null;

  const isSupervisor = ["owner","admin","manager"].includes(activeTenant?.membership_role??"");
  const assignedName=(id:string|null)=>id ? (assignees.find(a=>a.user_id===id)?.display_name??"Asignado") : "Sin asignar";
  function openConversation(id:string) {setSelectedId(id);setMobileThreadOpen(true);setError("");setReplyDraft("");setReplyFeedback("");}

  const canReply=channel?.provider==="whatsapp"&&channel.status==="connected"&&
    (isSupervisor||(activeTenant?.membership_role==="agent"&&!!currentUserId&&selected?.assigned_to===currentUserId));

  async function sendYCloudReply() {
    if(!canReply||!tenantId||!selected||replySending||!replyDraft.trim())return;
    setReplySending(true);setReplyFeedback("");setError("");
    const currentConversation=selected.id;
    try {
      const {data,error:sendError}=await supabase.functions.invoke("ycloud-whatsapp-send",{
        body:{tenantId,conversationId:currentConversation,
          clientRequestId:crypto.randomUUID(),text:replyDraft.trim()}
      });
      if(sendError||!data?.accepted){
        setReplyFeedback("No se confirmó el envío. No pulses otra vez hasta comprobar el historial y la configuración del canal.");
        return;
      }
      setReplyDraft("");setReplyFeedback("YCloud aceptó el mensaje en cola; su entrega todavía debe confirmarse.");
      setReload(v=>v+1);
    }catch{
      setReplyFeedback("No se confirmó el envío. Revisa el estado antes de volver a intentarlo.");
    }finally{setReplySending(false);}
  }

  async function assignConversation(assignee:string|null) {
    if(!tenantId||!selected||assigning)return;
    setError("");setAssigning(true);
    const currentId=selected.id;
    try{
      const r=await supabase.rpc("tenant_assign_conversation",{p_tenant_id:tenantId,p_conversation_id:currentId,p_assignee:assignee});
      if(r.error){setError(r.error.message);return;}
      setConversations(rows=>rows.map(row=>row.id===currentId?{...row,assigned_to:assignee}:row));
    }catch{setError("No se pudo actualizar el responsable. Intenta nuevamente.");}
    finally{setAssigning(false);}
  }

  async function updateConversation(patch: Partial<Pick<Conversation, "status" | "priority" | "unread_count">>) {
    if (!tenantId || !selected || updating) return;
    const conversationId = selected.id;
    setError(""); setUpdating(true);
    try {
      const result = await supabase.from("conversations").update(patch)
        .eq("tenant_id", tenantId).eq("id", conversationId).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("No se confirmó la actualización de la conversación.");
      setConversations(rows => rows.map(row => row.id === conversationId ? {...row, ...patch} : row));
    } catch (err) {
      setError("No se pudieron guardar los cambios: " + (err instanceof Error ? err.message : "Intenta nuevamente."));
    } finally { setUpdating(false); }
  }

  if (loading) return <div className="loading">Preparando conversaciones…</div>;
  return <><main className="content crm-inbox-page" style={{ maxWidth: 1500, margin: "0 auto" }}>
    <header className="topbar">
      <div><div className="eyebrow">Atención al cliente</div><h1>Conversaciones</h1><div className="muted">WhatsApp · Instagram · Correo · Chat web, separados por empresa</div></div>
      <div className={styles.statusRow}><button type="button" className="button" onClick={()=>setReload(n=>n+1)}><RefreshCw size={15}/> Actualizar</button><Link className="button" href="/crm"><ArrowLeft size={14}/> Volver al CRM</Link></div>
    </header>
    {error && <div className="notice" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
    <section className="card crm-channel-connection-status"><strong>Estado de los canales de esta empresa</strong><div className="crm-channel-pills">{(["whatsapp","instagram","email"] as const).map(provider=>{const connections=channels.filter(c=>c.provider===provider);const isConnected=connections.some(c=>c.status==="connected");return <span className="pill" key={provider}>{channelLabel[provider]}: {isConnected?"Registrado como conectado (sin prueba de envío)":"Sin conexión activa"}</span>;})}</div><p className="muted">Para recibir y responder mensajes reales, un administrador debe autorizar el canal con su proveedor. Aquí no se simula ninguna conexión ni se envían mensajes hasta validarla.</p>{isSupervisor&&<Link className="button" href="/crm/channels">Preparar canales de esta empresa</Link>}</section>
    <section className={`grid crm-inbox-grid ${styles.inboxGrid} ${mobileThreadOpen?styles.threadVisible:styles.listVisible}`}>
      <div className={`card ${styles.inboxList}`} style={{ padding: 12 }}>
        <div className="stack gap-8">
          <label style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 10, top: 11 }}/><input aria-label="Buscar conversaciones" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar persona, oportunidad o correo…" style={{ paddingLeft: 32 }}/></label>
          <div className={styles.filters}><select aria-label="Filtrar por estado" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="open">Abiertas</option><option value="pending">Pendientes</option><option value="snoozed">Pospuestas</option><option value="closed">Cerradas</option></select><button type="button" aria-pressed={onlyUnread} className={`button ${styles.filterUnread} ${onlyUnread?"primary":""}`} onClick={()=>setOnlyUnread(v=>!v)}>No leídos</button></div>
        </div>
        <label className="crm-assignment-filter">Canal<select aria-label="Filtrar conversaciones por canal" value={channelFilter} onChange={e=>setChannelFilter(e.target.value)}><option value="all">Todos los canales</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="email">Correo</option><option value="messenger">Messenger</option><option value="webchat">Chat web</option></select></label>
        <label className="crm-assignment-filter">Responsable<select aria-label="Filtrar conversaciones por responsable" value={assignmentFilter} onChange={e=>setAssignmentFilter(e.target.value)}><option value="all">Todas las conversaciones</option><option value="mine">Mis conversaciones</option><option value="unassigned">Sin asignar</option></select></label>
        <div className="stack gap-8" style={{ marginTop: 12 }}>
          <p role="status" className={styles.listSummary}>{filtered.length} {filtered.length===1?"conversación":"conversaciones"} con los filtros actuales</p>{filtered.length === 0 && <div className="empty"><strong>Sin conversaciones</strong><div>No hay conversaciones que coincidan con estos filtros.</div></div>}
          {filtered.map((row) => { const c = row.contact_id ? contactMap.get(row.contact_id) : null; const ch = channelMap.get(row.channel_id); return <button key={row.id} type="button" onClick={() => openConversation(row.id)} aria-current={selectedId===row.id?"true":undefined} className={`card ${styles.threadItem}`}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{c?.display_name ?? row.subject ?? "Conversación"}</strong>{row.unread_count > 0 && <span className="badge">{row.unread_count}</span>}</div><div className="muted">{channelLabel[ch?.provider??""]??"Canal"} · {priorityLabel[row.priority]??row.priority}</div><div className="muted">Responsable: {assignedName(row.assigned_to)}</div><small className="muted">{row.last_message_at ? when.format(new Date(row.last_message_at)) : "Sin mensajes"}</small></button>; })}
        </div>
      </div>
      <div className={`card ${styles.inboxThread}`} style={{ minHeight: 620 }}><button type="button" className={`button ${styles.mobileBack}`} onClick={()=>setMobileThreadOpen(false)}><ArrowLeft size={16}/> Volver a las conversaciones</button>
        {!selected ? <div className="empty"><Inbox/><strong>Selecciona una conversación</strong><div>El historial y el contexto aparecerán aquí.</div></div> : <>
          <div className={styles.threadHeader}><div><div className="eyebrow">{channelLabel[channel?.provider??""]??"Canal"} · {channel?.name??""}</div><h2>{contact?.display_name??selected.subject??"Conversación"}</h2></div>
            <div className={styles.threadActions}>
              <select aria-label="Prioridad de la conversación" disabled={updating} value={selected.priority} onChange={e=>void updateConversation({priority:e.target.value})}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select>
              <select aria-label="Estado de la conversación" disabled={updating} value={selected.status} onChange={e=>void updateConversation({status:e.target.value})}><option value="open">Abierta</option><option value="pending">Pendiente</option><option value="snoozed">Pospuesta</option><option value="closed">Cerrada</option></select>
              {selected.unread_count>0&&<button type="button" className="button" disabled={updating} onClick={()=>void updateConversation({unread_count:0})}>Marcar como leída</button>}
            </div>
          </div>
          <div className="crm-conversation-assignment"><div><strong>Responsable</strong><p className="muted">Asigna la conversación a un vendedor activo de esta empresa.</p></div>{isSupervisor?<select aria-label="Asignar conversación a vendedor" disabled={assigning} value={selected.assigned_to??""} onChange={e=>void assignConversation(e.target.value||null)}><option value="">Sin asignar</option>{assignees.map(a=><option value={a.user_id} key={a.user_id}>{a.display_name} · {a.team_role}</option>)}</select>:<div className="top-actions"><span className="pill">{assignedName(selected.assigned_to)}</span>{!selected.assigned_to&&currentUserId&&<button type="button" className="button primary" disabled={assigning} onClick={()=>void assignConversation(currentUserId)}>Tomar conversación</button>}{selected.assigned_to===currentUserId&&<button type="button" className="button" disabled={assigning} onClick={()=>void assignConversation(null)}>Devolver al equipo</button>}</div>}</div>
          <div className={`stack gap-8 ${styles.messageArea}`} aria-label="Historial de la conversación">
            {messagesLoading?<div className="loading" role="status">Cargando mensajes…</div>:messages.length===0&&<div className="empty"><strong>Sin mensajes todavía</strong><div>La conversación existe, pero aún no tiene historial registrado.</div></div>}
            {!messagesLoading&&messages.map(msg=><div key={msg.id} className={`card ${styles.messageBubble} ${msg.direction==="outbound"?styles.outgoingBubble:""}`}>
              <div className="eyebrow">{msg.direction==="outbound"?"Equipo":"Contacto"} · {messageTypeLabel[msg.message_type]??msg.message_type}</div>
              <div>{msg.body||"[Mensaje sin texto]"}</div>
              <small className={`muted ${styles.messageMeta}`}>{when.format(new Date(msg.sent_at??msg.created_at))} · {messageStatusLabel[msg.status]??msg.status}{msg.read_at?" · leído":msg.delivered_at?" · entregado":""}</small>
            </div>)}
          </div>
          {channel?.provider==="whatsapp"&&<div className="stack gap-8" style={{marginTop:16}}>
            <label htmlFor="ycloud-reply-text"><strong>Responder desde el CRM · YCloud</strong></label>
            <textarea id="ycloud-reply-text" aria-label="Respuesta de WhatsApp"
              value={replyDraft} onChange={e=>setReplyDraft(e.target.value)}
              placeholder={canReply?"Escribe una respuesta para enviar por la API…":"Disponible tras verificar el canal YCloud y asignar un responsable"}
              maxLength={1600} rows={3} disabled={!canReply||replySending}/>
            <div className="top-actions"><button type="button" className="button primary"
              disabled={!canReply||replySending||!replyDraft.trim()}
              onClick={()=>void sendYCloudReply()}>{replySending?"Procesando…":"Enviar por YCloud"}</button>
              <small className="muted">Solo respuesta manual; dentro de las 24 horas del último mensaje recibido. Sin IA automática.</small></div>
            {replyFeedback&&<div className="notice" role="status">{replyFeedback}</div>}
          </div>}
          <div className="notice" style={{ marginTop: 16 }}>El envío depende de que YCloud esté verificado, autorizado y habilitado en el servidor. Ninguna clave API se configura desde esta pantalla.</div>
        </>}
      </div>
      <aside className={`stack gap-12 ${styles.inboxAside}`}>
        <div className="card"><div className="eyebrow"><UserRound size={13}/> Contacto</div><h3>{contact?.display_name ?? "Sin vincular"}</h3>{contact ? <div className="stack gap-8"><span>{contact.whatsapp_phone || contact.phone || "Sin teléfono"}</span><span>{contact.email || "Sin email"}</span><span className="muted">Fuente: {contact.source || "sin fuente"}</span></div> : <p className="muted">Vincula la conversación a un contacto para completar el contexto 360°.</p>}</div>
        <div className="card"><div className="eyebrow"><Building2 size={13}/> Empresa</div><h3>{company?.name ?? "Sin empresa"}</h3></div>
        <div className="card"><div className="eyebrow"><Target size={13}/> Oportunidad</div>{opportunity ? <><h3>{opportunity.title}</h3><strong>{opportunity.currency === "DOP" ? money.format(Number(opportunity.value)) : `${opportunity.currency} ${Number(opportunity.value).toLocaleString("es-DO")}`}</strong><p className="muted">{statusLabel[opportunity.status]??(opportunity.status==="won"?"Ganada":opportunity.status==="lost"?"Perdida":opportunity.status)}</p><div className="notice"><strong>Próxima acción</strong><div>{opportunity.next_action || "No definida"}</div>{opportunity.next_action_at && <small>{when.format(new Date(opportunity.next_action_at))}</small>}</div></> : <p className="muted">Sin oportunidad vinculada.</p>}</div>
        <div className="card"><div className="eyebrow"><CircleAlert size={13}/> Atención</div><strong>{selected?.unread_count ?? 0} sin leer</strong><div className="muted">Prioridad {priorityLabel[selected?.priority??""]??"—"}</div></div>
      </aside>
    </section>
  </main>
    <nav className="mobile-nav" aria-label="Secciones principales del CRM">
      {([["","Inicio",Gauge],["companies","Empresas",Building2],["contacts","Contactos",Users],["revenue","Oportunidades",Target],["inbox","Conversaciones",Inbox]] as const).map(([key,label,Icon])=><Link key={key} aria-current={key==="inbox"?"page":undefined} className={key==="inbox"?"active":""} href={`/crm${key?"/"+key:""}`}><Icon size={19}/><span>{label}</span></Link>)}
    </nav>
  </>;
}
