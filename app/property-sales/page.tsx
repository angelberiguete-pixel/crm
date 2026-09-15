import Link from "next/link";
import { ArrowLeft, Building2, CalendarDays, CircleDollarSign, FileCheck2, MapPinned, Target, UsersRound } from "lucide-react";
import BrokerCommandCenter from "@/components/cevicos/BrokerCommandCenter";
import { brokerSummary, money, property } from "@/data/cevicos";
import styles from "./property-sales.module.css";

export const metadata = {
  title: "Sales Command Center | Proyecto 812",
  description: "Centro de control comercial para la venta de 812 tareas en Cevicos.",
};

export default function PropertySalesPage() {
  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>812</div>
        <div className={styles.sideTitle}>Sales Command Center</div>
        <nav>
          <a href="#resumen" className={styles.active}>Resumen</a>
          <a href="#brokers">Brokers</a>
          <a href="#proximos">Próximas acciones</a>
          <Link href="/cevicos">Web pública</Link>
        </nav>
      </aside>

      <section className={styles.content}>
        <div className={styles.topbar}>
          <div><Link href="/cevicos" className={styles.back}><ArrowLeft size={16}/> Ver web pública</Link><h1>{property.name}</h1><p>{property.municipality}, {property.province}</p></div>
          <div className={styles.statusPill}>{property.status}</div>
        </div>

        <section id="resumen" className={styles.kpiGrid}>
          <article><UsersRound/><span>Base total</span><strong>{brokerSummary.total}</strong><small>brokers identificados</small></article>
          <article><Target/><span>Prioridad A</span><strong>{brokerSummary.priorityA}</strong><small>primer bloque comercial</small></article>
          <article><CircleDollarSign/><span>Valor referencia</span><strong>{money(property.referenceValue)}</strong><small>{money(property.pricePerTask)} / tarea</small></article>
          <article><MapPinned/><span>Extensión</span><strong>{property.tasks}</strong><small>tareas aprox.</small></article>
        </section>

        <section className={styles.grid2}>
          <article className={styles.panel}>
            <div className={styles.panelTitle}><Building2/> Propiedad</div>
            <dl className={styles.details}>
              <div><dt>Ubicación</dt><dd>Cevicos, Sánchez Ramírez</dd></div>
              <div><dt>Precio publicado</dt><dd>{money(property.pricePerTask)} / tarea</dd></div>
              <div><dt>Valor de referencia</dt><dd>{money(property.referenceValue)}</dd></div>
              <div><dt>Objetivo comercial</dt><dd>Venta total prioritaria</dd></div>
            </dl>
          </article>
          <article className={styles.panel}>
            <div className={styles.panelTitle}><FileCheck2/> Readiness</div>
            <div className={styles.progressItem}><span>Ficha comercial</span><b>100%</b><i><em style={{width:"100%"}}/></i></div>
            <div className={styles.progressItem}><span>CRM de brokers</span><b>100%</b><i><em style={{width:"100%"}}/></i></div>
            <div className={styles.progressItem}><span>Fotos / video</span><b>20%</b><i><em style={{width:"20%"}}/></i></div>
            <div className={styles.progressItem}><span>Expediente legal completo</span><b>25%</b><i><em style={{width:"25%"}}/></i></div>
          </article>
        </section>

        <section id="brokers"><BrokerCommandCenter/></section>

        <section id="proximos" className={styles.nextGrid}>
          <article className={styles.nextCard}><span>01</span><CalendarDays/><h3>Contactar primeros 6</h3><p>Iniciar por Hipercasas, Jalia, Isidro Pérez, F Pimentel, Brugal Rivera y RJH.</p></article>
          <article className={styles.nextCard}><span>02</span><FileCheck2/><h3>Cerrar Broker Pack</h3><p>Agregar fotos reales, acceso, ubicación y datos confirmados antes de distribuir la versión completa.</p></article>
          <article className={styles.nextCard}><span>03</span><UsersRound/><h3>Registrar compradores</h3><p>Cada comprador debe quedar asociado a su broker, fecha de entrada y etapa del proceso.</p></article>
          <article className={styles.nextCard}><span>04</span><CircleDollarSign/><h3>Medir ofertas</h3><p>Comparar monto, precio por tarea, condiciones, plazo y certeza de fondos.</p></article>
        </section>
      </section>
    </main>
  );
}
