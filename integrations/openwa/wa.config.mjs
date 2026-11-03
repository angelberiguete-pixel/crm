// Run on a persistent Node.js 22.21.1+ host, NOT inside a serverless route.
// The only public ingress to CRM is the authenticated Supabase Edge receiver.
const sessionId = process.env.OPENWA_SESSION_ID?.trim() ?? "";
const webhookSecret = process.env.OPENWA_WEBHOOK_SECRET?.trim() ?? "";
const webhookUrl = process.env.OPENWA_WEBHOOK_URL?.trim() ?? "";
const apiKey = process.env.OPENWA_API_KEY?.trim() ?? "";
const sessionKey = process.env.OPENWA_SESSION_DATA_ENCRYPTION_KEY?.trim() ?? "";
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sessionId)) throw Error("Invalid OPENWA_SESSION_ID");
if (webhookSecret.length < 32 || apiKey.length < 32) throw Error("Missing strong OpenWA secrets");
if (!/^https:\/\//.test(webhookUrl)) throw Error("OPENWA_WEBHOOK_URL must use HTTPS");
if (!sessionKey) throw Error("OPENWA_SESSION_DATA_ENCRYPTION_KEY is required");

export default {
  sessionId,
  host: "127.0.0.1",
  port: 8080,
  apiKey,
  sessionDataEncryptionKey: sessionKey,
  plugins: ["@open-wa/integration-webhook"],
  pluginConfig: {
    webhook: {
      url: webhookUrl,
      events: ["message.received", "session.state.changed"],
      headers: { "X-Webhook-Secret": webhookSecret },
      retries: 3,
      retryDelay: 1000,
      timeout: 30000,
      queueCapacity: 1000,
      overload: "backpressure",
      durability: {
        // The host must have a persistent writable working directory.
        enabled: true,
        path: ".openwa/webhook-deliveries.sqlite",
        replayLimit: 1000
      }
    }
  }
};
