import { NextResponse, type NextRequest } from "next/server";

/**
 * Defense in depth: the QA preview is a fixture-only microsite.
 * Existing /crm and /family-power routes use the production Supabase singleton.
 * Never let a QA preview accidentally open those routes.
 * No effect on production, default developer workflows, or other previews.
 */
export function proxy(request: NextRequest) {
  // This QA branch is fixture-only. A missing feature flag is NOT permission
  // to reach live CRM APIs from a preview: reject the entire preview instead.
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.next();
  if (process.env.EMPRESIA_QA_CENTER_ENABLED !== "true")
    return new NextResponse("Not found", {status:404,headers:{"Cache-Control":"no-store"}});

  const path = request.nextUrl.pathname;
  const allowed = path === "/qa/mobile" || path === "/qa/mobile/" ||
    path.startsWith("/_next/") ||
    path === "/empresia-logo-light.svg" ||
    path === "/empresia-icon.svg" ||
    path === "/favicon.ico";
  if (!allowed) return new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" }
  });
  return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
