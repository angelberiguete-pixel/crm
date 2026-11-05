import { notFound } from "next/navigation";
import { CRM_SUPABASE_URL, CRM_SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase";
import McpPilotTest from "@/components/mcp-pilot-test";

export const dynamic = "force-dynamic";
export default function McpPilotPage() {
  // Production must not expose the test harness, even if a flag is accidentally set.
  if (process.env.VERCEL_ENV !== "preview" || process.env.MCP_INTERNAL_ENABLED !== "true") {
    notFound();
  }
  return <McpPilotTest url={CRM_SUPABASE_URL} publishableKey={CRM_SUPABASE_PUBLISHABLE_KEY}/>;
}
