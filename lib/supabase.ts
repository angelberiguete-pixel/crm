import { createClient, type Session } from "@supabase/supabase-js";
import {selectPublicBackend} from "./qa-backend-selection";

// Next config stamps VERCEL_ENV into both server and browser bundles. Unknown
// build targets and incomplete preview QA configs select a disabled endpoint,
// NEVER the production database. No credentials are read from a tenant or URL.
const backend=selectPublicBackend(process.env.EMPRESIA_BUILD_TARGET,{
  projectRef:process.env.NEXT_PUBLIC_EMPRESIA_QA_PROJECT_REF,
  url:process.env.NEXT_PUBLIC_EMPRESIA_QA_SUPABASE_URL,
  publishableKey:process.env.NEXT_PUBLIC_EMPRESIA_QA_SUPABASE_PUBLISHABLE_KEY,
});
const url=backend.url,key=backend.publishableKey;

// Only public coordinates may reach browser code; never use a service_role key.
export { url as CRM_SUPABASE_URL, key as CRM_SUPABASE_PUBLISHABLE_KEY };
export const CRM_BACKEND_MODE=backend.mode;
export const CRM_BACKEND_READY=backend.ready;

// Bump this marker whenever production data routing changes so Git/Vercel emits
// a fresh production build instead of leaving an older frontend bundle live.
export const CRM_DATASET_VERSION = "look-social-media-2026-10-11";

function readAuthLinkError() {
  if(typeof window === "undefined") return "";
  const hash=new URLSearchParams(window.location.hash.slice(1)),query=new URLSearchParams(window.location.search);
  const code=hash.get("error_code")||query.get("error_code"),error=hash.get("error")||query.get("error");
  if(!code&&!error) return "";
  return code==="otp_expired" ? "El enlace venció o ya fue utilizado. Solicita un enlace nuevo." : "El enlace no es válido. Abre el enlace más reciente o solicita uno nuevo.";
}
// Capture before the Auth client consumes/removes the redirect fragment.
const initialAuthLinkError=readAuthLinkError();
export const getAuthLinkError=()=>readAuthLinkError()||initialAuthLinkError;

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let recoveryUserId:string|null=null,recoveryExpiresAt=0;
if(typeof window !== "undefined") supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="PASSWORD_RECOVERY" && session){recoveryUserId=session.user.id;recoveryExpiresAt=session.expires_at??0;}
  else if(event==="SIGNED_OUT" || event==="USER_UPDATED"){recoveryUserId=null;recoveryExpiresAt=0;}
});
export function isPasswordRecoverySession(session:Session|null){
  return Boolean(session && session.user.id===recoveryUserId && recoveryExpiresAt>Date.now()/1000);
}
