"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

// Minimal privacy-conscious PostHog event collection (SDK/replay can be added later).
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const distinctKey = "crm:analytics:anonymous-id";

function track(event: string, distinctId: string, properties: Record<string, string>) {
  if (!token || !host || typeof window === "undefined") return;
  // Never include email, financial content, message bodies or URL query strings.
  void fetch(host.replace(/\/$/, "") + "/capture/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: token, event, distinct_id: distinctId, properties }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function IntegrationsTelemetry() {
  const pathname = usePathname();
  useEffect(() => {
    if (!token || !host || !pathname) return;
    let anonymousId = window.sessionStorage.getItem(distinctKey);
    if (!anonymousId) {
      anonymousId = crypto.randomUUID();
      window.sessionStorage.setItem(distinctKey, anonymousId);
    }
    let active = true;
    const safePath = pathname
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
      .replace(/\/[0-9]{4,}(?=\/|$)/g, "/:id");
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id || anonymousId!;
      track("$pageview", id, { "$pathname": safePath, "app": "crm" });
    });
    return () => { active = false; };
  }, [pathname]);
  return null;
}
