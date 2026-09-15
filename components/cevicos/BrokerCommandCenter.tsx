"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, MessageCircle, Phone, Search } from "lucide-react";
import { brokerStatuses, priorityBrokers, type Broker, type BrokerStatus } from "@/data/cevicos";
import styles from "@/app/property-sales/property-sales.module.css";

const storageKey = "cevicos-broker-status-v1";

export default function BrokerCommandCenter() {
  const [brokers, setBrokers] = useState<Broker[]>(priorityBrokers);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const statusMap = JSON.parse(saved) as Record<string, BrokerStatus>;
      setBrokers((current) => current.map((broker) => ({ ...broker, status: statusMap[String(broker.id)] ?? broker.status })));
    } catch {
      // Ignore corrupt local state and keep the verified seed data.
    }
  }, []);

  function updateStatus(id: number, status: BrokerStatus) {
    setBrokers((current) => {
      const next = current.map((broker) => broker.id === id ? { ...broker, status } : broker);
      const statusMap = Object.fromEntries(next.map((broker) => [String(broker.id), broker.status]));
      window.localStorage.setItem(storageKey, JSON.stringify(statusMap));
      return next;
    });
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return brokers;
    return brokers.filter((broker) => [broker.name, broker.zone, broker.evidence, broker.phone].some((value) => value.toLowerCase().includes(normalized)));
  }, [brokers, query]);

  const contacted = brokers.filter((broker) => broker.status !== "No contactado").length;
  const active = brokers.filter((broker) => ["Respondió", "Interesado", "Comprador registrado", "Visita", "Oferta", "Negociación"].includes(broker.status)).length;
  const offers = brokers.filter((broker) => ["Oferta", "Negociación"].includes(broker.status)).length;

  return (
    <>
      <div className={styles.liveMetrics}>
        <div><span>Top brokers cargados</span><strong>{brokers.length}</strong></div>
        <div><span>Contactados</span><strong>{contacted}</strong></div>
        <div><span>Activos</span><strong>{active}</strong></div>
        <div><span>Con oferta</span><strong>{offers}</strong></div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div><h2>Primera ronda de brokers</h2><p>Los cambios de estado se guardan localmente en este navegador durante el MVP.</p></div>
          <label className={styles.search}><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar broker, zona o teléfono" /></label>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead><tr><th>#</th><th>Broker / agencia</th><th>Zona</th><th>Contacto</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>
              {filtered.map((broker) => (
                <tr key={broker.id}>
                  <td><span className={styles.rank}>{broker.id}</span></td>
                  <td><strong>{broker.name}</strong><small>{broker.evidence}</small></td>
                  <td>{broker.zone}</td>
                  <td><span className={styles.phone}>{broker.phone}</span>{broker.whatsapp && <span className={styles.waBadge}>WhatsApp</span>}</td>
                  <td>
                    <select value={broker.status} onChange={(event) => updateStatus(broker.id, event.target.value as BrokerStatus)} className={styles.statusSelect}>
                      {brokerStatuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {broker.whatsapp ? <a href={`https://wa.me/1${broker.phone}`} target="_blank" rel="noreferrer" title="Abrir WhatsApp"><MessageCircle size={17}/></a> : <a href={`tel:+1${broker.phone}`} title="Llamar"><Phone size={17}/></a>}
                      <a href={`tel:+1${broker.phone}`} title="Teléfono"><ExternalLink size={17}/></a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
