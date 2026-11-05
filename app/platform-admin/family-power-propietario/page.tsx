"use client";
import Link from "next/link";
import Image from "next/image";
import {useEffect,useState,type FormEvent} from "react";
import {supabase} from "@/lib/supabase";
import styles from "../../family-power/login/family-login.module.css";

type SetupReply={ok?:boolean;ticket?:string;expires_minutes?:number;error?:string};
export default function FamilyPowerOwnerAdmin(){
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(true);
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [personVerified,setPersonVerified]=useState(false);
  const [domainControlled,setDomainControlled]=useState(false);
  const [link,setLink]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const {data,error}=await supabase.rpc("platform_current_access");
        if(active)setAuthorized(!error&&Boolean((data as {is_platform_admin?:boolean}|null)?.is_platform_admin));
      }catch{
        if(active)setAuthorized(false);
      }finally{
        if(active)setLoading(false);
      }
    })();
    return()=>{active=false;};
  },[]);
  async function create(e:FormEvent){
    e.preventDefault();
    if(!authorized||busy||!personVerified||!domainControlled)return;
    setBusy(true);setLink("");setMessage("");
    try{
      const result=await supabase.functions.invoke("family-power-owner-setup",{
        body:{action:"issue",email:email.trim().toLowerCase(),name:name.trim(),
          identity_confirmed:true,company_controls_email:true}
      });
      const data=(result.data??{}) as SetupReply;
      if(result.error||!data.ok||!data.ticket)throw new Error(data.error??"not_ready");
      // This URL fragment is not transmitted to the web server. Show only
      // to the authorized operator for handoff in person; never log or email it.
      setLink(window.location.origin+"/family-power/activar-propietario#ticket="+data.ticket);
      setMessage("Enlace generado. Úsalo durante la reunión presencial. Expira en 15 minutos y funciona una sola vez.");
    }catch{setMessage("No se pudo generar el enlace. Revisa si existe ya una cuenta para ese correo, si el propietario fue activado o si la configuración técnica sigue pendiente.");}
    finally{setBusy(false);}
  }
  async function copy(){
    if(!link)return;
    try{await navigator.clipboard.writeText(link);setMessage("Enlace copiado. Entrégalo solo al propietario identificado.");}
    catch{setMessage("No se pudo copiar automáticamente. Selecciona el enlace y cópialo de forma privada.");}
  }
  return <main className={styles.page}>
    <div className={styles.glow} aria-hidden="true"/>
    <div className={styles.layout}>
      <header className={styles.intro}>
        <div className={styles.logo}>
          <Image src="/client-brands/family-power/logo-negativo-sin-fondo.svg"
            width={620} height={240} alt="Family Power" unoptimized priority/>
        </div>
        <p className={styles.eyebrow}>Look Social Media · Administración autorizada</p>
        <h1>Activación del dueño de Family Power</h1>
        <p>Verifica su identidad en persona y entrégale un enlace privado para que establezca su contraseña. La plataforma conserva tu acceso de soporte separado.</p>
        <div className={styles.features}>
          <span>15 minutos de vigencia · un solo uso</span>
          <span>La contraseña nunca se muestra al administrador</span>
        </div>
      </header>
      <section className={styles.panel}>
        <div className={styles.panelTop}>ASIGNACIÓN SEGURA DEL PROPIETARIO</div>
        {loading?<p>Verificando autorización…</p>:
          !authorized?<><h2>Acceso restringido</h2><p>Esta operación requiere una sesión de administrador general de Look Social Media.</p></>:
          <>
            <h2>Preparar primer acceso</h2>
            <p>La dirección elegida será el identificador de inicio de sesión. No se envían correos ni contraseñas; la identidad debe confirmarse presencialmente.</p>
            <form className={styles.form} onSubmit={create}>
              <label htmlFor="setup-name">Nombre completo del propietario</label>
              <input id="setup-name" required minLength={3} maxLength={120} value={name}
                onChange={e=>setName(e.target.value)} placeholder="Nombre indicado por el dueño"/>
              <label htmlFor="setup-email">Correo que usará para entrar</label>
              <input id="setup-email" type="email" autoComplete="off" required maxLength={254}
                value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo bajo control empresarial"/>
              <label style={{display:"flex",gap:10,alignItems:"flex-start",fontWeight:500}}>
                <input type="checkbox" checked={personVerified}
                  onChange={e=>setPersonVerified(e.target.checked)} style={{width:18,minHeight:18,margin:0}}/>
                He comprobado personalmente que esta persona es el propietario autorizado de Family Power.
              </label>
              <label style={{display:"flex",gap:10,alignItems:"flex-start",fontWeight:500}}>
                <input type="checkbox" checked={domainControlled}
                  onChange={e=>setDomainControlled(e.target.checked)} style={{width:18,minHeight:18,margin:0}}/>
                La dirección de acceso pertenece al dueño o está bajo control de su empresa. No pertenece a terceros.
              </label>
              <button className={styles.submit} type="submit"
                disabled={busy||!personVerified||!domainControlled}>
                {busy?"Preparando…":"Generar enlace privado de activación"}
              </button>
            </form>
            {message&&<div className={styles.notice} role="status" style={{marginTop:16}}>{message}</div>}
            {link&&<div style={{marginTop:16}}>
              <label htmlFor="owner-setup-link">Enlace de activación — secreto temporal</label>
              <input id="owner-setup-link" readOnly value={link}
                style={{width:"100%",padding:12,margin:"8px 0",borderRadius:8}}/>
              <label htmlFor="owner-setup-code">Código privado (para activar desde el login normal)</label>
              <input id="owner-setup-code" readOnly value={link.split("#ticket=")[1]??""}
                style={{width:"100%",padding:12,margin:"8px 0",borderRadius:8}}/>
              <button type="button" onClick={()=>void copy()} className={styles.submit}>
                Copiar enlace para entregarlo en persona
              </button>
              <small>El dueño puede abrir el login habitual, pulsar «Crear mi contraseña de propietario» e introducir este código. Entrégalo únicamente en persona.</small>
            </div>}
            <p className={styles.invite}>Si el propietario no dispone de correo utilizable, habrá que definir un identificador corporativo cuya dirección no controle un tercero. La recuperación de contraseña exigirá una comprobación manual de identidad.</p>
            <Link className={styles.recovery} href="/platform-admin">Volver a Administración</Link>
          </>}
      </section>
    </div>
  </main>;
}
