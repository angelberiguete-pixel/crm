/**
 * Normalize the documented OpenWA v5 webhook envelope.
 * This parser is deliberately unaware of tenant IDs: only the database's
 * pre-verified session -> channel mapping can choose a tenant.
 * Invoke ONLY after authenticating the incoming webhook.
 */
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value : null;

export function parseOpenWaInboundText(raw) {
  const event = record(raw);
  const payload = record(event?.payload);
  const message = record(payload?.message);
  if (event?.event !== "message.received" ||
      typeof event.webhookId !== "string" || !event.webhookId ||
      typeof event.sessionId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(event.sessionId) ||
      typeof event.timestamp !== "number" || !Number.isFinite(event.timestamp) ||
      !message || message.fromMe === true || message.isGroupMsg === true) return null;

  // Reject groups, LIDs and unrecognized IDs; never guess the phone number.
  const sender = typeof message.from === "string"
    ? /^([1-9][0-9]{7,14})@c\.us$/.exec(message.from) : null;
  const id = message.id;
  const body = typeof message.body === "string" ? message.body.trim() : "";
  if (!sender || typeof id !== "string" || id.length < 3 || id.length > 256 ||
      !body || body.length > 1600 ||
      (message.type != null && !["chat", "text"].includes(message.type))) return null;

  const contactName = typeof message.notifyName === "string"
    ? message.notifyName.trim().slice(0, 120) : "";
  return {
    sessionId: event.sessionId,
    externalMessageId: id,
    from: "+" + sender[1],
    contactName,
    body
  };
}
