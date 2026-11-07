import type { Metadata } from "next";
import styles from "./page.module.css";

const paypalInvoiceUrl = "https://www.paypal.com/invoice/p/#HSYZR25YC89AXNJ5";

export const metadata: Metadata = {
  title: "Pago de factura 0002 · Dr. Emerson Familia · Ángel Berigüete",
  description: "Página de consulta y acceso al pago de la factura 0002 mediante PayPal.",
  robots: { index: false, follow: false, nocache: true },
};

export default function DrEmersonCheckout() {
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.wrapper}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.mark} aria-hidden="true">AB</span>
            <div>
              <strong>Ángel Berigüete</strong>
              <span>Servicios tecnológicos e inteligencia artificial</span>
            </div>
          </div>
          <span className={styles.headerTag}>Portal de pagos</span>
        </header>

        <div className={styles.layout}>
          <section className={styles.intro} aria-labelledby="page-title">
            <span className={styles.eyebrow}>Pago personalizado</span>
            <h1 id="page-title">Su solución tecnológica comienza aquí.</h1>
            <p>
              Dr. Emerson Familia, hemos preparado el acceso a su factura de
              implementación. Compruebe el importe y continúe a PayPal para
              elegir entre los métodos de pago que estén disponibles.
            </p>
            <div className={styles.trust}>
              <span className={styles.trustIcon} aria-hidden="true">✓</span>
              <div>
                <strong>Pago gestionado por PayPal</strong>
                <span>Esta página no solicita ni almacena datos bancarios.</span>
              </div>
            </div>
          </section>

          <section className={styles.paymentCard} aria-label="Resumen de la factura">
            <div className={styles.cardTop}>
              <span>Resumen de facturación</span>
              <span className={styles.invoiceRef}>Factura #0002</span>
            </div>
            <div className={styles.customer}>
              <span>Preparado para</span>
              <strong>Dr. Emerson Familia</strong>
            </div>
            <div className={styles.item}>
              <div>
                <strong>Implementación de Solución Tecnológica e Inteligencia Artificial</strong>
                <span>Servicio profesional · 1 unidad</span>
              </div>
              <strong className={styles.itemPrice}>US$197.00</strong>
            </div>
            <div className={styles.totalRow}>
              <span>Total de la factura</span>
              <div><strong>US$197.00</strong><small>USD · Dólares estadounidenses</small></div>
            </div>
            <a
              className={styles.payButton}
              href={paypalInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir factura 0002 en PayPal para pagar 197 dólares"
            >
              Continuar a PayPal <span aria-hidden="true">↗</span>
            </a>
            <p className={styles.secureNote}>
              Será redirigido a paypal.com. La opción de pagar con tarjeta sin
              crear una cuenta depende de la disponibilidad de PayPal para el comprador.
            </p>
            <div className={styles.attention}>
              <strong>¿Ya realizó el pago?</strong>
              <span>No vuelva a pagar. Consulte su recibo y la confirmación de PayPal.</span>
            </div>
          </section>
        </div>
        <footer className={styles.footer}>
          <span>© Ángel Berigüete · Servicio personalizado</span>
          <span>El estado definitivo de la factura se consulta en PayPal.</span>
        </footer>
      </div>
    </main>
  );
}
