"use client";

import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect,useState,type FormEvent} from "react";
import {supabase} from "@/lib/supabase";
import {familyPowerMembership} from "@/lib/family-power-access";

export default function FamilyPowerAccountPage(){
  const router=useRouter();
  const [ready,setReady]=useState(false);
  const [current,setCurrent]=useState("");
  const [next,setNext]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;
    void (async()=>{
      const [{data:{user}},memberships]=await Promise.all([supabase.auth.getUser(),supabase.rpc("list_my_tenants")]);
      if(!active)return;
      if(!user||memberships.error||!familyPowerMembership(memberships.data as any)){
        router.replace("/family-power/login");return;
      }
      setReady(true);
    })();
    return()=>{active=false};
  },[router]);
  async function change(e:FormEvent){
    e.preventDefault();
    if(!ready||busy)return;
    if(next.length<12||next!==confirm){setMessage("Comprueba la nueva contraseña: mínimo 12 caracteres y ambos campos iguales.");return;}
    setBusy(true);setMessage("");
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user?.email)throw new Error("No se encontró una cuenta válida.");
      const verified=await supabase.auth.signInWithPassword({email:user.email,password:current});
      if(verified.error||!verified.data.session){setMessage("La contraseña actual es incorrecta.");return;}
      const updated=await supabase.auth.updateUser({password:next});
      if(updated.error){setMessage("No se pudo guardar la contraseña: "+updated.error.message);return;}
      setCurrent("");setNext("");setConfirm("");
      setMessage("Contraseña actualizada. Desde ahora utiliza la nueva para iniciar sesión.");
    }catch{setMessage("No se pudo actualizar la contraseña. Vuelve a intentarlo.");}
    finally{setBusy(false)}
  }
  return <main style={{minHeight:"100vh",background:"#101115",color:"#f7f8fa",padding:"min(8vw,48px) 18px"}}>
    <section style={{maxWidth:490,margin:"0 auto",padding:24,borderRadius:18,background:"#202128",border:"1px solid #ffffff22"}}>
      <Image src="/client-brands/family-power/logo-negativo.svg" width={260} height={100} alt="Family Power" style={{maxWidth:"100%",height:"auto"}}/>
      <h1 style={{fontSize:26,margin:"12px 0"}}>Seguridad de tu cuenta</h1>
      <p>Actualiza tu contraseña sin necesitar acceso a un correo electrónico.</p>
      {!ready?<p>Comprobando permisos de Family Power…</p>:<form onSubmit={change} style={{display:"grid",gap:12,marginTop:20}}>
        <label>Contraseña actual<input type="password" value={current} onChange={e=>setCurrent(e.target.value)} autoComplete="current-password" required style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label>
        <label>Nueva contraseña (mínimo 12 caracteres)<input type="password" value={next} onChange={e=>setNext(e.target.value)} autoComplete="new-password" minLength={12} required style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label>
        <label>Confirmar contraseña<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" minLength={12} required style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label>
        <button disabled={busy} type="submit" style={{padding:14,borderRadius:10,border:0,background:"#d20a14",color:"#fff",fontWeight:700}}>{busy?"Guardando…":"Cambiar contraseña"}</button>
      </form>}
      {message&&<p role="status" style={{paddingTop:14}}>{message}</p>}
      <p style={{marginTop:20}}><Link href="/crm" style={{color:"#f4f5f7"}}>← Volver al panel</Link></p>
    </section>
  </main>;
}
