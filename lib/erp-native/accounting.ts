/** Deterministic workpapers only. Persistence, approval and period controls belong to the server. */
export type AccountCategory = "asset" | "liability" | "equity" | "income" | "expense";
export type LedgerAccount = Readonly<{ tenantId: string; id: string; code: string; name: string; category: AccountCategory }>;
export type LedgerLine = Readonly<{ accountId: string; side: "debit" | "credit"; minor: string }>;
export type LedgerEntry = Readonly<{
  tenantId: string; id: string; date: string; currency: string; status: "draft" | "posted";
  lines: readonly LedgerLine[];
}>;

const categories = new Set<AccountCategory>(["asset", "liability", "equity", "income", "expense"]);
const currencies = new Set(["DOP", "USD", "EUR"]);

function unsignedMinor(value: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(value)) throw new Error("invalid_minor_amount");
  return BigInt(value);
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}

/** No floating point conversion: amounts supplied by forms/API remain decimal strings. */
export function decimalToMinor(value: string): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value)) throw new Error("invalid_decimal_amount");
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

export function minorToDecimal(value: string): string {
  const amount = unsignedMinor(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}

function accountMap(tenantId: string, accounts: readonly LedgerAccount[]) {
  if (!tenantId) throw new Error("tenant_required");
  const result = new Map<string, LedgerAccount>();
  const codes = new Set<string>();
  for (const account of accounts) {
    if (account.tenantId !== tenantId) throw new Error("tenant_mismatch");
    if (!account.id.trim() || !account.code.trim() || !account.name.trim() || !categories.has(account.category)) throw new Error("invalid_account");
    if (result.has(account.id) || codes.has(account.code)) throw new Error("duplicate_account");
    result.set(account.id, account); codes.add(account.code);
  }
  return result;
}

export function validateLedgerEntry(tenantId: string, entry: LedgerEntry, accounts: readonly LedgerAccount[]) {
  const chart = accountMap(tenantId, accounts);
  if (entry.tenantId !== tenantId) throw new Error("tenant_mismatch");
  if (!entry.id.trim() || !validDate(entry.date) || !currencies.has(entry.currency)
    || !["draft", "posted"].includes(entry.status)) throw new Error("invalid_entry");
  if (entry.lines.length < 2) throw new Error("journal_requires_two_lines");
  let debit = 0n, credit = 0n;
  for (const line of entry.lines) {
    if (!chart.has(line.accountId)) throw new Error("unknown_account");
    const amount = unsignedMinor(line.minor);
    if (amount === 0n) throw new Error("zero_journal_line");
    if (line.side === "debit") debit += amount;
    else if (line.side === "credit") credit += amount;
    else throw new Error("invalid_side");
  }
  if (debit !== credit) throw new Error("unbalanced_journal");
  return { debitMinor: debit.toString(), creditMinor: credit.toString() };
}

/** Returns a draft. It never approves or edits the original entry. */
export function prepareReversal(tenantId: string, original: LedgerEntry, accounts: readonly LedgerAccount[], newId: string, date: string) {
  validateLedgerEntry(tenantId, original, accounts);
  if (original.status !== "posted") throw new Error("posted_entry_required");
  if (!newId.trim() || newId === original.id) throw new Error("new_entry_id_required");
  const reversal: LedgerEntry = Object.freeze({
    tenantId, id: newId, date, currency: original.currency, status: "draft",
    lines: Object.freeze(original.lines.map(line => Object.freeze({
      ...line, side: line.side === "debit" ? "credit" as const : "debit" as const,
    }))),
  });
  validateLedgerEntry(tenantId, reversal, accounts);
  return Object.freeze({ entry: reversal, reversesEntryId: original.id, requiresHumanApproval: true as const });
}

/** Posted journals only, one tenant/currency, inclusive date range; no FX mixing. */
export function trialBalance(tenantId: string, currency: string, accounts: readonly LedgerAccount[], entries: readonly LedgerEntry[], through: string, from?: string) {
  const chart = accountMap(tenantId, accounts);
  if (!currencies.has(currency) || !validDate(through) || (from !== undefined && (!validDate(from) || from > through))) throw new Error("invalid_report_scope");
  const totals = new Map([...chart.keys()].map(id => [id, { debit: 0n, credit: 0n }]));
  const ids = new Set<string>();
  for (const entry of entries) {
    validateLedgerEntry(tenantId, entry, accounts);
    if (ids.has(entry.id)) throw new Error("duplicate_entry");
    ids.add(entry.id);
    if (entry.currency !== currency) throw new Error("currency_mismatch");
    if (entry.status !== "posted" || entry.date > through || (from && entry.date < from)) continue;
    for (const line of entry.lines) totals.get(line.accountId)![line.side] += unsignedMinor(line.minor);
  }
  const rows = [...chart.values()].sort((a, b) => a.code.localeCompare(b.code, "en")).map(account => {
    const total = totals.get(account.id)!;
    const net = total.debit - total.credit;
    return { ...account, debitMinor: total.debit.toString(), creditMinor: total.credit.toString(), balanceMinor: net.toString() };
  });
  const debit = rows.reduce((sum, row) => sum + BigInt(row.debitMinor), 0n);
  const credit = rows.reduce((sum, row) => sum + BigInt(row.creditMinor), 0n);
  return { tenantId, currency, through, from: from ?? null, rows, debitMinor: debit.toString(), creditMinor: credit.toString(), balanced: debit === credit };
}

export function financialWorkpapers(tenantId: string, currency: string, accounts: readonly LedgerAccount[], entries: readonly LedgerEntry[], through: string) {
  const balance = trialBalance(tenantId, currency, accounts, entries, through);
  const sum = (category: AccountCategory) => balance.rows.filter(row => row.category === category).reduce((total, row) => total + BigInt(row.balanceMinor), 0n);
  const income = -sum("income"), expenses = sum("expense"), profit = income - expenses;
  const assets = sum("asset"), liabilities = -sum("liability"), equity = -sum("equity");
  return {
    ...balance,
    incomeStatement: { incomeMinor: income.toString(), expenseMinor: expenses.toString(), profitMinor: profit.toString() },
    balanceSheet: { assetMinor: assets.toString(), liabilityMinor: liabilities.toString(), equityMinor: equity.toString(), retainedProfitMinor: profit.toString(), balanced: assets === liabilities + equity + profit },
    purpose: "workpaper" as const,
  };
}
