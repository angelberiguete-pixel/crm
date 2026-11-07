/** Initial server-authoritative price catalog. Prices in major currency units. */
export const paymentCatalog = {
  "consultoria-ia": {name:"Consultoría de inteligencia artificial",USD:"150.00",EUR:"140.00"},
  "diagnostico-digital": {name:"Diagnóstico digital empresarial",USD:"75.00",EUR:"70.00"}
} as const;
export type ProductKey=keyof typeof paymentCatalog;
export function lookupOffer(key:string,currency:string) {
  if(!Object.prototype.hasOwnProperty.call(paymentCatalog,key) || !["USD","EUR"].includes(currency)) return null;
  const item=paymentCatalog[key as ProductKey];
  return {name:item.name,amount:item[currency as "USD"|"EUR"],currency:currency as "USD"|"EUR"};
}
