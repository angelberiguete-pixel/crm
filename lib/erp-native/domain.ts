/**
 * Empresia native ERP domain rules (PostgreSQL/Next.js).
 * Pure, deterministic functions. They never perform database writes.
 * Server-side authorization, RLS, locking and idempotency constraints are mandatory
 * at the transaction boundary; client-supplied tenant IDs are not authority.
 */
export type Money = { currency: "DOP" | "USD" | "EUR"; minor: number };
export type Stock = { tenantId: string; itemId: string; onHand: number; reserved: number; reorderLevel: number };
export type Movement = { tenantId: string; itemId: string; quantity: number; kind: "receipt" | "issue" | "reserve" | "release"; idempotencyKey: string };
function integer(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid_${label}`);
  return value;
}
export function assertSameTenant(expected: string, actual: string) {
  if (!expected || !actual || expected !== actual) throw new Error("tenant_mismatch");
}
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error("currency_mismatch");
  const minor = integer(a.minor, "amount") + integer(b.minor, "amount");
  return { currency: a.currency, minor: integer(minor, "amount") };
}
export function outstanding(total: Money, paid: Money): Money {
  if (total.currency !== paid.currency) throw new Error("currency_mismatch");
  const due = integer(total.minor, "total") - integer(paid.minor, "paid");
  return { currency: total.currency, minor: integer(due, "due") };
}
export function applyStockMovement(stock: Stock, movement: Movement): Stock {
  assertSameTenant(stock.tenantId, movement.tenantId);
  if (stock.itemId !== movement.itemId) throw new Error("item_mismatch");
  if (!movement.idempotencyKey.trim()) throw new Error("missing_idempotency_key");
  const qty = integer(movement.quantity, "quantity");
  if (qty === 0) throw new Error("zero_quantity");
  const next = { ...stock };
  integer(next.onHand, "on_hand"); integer(next.reserved, "reserved");
  if (movement.kind === "receipt") next.onHand += qty;
  if (movement.kind === "issue") next.onHand -= qty;
  if (movement.kind === "reserve") next.reserved += qty;
  if (movement.kind === "release") next.reserved -= qty;
  if (!Number.isSafeInteger(next.onHand) || !Number.isSafeInteger(next.reserved) ||
      next.onHand < 0 || next.reserved < 0 || next.reserved > next.onHand)
    throw new Error("insufficient_stock");
  return next;
}
export function needsReorder(stock: Stock): boolean {
  return stock.onHand - stock.reserved <= integer(stock.reorderLevel, "reorder_level");
}
export type JournalLine = { accountId: string; side: "debit" | "credit"; minor: number };
export function validateJournal(lines: readonly JournalLine[]) {
  if (lines.length < 2) throw new Error("journal_requires_two_lines");
  let debits = 0, credits = 0;
  for (const line of lines) {
    if (!line.accountId.trim()) throw new Error("missing_account");
    const amount = integer(line.minor, "journal_amount");
    if (amount === 0) throw new Error("zero_journal_line");
    if (line.side === "debit") debits += amount;
    else if (line.side === "credit") credits += amount;
    else throw new Error("invalid_side");
  }
  if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits) || debits !== credits)
    throw new Error("unbalanced_journal");
  return { debits, credits, balanced: true as const };
}
