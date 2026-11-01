"use client";
import {useEffect,useState} from "react";
import {FileText,ImageIcon} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
type Doc={filename:string;url:string;status?:string};
type Library={photos:Doc[];documents:Doc[];status:string;isDrivePreview:boolean};
const photoFolder="https://drive.google.com/drive/folders/10kwV3jribHKNGmuQRnJOx1IaNl8kiRsj";
function driveThumbnail(url:string):string|null{
 const id=url.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})\//)?.[1];
 return id?"https://drive.google.com/thumbnail?id="+id+"&sz=w500":null;
}
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
 return <section className="card stack gap-12" aria-label="Fotografías y documentos de Family Power">
  <header className="topbar"><div><h2>Fotografías y fichas</h2><small className="muted">Referencias por verificar</small></div>
  <a className="button small" target="_blank" rel="noopener noreferrer" href={photoFolder}>Drive</a></header>
  {loading&&<p role="status">Cargando archivos…</p>}
  {error&&<div className="notice" role="alert">{error}</div>}
  {library&&<>
   <div className="family-evidence-grid">
    {library.photos.map((p,index)=><button type="button" className="family-evidence-tile" key={p.filename}
      aria-pressed={selected?.filename===p.filename} onClick={()=>setSelected(p)}>
       <span className="family-evidence-photo">
        {driveThumbnail(p.url)?<img src={driveThumbnail(p.url)??""} alt={"Foto "+(index+1)} loading="lazy" referrerPolicy="no-referrer"
         onError={e=>{e.currentTarget.style.visibility="hidden";}}/>:<ImageIcon size={40}/>}
       </span>
       <span>Foto {index+1}</span><small>Por verificar</small>
     </button>)}
    {library.documents.map(p=><button type="button" className="family-evidence-tile" key={p.filename}
     aria-pressed={selected?.filename===p.filename} onClick={()=>setSelected(p)}>
      <span className="family-evidence-photo"><FileText size={42}/></span>
      <span>Ficha técnica PDF</span><small>Por verificar</small>
    </button>)}
   </div>
   {selected&&<div className="family-evidence-preview">
     <div className="topbar"><h3>{selected.filename}</h3>
       <button className="button small" type="button" onClick={()=>setSelected(null)}>Cerrar</button></div>
     <iframe title={"Vista previa de "+selected.filename}
       referrerPolicy="strict-origin-when-cross-origin" loading="lazy"
       src={selected.url.replace("/view?usp=drivesdk","/preview")}
       sandbox="allow-scripts allow-same-origin allow-popups"
       style={{width:"100%",height:330,border:"1px solid var(--border)",borderRadius:12}}/>
     <a className="button" target="_blank" rel="noopener noreferrer" href={selected.url}>Abrir original</a>
   </div>}
  </>}
 </section>;
}
