import { NextResponse, type NextRequest } from "next/server";

/**
 * Defense in depth: the QA preview is a fixture-only microsite.
 * Existing /crm and /family-power routes use the production Supabase singleton.
 * Never let a QA preview accidentally open those routes.
 * No effect on production, default developer workflows, or other previews.
 */
export function proxy(request: NextRequest) {
  const qaPreview = process.env.VERCEL_ENV === "preview" &&
    process.env.EMPRESIA_QA_CENTER_ENABLED === "true";
  if (!qaPreview) return NextResponse.next();

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
