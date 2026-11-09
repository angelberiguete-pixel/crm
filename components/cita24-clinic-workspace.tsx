"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";

type Contact = {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
};
type Appointment = {
  id: string;
  contact_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  metadata: Record<string, unknown> | null;
};
type Task = {
  id: string;
  status: string;
  title: string;
  due_at: string | null;
  contact_id: string | null;
};
const ZONE = "America/Santo_Domingo";
const appointmentTime = new Intl.DateTimeFormat("es-DO", {
  timeZone: ZONE, dateStyle: "medium", timeStyle: "short",
});
const statuses: Record<Appointment["status"], string> = {
  scheduled: "Programada",
  completed: "Atendida",
  cancelled: "Cancelada",
  no_show: "No asistió",
};
function safeError(error: unknown) {
  return error instanceof Error ? error.message : "La operación no se pudo completar.";
}
function numericPhone(value: string) {
  return value.replace(/[^0-9+]/g, "").slice(0, 24);
}
function isCita24Appointment(appointment: Appointment) {
  return appointment.metadata?.module === "cita24";
}

export default function Cita24ClinicWorkspace() {
  const tenant = useActiveTenant();
  const tenantId = tenant?.tenant_id ?? "";
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadedTenantId, setLoadedTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientSource, setPatientSource] = useState("whatsapp");
  const [selectedContact, setSelectedContact] = useState("");
  const [service, setService] = useState("Evaluación inicial");
  const [startLocal, setStartLocal] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadedTenantId("");
    setContacts([]);
    setAppointments([]);
    setTasks([]);
    if (!tenantId) {
      setLoading(false);
      return () => { alive = false; };
    }
    void (async () => {
      const [c, a, t] = await Promise.all([
        supabase.from("contacts")
          .select("id,display_name,phone,email")
          .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(700),
        supabase.from("calendar_events")
          .select("id,contact_id,title,starts_at,ends_at,status,metadata")
          .eq("tenant_id", tenantId).contains("metadata", { module: "cita24" })
          .order("starts_at", { ascending: true }).limit(700),
        supabase.from("tasks")
          .select("id,status,title,due_at,contact_id")
          .eq("tenant_id", tenantId).contains("metadata", { module: "cita24" })
          .order("created_at", { ascending: false }).limit(400),
      ]);
      if (!alive) return;
      const error = c.error ?? a.error ?? t.error;
      if (error) {
        setNotice("No se pudo cargar el panel de esta empresa: " + error.message);
        setLoading(false);
        return;
      }
      setContacts((c.data ?? []) as Contact[]);
      setAppointments(((a.data ?? []) as Appointment[]).filter(isCita24Appointment));
      setTasks((t.data ?? []) as Task[]);
      setLoadedTenantId(tenantId);
      setLoading(false);
    })().catch((error: unknown) => {
      if (alive) { setNotice(safeError(error)); setLoading(false); }
    });
    return () => { alive = false; };
  }, [tenantId, refreshKey]);

  const patientById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayCount = appointments.filter((appointment) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(appointment.starts_at)) === todayKey && appointment.status === "scheduled").length;
  const pendingConfirmations = appointments.filter((a) => a.status === "scheduled" && a.metadata?.confirmed !== true).length;
  const noShows = appointments.filter((a) => a.status === "no_show").length;
  const completed = appointments.filter((a) => a.status === "completed").length;
  const upcoming = appointments
    .filter((a) => a.status === "scheduled" && new Date(a.ends_at).getTime() >= Date.now() - 7 * 86400000)
    .slice(0, 80);
  const followups = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").slice(0, 50);

  async function registerPatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || busy || loadedTenantId !== tenantId) return;
    const name = patientName.trim();
    const phone = numericPhone(patientPhone);
    if (name.length < 2 || phone.length < 8) {
      setNotice("Escribe un nombre y un teléfono válido para gestionar citas.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const existing = await supabase.from("contacts").select("id,display_name")
        .eq("tenant_id", tenantId).eq("phone", phone).limit(1);
      if (existing.error) throw existing.error;
      if (existing.data?.length) {
        setSelectedContact(existing.data[0].id);
        setNotice("Este número ya existe en el CRM. Seleccioné su ficha para evitar duplicarlo.");
        return;
      }
      const saved = await supabase.from("contacts").insert({
        tenant_id: tenantId, display_name: name, phone,
        email: patientEmail.trim() || null, source: patientSource, status: "lead",
        metadata: { origin_module: "cita24", intake: "administrative_only" },
      }).select("id").single();
      if (saved.error) throw saved.error;
      setSelectedContact(saved.data.id);
      setPatientName(""); setPatientPhone(""); setPatientEmail("");
      setNotice("Contacto registrado. Ya puedes asignarle una cita.");
      setRefreshKey((v) => v + 1);
    } catch (error) {
      setNotice("Error al registrar el contacto: " + safeError(error));
    } finally { setBusy(false); }
  }

  async function bookAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || busy || loadedTenantId !== tenantId) return;
    const contact = contacts.find((p) => p.id === selectedContact);
    const starts = new Date(startLocal);
    const ends = new Date(starts.getTime() + minutes * 60000);
    if (!contact || !startLocal || !Number.isFinite(starts.getTime()) ||
        minutes < 10 || minutes > 240 || !service.trim()) {
      setNotice("Selecciona un contacto, servicio administrativo, fecha y duración válida.");
      return;
    }
    if (starts.getTime() < Date.now() - 60000) {
      setNotice("No puedes registrar una cita en una fecha pasada.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      // Advisory UI check. The pilot uses one agenda; server-side concurrency protection
      // must be added before multi-receptionist simultaneous production booking.
      const overlap = await supabase.from("calendar_events").select("id")
        .eq("tenant_id", tenantId).eq("status", "scheduled")
        .contains("metadata", { module: "cita24" })
        .lt("starts_at", ends.toISOString()).gt("ends_at", starts.toISOString()).limit(1);
      if (overlap.error) throw overlap.error;
      if (overlap.data?.length) {
        setNotice("Ya hay una cita programada en ese horario de la agenda piloto. Elige otro.");
        return;
      }
      const created = await supabase.from("calendar_events").insert({
        tenant_id: tenantId, contact_id: contact.id,
        title: "Cita · " + service.trim().slice(0, 100),
        event_type: "meeting", status: "scheduled",
        starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        timezone: ZONE,
        metadata: {
          module: "cita24", kind: "appointment", service: service.trim().slice(0, 100),
          confirmed: false, message_delivery: "not_connected", created_via: "reception",
        },
      }).select("id").single();
      if (created.error) throw created.error;
      const reminderDue = new Date(Math.max(Date.now(), starts.getTime() - 24 * 3600000));
      const task = await supabase.from("tasks").insert({
        tenant_id: tenantId, contact_id: contact.id,
        title: "Confirmar cita · " + contact.display_name,
        description: "Seguimiento administrativo por personal autorizado. No se enviará ningún mensaje automáticamente.",
        status: "todo", priority: "normal", source: "manual",
        due_at: reminderDue.toISOString(),
        metadata: { module: "cita24", appointment_id: created.data.id, kind: "confirmation" },
      });
      setStartLocal("");
      setNotice(task.error
        ? "La cita se guardó, pero la tarea de confirmación no se creó: " + task.error.message
        : "Cita registrada y tarea de confirmación creada. No se envió un mensaje externo.");
      setRefreshKey((v) => v + 1);
    } catch (error) {
      setNotice("Error al programar: " + safeError(error));
    } finally { setBusy(false); }
  }

  async function updateAppointment(appointment: Appointment, action: "confirm" | Appointment["status"]) {
    if (!tenantId || busy || loadedTenantId !== tenantId) return;
    setBusy(true); setNotice("");
    try {
      const values = action === "confirm"
        ? { metadata: { ...(appointment.metadata ?? {}), confirmed: true, confirmed_at: new Date().toISOString() } }
        : { status: action };
      const updated = await supabase.from("calendar_events").update(values)
        .eq("tenant_id", tenantId).eq("id", appointment.id).select("id").single();
      if (updated.error) throw updated.error;
      if (action === "no_show" && appointment.status !== "no_show") {
        const followup = await supabase.from("tasks").insert({
          tenant_id: tenantId, contact_id: appointment.contact_id,
          title: "Reprogramación pendiente · " + (patientById.get(appointment.contact_id ?? "")?.display_name ?? "Contacto"),
          description: "Contactar solo por canal permitido. Verificar si desea reprogramar.",
          status: "todo", priority: "normal", source: "manual",
          due_at: new Date(Date.now() + 86400000).toISOString(),
          metadata: { module: "cita24", appointment_id: appointment.id, kind: "no_show_followup" },
        });
        setNotice(followup.error
          ? "Se marcó la inasistencia, pero falló la tarea: " + followup.error.message
          : "Inasistencia registrada. Se generó una tarea humana de recuperación.");
      } else {
        setNotice(action === "confirm" ? "Confirmación registrada internamente; no se enviaron mensajes." : "Estado de la cita actualizado.");
      }
      setRefreshKey((v) => v + 1);
    } catch (error) {
      setNotice("No se pudo actualizar la cita: " + safeError(error));
    } finally { setBusy(false); }
  }

  async function completeTask(task: Task) {
    if (!tenantId || busy || loadedTenantId !== tenantId) return;
    setBusy(true); setNotice("");
    try {
      const updated = await supabase.from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("tenant_id", tenantId).eq("id", task.id).select("id").single();
      if (updated.error) throw updated.error;
      setNotice("Seguimiento marcado como realizado.");
      setRefreshKey((v) => v + 1);
    } catch (error) { setNotice(safeError(error)); }
    finally { setBusy(false); }
  }

  if (!tenantId || tenant?.tenant_slug === "family-power") {
    return <section className="card"><h2>Cita-24 · Empresia</h2>
      <p className="muted">Selecciona un workspace autorizado para clínicas. Family Power mantiene su aplicación independiente.</p>
      <Link href="/crm" className="button">Volver al CRM</Link></section>;
  }
  if (loading || loadedTenantId !== tenantId) return <div className="loading">Cargando agenda segura de Cita-24…</div>;

  const fieldStyle = { width: "100%", minHeight: 42, padding: "8px 10px" };
  const formStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 };
  const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12 };
  return <div className="shell">
    <main className="content">
      <header className="topbar" style={headerStyle}>
        <div><div className="eyebrow">Empresia · Operación administrativa</div>
          <h1>Cita-24</h1><p className="muted">Agenda, contactos y seguimiento humano de {tenant.tenant_name}</p></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="button" href="/crm/calendar">Calendario general</Link>
          <Link className="button" href="/crm">Volver a Empresia</Link>
          <button className="button" disabled={busy} onClick={() => setRefreshKey((v) => v + 1)}>Actualizar</button>
        </div>
      </header>
      {notice && <div className="notice" role="status" style={{ marginBottom: 16 }}>{notice}</div>}
      <section className="grid metrics" style={{ marginBottom: 16 }}>
        <div className="metric"><div className="metric-label">Citas de hoy</div><div className="metric-value">{todayCount}</div></div>
        <div className="metric"><div className="metric-label">Sin confirmar</div><div className="metric-value">{pendingConfirmations}</div></div>
        <div className="metric"><div className="metric-label">Atendidas</div><div className="metric-value">{completed}</div></div>
        <div className="metric"><div className="metric-label">No asistieron</div><div className="metric-value">{noShows}</div></div>
        <div className="metric"><div className="metric-label">Seguimientos abiertos</div><div className="metric-value">{followups.length}</div></div>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 16, marginBottom: 16 }}>
        <form className="card" onSubmit={(event) => void registerPatient(event)}>
          <h2>1. Registrar contacto</h2>
          <p className="muted">Solo información de contacto para agenda. No introduzcas diagnósticos ni expedientes médicos.</p>
          <div style={formStyle}>
            <label>Nombre<input style={fieldStyle} required minLength={2} maxLength={120} value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Nombre del contacto" /></label>
            <label>Teléfono<input style={fieldStyle} required value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} placeholder="809..." /></label>
            <label>Email (opcional)<input style={fieldStyle} type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} placeholder="correo@dominio.com" /></label>
            <label>Canal de entrada<select style={fieldStyle} value={patientSource} onChange={(e) => setPatientSource(e.target.value)}>
              <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option>
              <option value="web">Web</option><option value="phone">Llamada</option><option value="walk_in">Presencial</option>
            </select></label>
          </div>
          <button className="button primary" style={{ marginTop: 12 }} disabled={busy}>Guardar contacto</button>
        </form>
        <form className="card" onSubmit={(event) => void bookAppointment(event)}>
          <h2>2. Programar cita</h2>
          <p className="muted">Agenda única piloto. Verifica la disponibilidad antes de confirmar.</p>
          <div style={formStyle}>
            <label>Contacto<select style={fieldStyle} required value={selectedContact} onChange={(e) => setSelectedContact(e.target.value)}>
              <option value="">Selecciona un contacto</option>
              {contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.display_name} · {contact.phone ?? "sin teléfono"}</option>)}
            </select></label>
            <label>Motivo administrativo<select style={fieldStyle} value={service} onChange={(e) => setService(e.target.value)}>
              <option>Evaluación inicial</option><option>Consulta de información</option>
              <option>Seguimiento administrativo</option><option>Revisión de presupuesto</option>
            </select></label>
            <label>Fecha y hora<input style={fieldStyle} required type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} /></label>
            <label>Duración<select style={fieldStyle} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              <option value={15}>15 minutos</option><option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option><option value={60}>60 minutos</option>
            </select></label>
          </div>
          <button className="button primary" style={{ marginTop: 12 }} disabled={busy || !selectedContact}>Guardar cita y crear tarea</button>
        </form>
      </section>
      <section className="card" style={{ marginBottom: 16 }}>
        <h2>3. Agenda reciente y próxima</h2>
        <p className="muted">Confirmar aquí significa registrar una decisión humana. No envía automáticamente SMS, WhatsApp ni correo.</p>
        {upcoming.length === 0 ? <p className="muted">No hay citas próximas registradas en Cita-24.</p> :
          <div style={{ display: "grid", gap: 10 }}>
            {upcoming.map((a) => <article key={a.id} className="priority-item" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <div><strong>{patientById.get(a.contact_id ?? "")?.display_name ?? "Contacto"}</strong>
                <div className="muted">{appointmentTime.format(new Date(a.starts_at))} · {String(a.metadata?.service ?? "Cita administrativa")}</div>
                <span className="pill">{a.metadata?.confirmed === true ? "Confirmada internamente" : "Sin confirmar"}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {a.metadata?.confirmed !== true && <button className="button small" disabled={busy} onClick={() => void updateAppointment(a, "confirm")}>Confirmar</button>}
                <button className="button small" disabled={busy} onClick={() => void updateAppointment(a, "completed")}>Atendida</button>
                <button className="button small" disabled={busy} onClick={() => void updateAppointment(a, "no_show")}>No asistió</button>
                <button className="button small" disabled={busy} onClick={() => void updateAppointment(a, "cancelled")}>Cancelar</button>
              </div>
            </article>)}
          </div>}
      </section>
      <section className="card">
        <h2>4. Seguimientos por realizar</h2>
        {followups.length === 0 ? <p className="muted">No hay seguimientos abiertos de Cita-24.</p> :
          <div style={{ display: "grid", gap: 10 }}>{followups.map((task) =>
            <div key={task.id} className="priority-item" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div><strong>{task.title}</strong><div className="muted">{task.due_at ? appointmentTime.format(new Date(task.due_at)) : "Sin fecha"}</div></div>
              <button className="button small" disabled={busy} onClick={() => void completeTask(task)}>Completar</button>
            </div>)}</div>}
      </section>
      <p className="muted" style={{ marginTop: 16 }}>Piloto administrativo: sin datos médicos, sin diagnóstico automático, sin envíos externos y sin promesa de disponibilidad simultánea multioperador. Las citas y tareas se guardan en las tablas existentes del CRM, con políticas RLS por empresa.</p>
    </main>
  </div>;
}
