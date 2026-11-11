import {NextResponse,type NextRequest} from "next/server";

/**
 * This branch's Vercel previews are deliberately restricted to a disconnected
 * mobile lab. The real CRM (which uses a pinned production Supabase project)
 * must never be visited from a preview until a separate database is approved.
 * Production is unaffected because the guard only runs for Vercel preview.
 */
export function proxy(request:NextRequest){
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.next();
 const path=request.nextUrl.pathname;
 if(path==="/laboratorio-ia"||path.startsWith("/laboratorio-ia/")||
    path.startsWith("/_next/")||path==="/favicon.ico"||
    path==="/empresia-icon.svg") {
   const response=NextResponse.next();
   response.headers.set("X-Empresia-Preview-Mode","isolated-lab");
   response.headers.set("Cache-Control","no-store");
   return response;
 }
 if(path.startsWith("/api/")||path.startsWith("/auth/")||
    path.startsWith("/crm/")||path==="/crm") {
   return new NextResponse("Esta vista está deshabilitada en la versión de laboratorio.",{
     status:403,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","X-Empresia-Preview-Mode":"isolated-lab"}
   });
 }
 const target=request.nextUrl.clone();
 target.pathname="/laboratorio-ia";
 target.search="";
 return NextResponse.redirect(target,307);
}

export const config={matcher:["/((?!_next/static|_next/image).*)"]};
