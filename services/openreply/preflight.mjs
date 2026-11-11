// Validate locally. Never print environment values or credentials.
const errors = [];
const env = process.env;
const usable = name => typeof env[name] === "string" && env[name].length > 0
  && !/YOUR_|GENERATE_|SET_ONLY_|URL_ENCODED_/i.test(env[name]);
for (const name of ["DATABASE_URL", "REDIS_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "CRON_SECRET", "ENCRYPTION_KEY", "ALLOWED_EMAILS", "EMAIL_FROM", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "FACEBOOK_APP_SECRET", "WEBHOOK_VERIFY_TOKEN"]) {
  if (!usable(name)) errors.push(`${name}: missing or placeholder`);
}
for (const name of ["NEXTAUTH_SECRET", "CRON_SECRET", "WEBHOOK_VERIFY_TOKEN"]) {
  if ((env[name]?.length ?? 0) < 32) errors.push(`${name}: at least 32 random characters required`);
}
if (!/^[a-f0-9]{64}$/i.test(env.ENCRYPTION_KEY ?? "")) errors.push("ENCRYPTION_KEY: expected 64 hexadecimal characters");
if (!usable("EMAIL_SERVER") && !usable("RESEND_API_KEY")) errors.push("Authentication needs an existing authorized SMTP or Resend service");
for (const [name, schemes] of [["NEXTAUTH_URL", ["https:"]], ["DATABASE_URL", ["postgres:", "postgresql:"]], ["REDIS_URL", ["redis:", "rediss:"]]]) {
  try {
    const url = new URL(env[name]);
    if (!schemes.includes(url.protocol)) throw Error();
    if (name !== "NEXTAUTH_URL" && url.password.length < 32) throw Error();
  } catch { errors.push(`${name}: invalid or insufficiently protected URL`); }
}
if (new Set([env.NEXTAUTH_SECRET, env.CRON_SECRET, env.WEBHOOK_VERIFY_TOKEN]).size < 3) errors.push("Authentication, cron and webhook secrets must be distinct");
if (errors.length) { console.error("OpenReply configuration rejected:\n" + errors.join("\n")); process.exit(1); }
console.log("OpenReply runtime configuration validated; no secret values printed.");
