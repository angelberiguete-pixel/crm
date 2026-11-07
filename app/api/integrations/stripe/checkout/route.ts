import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Fixed server-side Price ID prevents clients from changing amounts or currency.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_TEST_PRICE_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!secret || !priceId || !supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  }
  // This first integration is intentionally sandbox-only.
  if (!secret.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Only Stripe test mode is enabled." }, { status: 503 });
  }
  const bearer = request.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(bearer.slice(7));
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !/^https:\/\//.test(origin)) {
    return NextResponse.json({ error: "Invalid application URL configuration." }, { status: 503 });
  }
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: origin + "/pagos?stripe=success&session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/pagos?stripe=cancel",
    client_reference_id: data.user.id,
  });
  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });
  const result = await stripeResponse.json().catch(() => ({})) as {
    id?: string; url?: string; error?: { message?: string };
  };
  if (!stripeResponse.ok || !result.url) {
    return NextResponse.json({ error: "Checkout could not be created." }, { status: 502 });
  }
  return NextResponse.json({ id: result.id, url: result.url });
}
