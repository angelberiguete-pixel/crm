import Link from "next/link";
import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title:"Primera cuota de implementación · Family Power · Ángel Berigüete",
  description:"Primera cuota PayPal de US$197 sobre contrato de implementación presentado en USD",
  robots:{index:false,follow:false,nocache:true}
};
const paypalInvoice="https://www.paypal.com/invoice/p/#HSYZR25YC89AXNJ5";

export default function FamilyPowerBillingStep(){
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.mark}>AB</div>
        <div><strong>Ángel Berigüete</strong><small>Facturación de servicios tecnológicos</small></div>
      </header>
      <section className={styles.intro}>
        <span className={styles.eyebrow}>Family Power · Paso posterior al registro</span>
        <h1>Tu cuenta está en proceso de aprobación.</h1>
        <p>Si ya completaste el registro, puedes abonar la primera cuota ahora o pagar más tarde. El contrato de implementación se presenta en dólares de forma referencial y se paga en cuotas. La aprobación de acceso es independiente del pago.</p>
      </section>
      <section className={styles.card} aria-label="Resumen del pago inicial">
        <div className={styles.row}><span>Valor de la implementación (equivalente estimado)</span><strong>US$493.75</strong></div>
        <div className={styles.total}><span>Primera cuota de implementación</span><strong>US$197.00 USD</strong></div>
        <p className={styles.note}>La primera cuota no liquida el contrato completo. La equivalencia en USD usa la tasa BCRD de venta de RD$60.7601 por US$1 (6/11/2026); el importe pactado inicialmente es RD$30,000.</p>
        <a href={paypalInvoice} target="_blank" rel="noopener noreferrer" className={styles.pay}>Pagar US$197 con PayPal ↗</a>
        <p className={styles.note}>La transacción se realiza en paypal.com. PayPal notifica el pago al sistema cuando la conexión API está activa; hasta esa confirmación, el aviso permanecerá pendiente.</p>
        <Link className={styles.skip} href="/family-power/login">Pagar más tarde y continuar al portal</Link>
        <div className={styles.details}>
          <strong>¿Prefieres transferencia o efectivo?</strong>
          <p>Puedes utilizar el método previamente acordado y luego informar el pago desde <b>Pagos y suscripción</b> al entrar al portal. La administración comprobará el importe recibido antes de marcarlo pagado.</p>
        </div>
      </section>
      <p className={styles.terms}>El contrato de implementación se muestra en USD (aproximado) y se cubre por cuotas. Una vez saldado, podrá autorizarse por separado la mensualidad de <strong>US$80</strong>. El cobro recurrente automático todavía no está activado.</p>
    </div>
  </main>;
}
