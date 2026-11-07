import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function verify(raw: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map(p => p.trim().split("=", 2)));
  const timestamp = parts.t;
  const signatures = header.split(",").filter(p => p.trim().startsWith("v1=")).map(p => p.trim().slice(3));
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + raw).digest("hex");
  return signatures.some(signature => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 });
  const raw = await request.text();
  if (!verify(raw, signature, secret)) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  // Do not treat a browser success redirect as proof of payment.
  // Durable fulfillment requires a database event ledger, idempotency and tenant mapping.
  const event = JSON.parse(raw) as { type: string; id: string };
  if (event.type === "checkout.session.completed") {
    return NextResponse.json({ error: "Fulfillment is not configured; event must be retried." }, { status: 503 });
  }
  return NextResponse.json({ received: true });
}
