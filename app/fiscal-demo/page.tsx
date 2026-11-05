import { calculateFiscalPreview, ECF_TYPES, validateFiscalDraft, type FiscalDraft } from "@/src/lib/fiscal/ecf-domain";

const example: FiscalDraft = {
  tenantId: "DEMO-NO-REAL",
  type: "E31",
  issuer: { legalName: "Empresa demostrativa (ficticia)", rnc: "101000001" },
  buyer: { legalName: "Comprador demostrativo (ficticio)", rnc: "101000002" },
  currency: "DOP",
  lines: [
    { description: "Inversor (ejemplo)", quantity: 1, unitPrice: 25000, itbisRate: 0.18 },
    { description: "Instalación (ejemplo)", quantity: 1, unitPrice: 2000, itbisRate: 0.18 },
  ],
};
const money = (value: number) => new Intl.NumberFormat("es-DO", {style:"currency",currency:"DOP"}).format(value);
export const metadata = {title:"Laboratorio e-CF | CRM"};
export default function FiscalDemoPage() {
  const totals = calculateFiscalPreview(example.lines);
  const errors = validateFiscalDraft(example);
  return (
    <main style={{maxWidth:920,margin:"40px auto",padding:"0 20px",fontFamily:"system-ui"}}>
      <p style={{fontWeight:700,color:"#a12222"}}>DEMOSTRACIÓN — NO ES UN COMPROBANTE FISCAL</p>
      <h1>Laboratorio de facturación electrónica RD</h1>
      <p>Vista técnica de prueba. No genera e-NCF, no firma, no envía a proveedores ni a la DGII.</p>
      <section style={{padding:24,border:"1px solid #aaa",borderRadius:12}}>
        <h2>Borrador {example.type} · {ECF_TYPES[example.type]}</h2>
        <p>Emisor: {example.issuer.legalName}</p>
        <p>Comprador: {example.buyer?.legalName}</p>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><th style={{textAlign:"left"}}>Concepto</th><th>Cantidad</th><th style={{textAlign:"right"}}>Precio unitario</th></tr></thead>
          <tbody>{example.lines.map((line,index)=><tr key={index}><td>{line.description}</td><td style={{textAlign:"center"}}>{line.quantity}</td><td style={{textAlign:"right"}}>{money(line.unitPrice)}</td></tr>)}</tbody>
        </table>
        <hr/>
        <p>Subtotal: {money(totals.subtotal)}</p>
        <p>ITBIS preliminar: {money(totals.itbis)}</p>
        <h3>Total estimado: {money(totals.total)}</h3>
        <p>Validación preliminar: {errors.length ? errors.join("; ") : "Sin errores de formato básico"}</p>
      </section>
      <p style={{marginTop:20,fontSize:13}}>Datos ficticios. Cálculo ilustrativo; no sustituye validaciones, tasas ni redondeos fiscales oficiales.</p>
    </main>
  );
}
