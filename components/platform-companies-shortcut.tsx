"use client";
import Link from "next/link";
import {Building2} from "lucide-react";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

/** Never show global client portfolio navigation to a client or vendor.
 * The destination validates platform permissions again on every request.
 */
export default function PlatformCompaniesShortcut(){
 const [allowed,setAllowed]=useState(false);
 useEffect(()=>{
   let alive=true;
   void supabase.rpc("platform_current_access").then(({data,error})=>{
     if(alive)setAllowed(!error&&Boolean((data as {is_platform_admin?:boolean}|null)?.is_platform_admin));
   }).catch(()=>{if(alive)setAllowed(false);});
   return()=>{alive=false;};
 },[]);
 return allowed?<Link href="/mis-empresas" aria-label="Mis empresas cliente"><Building2 size={16}/> Mis empresas</Link>:null;
}
