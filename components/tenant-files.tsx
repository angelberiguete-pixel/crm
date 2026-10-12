"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Download, FileText, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";

type FileRow = {
  id: string; tenant_id: string; filename: string; module_key: string;
  mime_type: string; byte_size: number; object_path: string;
  status: "reserved" | "ready"; uploaded_by: string; created_at: string;
};
type Module = { key: string; label: string; permission: string; activeModule: string };
const modules: Module[] = [
  { key: "general", label: "General", permission: "dashboard", activeModule: "dashboard" },
  { key: "sales", label: "Ventas", permission: "pipeline", activeModule: "pipeline" },
  { key: "contacts", label: "Contactos", permission: "contacts", activeModule: "contacts" },
  { key: "orders", label: "Pedidos", permission: "operations", activeModule: "operations" },
  { key: "production", label: "Producción", permission: "operations", activeModule: "operations" },
  { key: "finance", label: "Finanzas", permission: "finance", activeModule: "operations" },
];
const types: Record<string,string> = {
  "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg",
  "image/webp": ".webp", "text/csv": ".csv",
};
const BUCKET = "crm-documents";
const maxBytes = 10 * 1024 * 1024;

export default function TenantFiles() {
  const tenantId = useActiveTenant()?.tenant_id;
  const [rows, setRows] = useState<FileRow[]>([]);
  const [allowed, setAllowed] = useState<Module[]>([]);
  const [moduleKey, setModuleKey] = useState("general");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    if (!tenantId) { setRows([]); setAllowed([]); setLoading(false); return; }
    setLoading(true);
    const [files, permissions, enabledModules] = await Promise.all([
      supabase.from("tenant_files").select("id,tenant_id,filename,module_key,mime_type,byte_size,object_path,status,uploaded_by,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(100),
      supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
      supabase.rpc("tenant_effective_modules",{p_tenant_id:tenantId}),
    ]);
    setLoading(false);
    if (files.error || permissions.error || enabledModules.error) {
      setError("No se pudieron validar los documentos y permisos. Reintenta.");
      setRows([]); setAllowed([]); return;
    }
    const rights=(permissions.data ?? {}) as Record<string,boolean>;
    const enabled=(enabledModules.data ?? []) as Array<{module_key:string;enabled:boolean}>;
    const available=modules.filter(m => (rights.all === true || rights.write === true) && enabled.some(x=>x.module_key===m.activeModule&&x.enabled) &&
      (rights.all === true || rights[m.permission] === true || (["orders","production"].includes(m.key) && rights.operations === true)));
    setAllowed(available);
    setModuleKey(previous => available.some(m=>m.key===previous) ? previous : (available[0]?.key ?? "general"));
    setRows((files.data ?? []) as FileRow[]);
  },[tenantId]);

  useEffect(() => { void reload(); },[reload]);

  const writeAllowed = allowed.length > 0;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId || !file || busy || !writeAllowed) return;
    setError("");setNotice("");
    const ext=types[file.type];
    if (!ext || file.size < 1 || file.size > maxBytes) {
      setError("Solo PDF, JPG, PNG, WEBP y CSV entre 1 byte y 10 MB."); return;
    }
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if (authError || !user) {setError("La sesión no está disponible.");return;}
    setBusy(true);
    let pendingId:string|null=null, pendingPath:string|null=null;
    try {
      const id=crypto.randomUUID();
      const reservation=await supabase.from("tenant_files").insert({
        id,tenant_id:tenantId,uploaded_by:user.id,filename:file.name,
        module_key:moduleKey,mime_type:file.type,byte_size:file.size,
      }).select("id,object_path").single();
      if (reservation.error || !reservation.data) throw new Error(reservation.error?.message ?? "No se pudo reservar el documento.");
      pendingId=reservation.data.id; pendingPath=reservation.data.object_path;
      const stored=await supabase.storage.from(BUCKET).upload(pendingPath,file,{
        contentType:file.type,upsert:false,cacheControl:"0",
      });
      if (stored.error) throw stored.error;
      const finalized=await supabase.rpc("crm_finalize_tenant_file",{p_file_id:pendingId});
      if (finalized.error) throw finalized.error;
      pendingId=null;pendingPath=null;
      setFile(null);
      const input=document.getElementById("tenant-file-upload") as HTMLInputElement|null;
      if(input)input.value="";
      setNotice("Documento subido y verificado.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se completó la subida.");
      // Best effort rollback; never report success if cleanup fails.
      if (pendingId && pendingPath) {
        const removed=await supabase.storage.from(BUCKET).remove([pendingPath]);
        if (!removed.error) {
          const cancelled=await supabase.rpc("crm_cancel_tenant_file",{p_file_id:pendingId});
          if (cancelled.error) setError(prev=>prev+" La reserva quedó pendiente: revisa la lista.");
        } else setError(prev=>prev+" No se pudo limpiar el objeto: revisa la lista.");
      }
      await reload();
    } finally {setBusy(false);}
  }

  async function download(row: FileRow) {
    if (row.status!=="ready" || activeAction) return;
    setActiveAction(row.id);setError("");
    try {
      const result=await supabase.storage.from(BUCKET).download(row.object_path);
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Descarga no autorizada.");
      const url=URL.createObjectURL(result.data);
      const a=document.createElement("a");
      a.href=url;a.download=row.filename;document.body.appendChild(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch (e) {setError(e instanceof Error ? e.message : "Falló la descarga.");}
    finally {setActiveAction(null);}
  }

  async function remove(row: FileRow) {
    if (activeAction || busy) return;
    if (!window.confirm("¿Eliminar este documento de forma permanente?")) return;
    setActiveAction(row.id);setError("");setNotice("");
    try {
      const removed=await supabase.storage.from(BUCKET).remove([row.object_path]);
      if (removed.error) throw removed.error;
      const cleared=await supabase.rpc("crm_cancel_tenant_file",{p_file_id:row.id});
      if (cleared.error) throw cleared.error;
      setNotice("Documento eliminado.");
      await reload();
    } catch (e) {setError(e instanceof Error ? e.message : "No se completó la eliminación.");await reload();}
    finally {setActiveAction(null);}
  }

  return <section className="stack gap-16" aria-label="Archivos privados de la empresa">
    <div className="card">
      <div className="topbar"><h2><FileText size={20} /> Archivos privados</h2>
      <button type="button" className="button" onClick={()=>void reload()} disabled={loading||busy}><RefreshCw size={16}/> Actualizar</button></div>
      <p className="muted">Documentos protegidos por empresa y módulo. Sin enlaces públicos. Máximo 10 MB por archivo.</p>
      <form className="stack gap-16" onSubmit={upload}>
        <label>Módulo
          <select value={moduleKey} onChange={e=>setModuleKey(e.target.value)} disabled={!writeAllowed||busy}>
            {allowed.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        <label>Seleccionar archivo
          <input id="tenant-file-upload" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv" onChange={e=>setFile(e.target.files?.[0]??null)} disabled={!writeAllowed||busy}/>
        </label>
        <button type="submit" className="button primary" disabled={!file||!writeAllowed||busy}>
          <UploadCloud size={16}/>{busy?"Subiendo y verificando…":"Subir documento"}
        </button>
      </form>
      {!writeAllowed && <p className="muted">No hay módulos con permiso de archivos en esta cuenta.</p>}
    </div>
    {error && <div role="alert" className="notice">{error}</div>}
    {notice && <div role="status" className="notice">{notice}</div>}
    <div className="card">
      <h3>Documentos de la empresa</h3>
      {loading ? <p>Cargando archivos…</p> :
       rows.length===0 ? <p className="muted">Todavía no hay documentos disponibles.</p> :
       <div className="stack gap-16">
         {rows.map(row=><div className="card" key={row.id} style={{overflowWrap:"anywhere"}}>
           <strong>{row.filename}</strong>
           <p className="muted">{row.module_key} · {(row.byte_size/1024).toFixed(1)} KB · {new Date(row.created_at).toLocaleDateString("es-DO")} · {row.status==="ready"?"Verificado":"Reserva incompleta"}</p>
           <div className="top-actions">
             <button type="button" className="button" disabled={row.status!=="ready"||activeAction!==null} onClick={()=>void download(row)}><Download size={16}/> Descargar</button>
             <button type="button" className="button" disabled={activeAction!==null} onClick={()=>void remove(row)}><Trash2 size={16}/> Eliminar</button>
           </div>
         </div>)}
       </div>}
    </div>
  </section>;
}
