"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {FileText,Images,ShieldAlert} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
type Doc={filename:string;url:string;status?:string};
type Library={photos:Doc[];documents:Doc[];status:string;isDrivePreview:boolean};
const photoFolder="https://drive.google.com/drive/folders/10kwV3jribHKNGmuQRnJOx1IaNl8kiRsj";
export default function FamilyPowerEvidenceLibrary(){
 const tenant=useActiveTenant();
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant.membership_role);
 const [library,setLibrary]=useState<Library|null>(null);
 const [selected,setSelected]=useState<Doc|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  setLibrary(null);setSelected(null);setLoading(true);setError("");
  if(!allowed){setLoading(false);return()=>{active=false;};}
  void(async()=>{
   try{
    const session=await supabase.auth.getSession();
    const token=session.data.session?.access_token;
    if(!token)throw Error("authentication_required");
    const response=await fetch("/api/family-power/evidence",{
      method:"GET",headers:{Authorization:"Bearer "+token},cache:"no-store"
    });
    if(!response.ok)throw Error("access_denied");
    const data=await response.json() as Library;
    if(!active)return;
    setLibrary(data);
    setSelected(data.photos[0]??null);
   }catch{if(active)setError("No se pudo abrir la biblioteca. Comprueba la sesión y los permisos del CRM.");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[allowed,tenant?.tenant_id]);
 if(!allowed)return null;
 return <section className="card stack gap-12" aria-label="Biblioteca documental de Family Power en revisión">
  <header><div className="eyebrow"><Images size={15}/> Family Power · Referencias originales</div>
    <h2>Biblioteca documental en revisión</h2>
    <p className="muted">Fotos y ficha PDF existentes en Google Drive. Todavía no son productos con ficha y precio aprobados, ni se sincronizan automáticamente.</p>
  </header>
  <div className="notice" role="status"><ShieldAlert size={16}/> Documentación para revisión presencial. No enviar como ficha técnica oficial ni utilizarla para cotizar hasta verificar fabricante, placa, modelo y precio con Family Power.</div>
  {loading&&<p role="status">Verificando permisos de acceso a fotografías…</p>}
  {error&&<div className="notice" role="alert">{error}</div>}
  {library&&<>
   <div className="family-evidence-grid">
    {library.photos.map(p=><button type="button" className="family-evidence-tile" key={p.filename}
      aria-pressed={selected?.filename===p.filename} onClick={()=>setSelected(p)}>
       <Images size={18}/><span>{p.filename}</span><small>Foto original · en revisión</small>
     </button>)}
    {library.documents.map(p=><button type="button" className="family-evidence-tile" key={p.filename}
     aria-pressed={selected?.filename===p.filename} onClick={()=>setSelected(p)}>
      <FileText size={18}/><span>Ficha PDF · borrador</span><small>Datos técnicos sin validar</small>
    </button>)}
   </div>
   {selected&&<div className="family-evidence-preview">
     <h3>{selected.filename}</h3>
     <p className="muted">{selected.status??"Fotografía original proporcionada, aún sin modelo ni precio corroborados"}</p>
     <iframe title={"Vista previa documental de "+selected.filename}
       referrerPolicy="strict-origin-when-cross-origin"
       loading="lazy"
       src={selected.url.replace("/view?usp=drivesdk","/preview")}
       sandbox="allow-scripts allow-same-origin allow-popups"
       style={{width:"100%",height:330,border:"1px solid var(--border)",borderRadius:12}}/>
     <div className="top-actions">
       <a className="button" target="_blank" rel="noreferrer noopener" href={selected.url}>Abrir original en Google Drive</a>
       <Link className="button" href="/crm/files">Subir al almacenamiento privado del CRM</Link>
     </div>
     <p className="muted">La vista previa de Drive puede requerir que el usuario tenga permiso sobre el archivo. No está copiado al catálogo ni disponible para envío automático por WhatsApp.</p>
   </div>}
   <p className="muted">{library.photos.length} fotos originales y {library.documents.length} documento PDF en revisión. <a href={photoFolder} target="_blank" rel="noopener noreferrer">Consultar carpeta fuente de Drive</a>.</p>
  </>}
 </section>;
}
