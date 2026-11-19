/**
 * Public, build-time Supabase selection.
 * Production retains its canonical coordinates; previews and local builds NEVER
 * inherit production credentials, including when their QA configuration is absent.
 * A disabled endpoint makes accidental traffic fail closed rather than use prod.
 */
export const EMPRESIA_PRODUCTION_PROJECT_REF = "ygipjqgyreeahslzorik";
const PRODUCTION_URL = "https://ygipjqgyreeahslzorik.supabase.co";
const PRODUCTION_PUBLISHABLE_KEY = "sb_publishable_2Q7aF-M61t2OZWRrt-vebQ_t_oNK_u7";
const DISABLED_URL = "https://qa-not-configured.invalid";
const DISABLED_KEY = "sb_publishable_qa_not_configured";

export type PublicBackendSettings = {
  projectRef?: string;
  url?: string;
  publishableKey?: string;
};
export type PublicBackendSelection = {
  mode: "production" | "qa" | "blocked";
  url: string;
  publishableKey: string;
  ready: boolean;
  reason: string;
};

function blocked(reason: string): PublicBackendSelection {
  return {mode:"blocked",url:DISABLED_URL,publishableKey:DISABLED_KEY,
    ready:false,reason};
}

/** Pure function: environment inputs are explicit so negative cases are testable. */
export function selectPublicBackend(
  buildTarget: string | undefined,
  qa: PublicBackendSettings = {}
): PublicBackendSelection {
  if (buildTarget === "production") {
    return {mode:"production",url:PRODUCTION_URL,
      publishableKey:PRODUCTION_PUBLISHABLE_KEY,ready:true,reason:"canonical_production"};
  }
  if (buildTarget !== "preview" && buildTarget !== "development") {
    return blocked("unverified_build_target");
  }
  const ref=qa.projectRef?.trim() ?? "";
  const url=qa.url?.trim() ?? "";
  const key=qa.publishableKey?.trim() ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref) || ref===EMPRESIA_PRODUCTION_PROJECT_REF) {
    return blocked("qa_project_ref_missing_or_production");
  }
  let parsed: URL;
  try { parsed=new URL(url); }
  catch { return blocked("qa_url_invalid"); }
  if (parsed.origin!==url || parsed.protocol!=="https:" ||
      parsed.hostname!==`${ref}.supabase.co` ||
      parsed.username || parsed.password || parsed.port ||
      parsed.pathname!=="/" || parsed.search || parsed.hash) {
    return blocked("qa_url_not_matching_isolated_ref");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]{15,}$/.test(key)) {
    return blocked("qa_publishable_key_missing");
  }
  return {mode:"qa",url,publishableKey:key,ready:true,reason:"qa_coordinates_validated"};
}
