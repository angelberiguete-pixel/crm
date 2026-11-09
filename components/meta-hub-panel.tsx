"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtSign, ExternalLink, Inbox, Megaphone, MessageCircle, MessagesSquare, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  deriveMetaHubSnapshot,
  type MetaHubHealth,
  type MetaHubOpenReply,
  type MetaHubState,
} from "@/lib/meta-hub-status";
import styles from "./meta-hub-panel.module.css";

type Props = {
  tenantId: string;
  health: MetaHubHealth | null;
  refreshKey: number;
};
const label: Record<MetaHubState, string> = {
  verified_route: "Ruta verificada",
  pending: "Autorización pendiente",
  disconnected: "Sin conectar",
  unknown: "Sin verificación disponible",
  not_implemented: "Integración pendiente",
};
const explanation: Record<MetaHubState, string> = {
  verified_route: "Existe un mapeo de servidor habilitado. La entrega real aún requiere pruebas.",
  pending: "Hay un registro de canal, pero no acredita permisos ni entrega real.",
  disconnected: "No existe una ruta autorizada para este canal.",
  unknown: "No se pudo validar el estado mediante la API del CRM.",
  not_implemented: "La verificación de OAuth, webhooks y permisos de este producto todavía no está implementada.",
};

export default function MetaHubPanel({ tenantId, health, refreshKey }: Props) {
  // Undefined = consultando; null = error/denegación; object = respuesta autorizada.
  const [bridge, setBridge] = useState<MetaHubOpenReply | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setBridge(undefined);
    if (!tenantId) return;
    void (async () => {
      const { data, error } = await supabase.rpc("openreply_bridge_status", { p_tenant_id: tenantId });
      if (cancelled) return;
      if (error || !data || data.tenant_id !== tenantId) {
        setBridge(null);
        return;
      }
      setBridge(data as MetaHubOpenReply);
    })().catch(() => { if (!cancelled) setBridge(null); });
    return () => { cancelled = true; };
  }, [tenantId, refreshKey]);

  const overview = deriveMetaHubSnapshot(tenantId, health, bridge);
  const products = [
    { name: "WhatsApp Business", Icon: MessageCircle, status: overview.whatsapp, detail: "Cloud API · número y WABA por empresa" },
    { name: "Instagram", Icon: AtSign, status: overview.instagram, detail: "OpenReply · comentarios y mensajes" },
    { name: "Facebook y Messenger", Icon: MessagesSquare, status: overview.messenger, detail: "Pages API · mensajería y comentarios" },
    { name: "Meta Lead Ads", Icon: Megaphone, status: overview.leadAds, detail: "Formularios y campañas autorizadas" },
  ];
  return <section className={styles.wrap} aria-label="Meta Hub por empresa">
    <div className={styles.header}>
      <div>
        <span className={styles.eyebrow}>EMPRESIA / META HUB</span>
        <h2>Canales Meta de esta empresa</h2>
        <p>El mismo CRM para prospectos, conversaciones y seguimiento. Cada cuenta conserva su propio consentimiento y autorización.</p>
      </div>
      <a href="https://developers.facebook.com/apps/" className={styles.external} target="_blank" rel="noopener noreferrer">
        Meta for Developers <ExternalLink size={15}/>
      </a>
    </div>
    <div className={styles.grid}>
      {products.map(({ name, Icon, status, detail }) => <article className={styles.card} key={name}>
        <div className={styles.heading}><Icon size={22} aria-hidden="true"/><strong>{name}</strong></div>
        <span className={styles.status} data-state={status}>{label[status]}</span>
        <p>{detail}</p>
        <small>{explanation[status]}</small>
      </article>)}
    </div>
    <div className={styles.bottom}>
      <div className={styles.evidence}>
        <ShieldCheck size={20} aria-hidden="true"/>
        <div>
          <strong>Estado respaldado por Supabase</strong>
          <p>OpenReply: {overview.receivedEvents === null ? "sin verificación de eventos" : String(overview.receivedEvents) + " eventos recibidos"}; {overview.draftQuotes === null ? "cotizaciones no verificadas" : String(overview.draftQuotes) + " cotizaciones en borrador registradas"}. Un registro no confirma que Meta haya entregado un mensaje.</p>
        </div>
      </div>
      <div className={styles.actions}>
        <Link href="/crm/channels">Gestionar solicitudes</Link>
        <Link href="/crm/inbox"><Inbox size={16}/> Bandeja compartida</Link>
      </div>
    </div>
  </section>;
}
