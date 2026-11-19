import type { NextConfig } from "next";

// Build-time target is intentionally embedded into both browser and server
// bundles; a local/CI build must not silently behave as Vercel production.
// VERCEL_ENV is supplied by Vercel, NOT by an untrusted browser request.
const buildTarget=process.env.VERCEL_ENV==="production" ? "production" :
  process.env.VERCEL_ENV==="preview" ? "preview" :
  process.env.NODE_ENV==="development" ? "development" : "unverified";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { EMPRESIA_BUILD_TARGET: buildTarget },
};
export default nextConfig;
