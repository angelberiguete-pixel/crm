"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function PropertySalesLoginPage(){
  const router=useRouter();
  const [mode,setMode]=useState<"login"|"seller">("login");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{if(data.session) router.replace("/property-sales");}); },[router]);

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const f=new FormData(e.currentTarget); setBusy(true); setMessage("");
    const email=String(f.get("email")||""); const password=String(f.get("password")||"");
    if(mode==="seller") localStorage.setItem("land_sales_pending_profile",JSON.stringify({fullName:String(f.get("name")||""),company:String(f.get("company")||""),phone:String(f.get("phone")||"")}));
    const result=mode==="login"?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});
    setBusy(false);
    if(result.error) return setMessage(result.error.message);
    if(result.data.session) router.replace("/property-sales");
    else setMessage("Cuenta creada. Confirma tu correo si Supabase lo solicita y luego inicia sesión. Tu solicitud de vendedor quedará pendiente de aprobación.");
  }

  return <main className="auth-shell"><section className="auth-panel"><div className="eyebrow">Proyecto 812 · Cevicos</div><h1>{mode==="login"?"Acceso al Sales Command Center":"Registro de vendedor"}</h1><p className="muted">{mode==="login"?"Administradores y vendedores autorizados ingresan desde aquí.":"Crea tu cuenta. El administrador revisará tu solicitud, definirá tu comisión y activará tu enlace personal."}</p>
  <form onSubmit={submit} className="stack gap-16">{mode==="seller"&&<><label>Nombre completo<input name="name" required/></label><label>Empresa / inmobiliaria<input name="company"/></label><label>WhatsApp<input name="phone"/></label></>}<label>Correo<input name="email" type="email" required autoComplete="email"/></label><label>Contraseña<input name="password" type="password" minLength={8} required autoComplete={mode==="login"?"current-password":"new-password"}/></label>{mode==="seller"&&<label style={{display:"flex",gap:8,alignItems:"flex-start"}}><input name="terms" type="checkbox" required style={{width:"auto",marginTop:4}}/><span>Acepto que la comisión solo se considera atribuida a compradores registrados mediante mi enlace y queda sujeta al acuerdo de corretaje y cierre efectivo.</span></label>}{message&&<div className="notice">{message}</div>}<button className="button primary" disabled={busy}>{busy?"Procesando…":mode==="login"?"Entrar":"Crear cuenta de vendedor"}</button></form>
  <button type="button" className="text-button" onClick={()=>{setMode(mode==="login"?"seller":"login");setMessage("");}}>{mode==="login"?"Quiero vender el terreno / solicitar acceso":"Ya tengo cuenta"}</button></section></main>;
}
