/** Pure, tenant-scoped receivables aging. No monetary floats, database writes, or FX mixing. */
import type {CommercialInvoice} from './commercial-document';
function agingMinor(value:string):bigint {
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value))throw Error('invalid_commercial_amount');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}

export type Receivable = Pick<CommercialInvoice,'id'|'tenant_id'|'currency'|'total'|'amount_paid'|'outstanding'|'due_date'>;
export type AgingKey = 'not_due'|'days_1_30'|'days_31_60'|'days_61_90'|'days_91_plus';
const keys: readonly AgingKey[] = ['not_due','days_1_30','days_31_60','days_61_90','days_91_plus'];
const labels: Record<AgingKey,string> = {
  not_due:'Por vencer / al día',days_1_30:'Vencidas 1–30 días',days_31_60:'Vencidas 31–60 días',
  days_61_90:'Vencidas 61–90 días',days_91_plus:'Vencidas más de 90 días',
};
function calendarDay(value:string):number {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('invalid_aging_date');
  const day=Date.parse(`${value}T00:00:00Z`);
  if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==value)throw Error('invalid_aging_date');
  return Math.floor(day/86400000);
}
function bucketFor(daysLate:number):AgingKey {
  if(daysLate<=0)return 'not_due';
  if(daysLate<=30)return 'days_1_30';
  if(daysLate<=60)return 'days_31_60';
  if(daysLate<=90)return 'days_61_90';
  return 'days_91_plus';
}
export function formatReceivableMoney(minorString:string,currency:string):string {
  if(!['DOP','USD','EUR'].includes(currency)||!/^(0|[1-9]\d*)$/.test(minorString))throw Error('invalid_aging_amount');
  const value=BigInt(minorString);
  return `${currency} ${(value/100n).toLocaleString('en-US')}.${(value%100n).toString().padStart(2,'0')}`;
}
/** `invoices` must already be fetched through authorized tenant RLS; this function rejects mixed-tenant input too. */
export function buildReceivablesAging(invoices:readonly Receivable[],tenantId:string,asOf:string) {
  if(!tenantId.trim())throw Error('tenant_required');
  const today=calendarDay(asOf),ids=new Set<string>();
  const amounts=new Map<string,{
    total:bigint;overdue:bigint;openInvoices:number;overdueInvoices:number;
    buckets:Map<AgingKey,{amount:bigint;count:number}>;
  }>();
  for(const invoice of invoices) {
    if(invoice.tenant_id!==tenantId)throw Error('tenant_mismatch');
    if(typeof invoice.id!=='string'||!invoice.id.trim()||ids.has(invoice.id))throw Error('duplicate_or_invalid_invoice');
    ids.add(invoice.id);
    if(!['DOP','USD','EUR'].includes(invoice.currency))throw Error('unsupported_commercial_currency');
    const due=calendarDay(invoice.due_date),total=agingMinor(invoice.total);
    const paid=agingMinor(invoice.amount_paid),dueMinor=agingMinor(invoice.outstanding);
    if(paid+dueMinor!==total)throw Error('invoice_balance_mismatch');
    if(dueMinor===0n)continue;
    const group=amounts.get(invoice.currency)??{
      total:0n,overdue:0n,openInvoices:0,overdueInvoices:0,
      buckets:new Map<AgingKey,{amount:bigint;count:number}>(keys.map(key=>[key,{amount:0n,count:0}])),
    };
    const late=today-due,key=bucketFor(late),cell=group.buckets.get(key)!;
    group.total+=dueMinor;group.openInvoices++;
    cell.amount+=dueMinor;cell.count++;
    if(late>0){group.overdue+=dueMinor;group.overdueInvoices++;}
    amounts.set(invoice.currency,group);
  }
  return {
    asOf,examinedInvoices:invoices.length,
    currencies:[...amounts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,group])=>({
      currency,totalMinor:group.total.toString(),overdueMinor:group.overdue.toString(),
      openInvoices:group.openInvoices,overdueInvoices:group.overdueInvoices,
      buckets:keys.map(key=>({key,label:labels[key],amountMinor:group.buckets.get(key)!.amount.toString(),count:group.buckets.get(key)!.count})),
    })),
  };
}
