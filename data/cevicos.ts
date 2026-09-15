export type BrokerStatus =
  | "No contactado"
  | "Contactado"
  | "Respondió"
  | "Interesado"
  | "Comprador registrado"
  | "Visita"
  | "Oferta"
  | "Negociación";

export type Broker = {
  id: number;
  name: string;
  phone: string;
  whatsapp: boolean;
  zone: string;
  priority: "A" | "B" | "C";
  evidence: string;
  status: BrokerStatus;
};

export const property = {
  name: "Proyecto 812 — Cevicos",
  municipality: "Cevicos",
  province: "Sánchez Ramírez",
  tasks: 812,
  pricePerTask: 80000,
  referenceValue: 64960000,
  status: "Comercialización inicial",
};

export const brokerSummary = {
  total: 100,
  priorityA: 29,
  priorityB: 41,
  priorityC: 30,
  publicWhatsapp: 63,
  publicPhone: 71,
};

export const priorityBrokers: Broker[] = [
  { id: 1, name: "Hipercasas / Eddy Pérez Matos", phone: "8295215668", whatsapp: true, zone: "San Francisco de Macorís / Cotuí", priority: "A", evidence: "Antecedentes públicos de fincas grandes en Cotuí y actividad en Cevicos.", status: "No contactado" },
  { id: 2, name: "Jalia Bienes Raíces", phone: "8493545471", whatsapp: true, zone: "Cotuí", priority: "A", evidence: "Ha anunciado propiedades rurales de 600 y 1,800 tareas en Cotuí.", status: "No contactado" },
  { id: 3, name: "Isidro Pérez Matos", phone: "8099887994", whatsapp: false, zone: "Cotuí / Cibao", priority: "A", evidence: "Fincas y terrenos para desarrollar; ofertas públicas de 2,800–3,600 tareas.", status: "No contactado" },
  { id: 4, name: "F Pimentel Real Estate", phone: "8297610716", whatsapp: false, zone: "Cotuí", priority: "A", evidence: "Evidencia de finca ganadera cercana a 800 tareas en Cotuí.", status: "No contactado" },
  { id: 5, name: "Brugal Rivera", phone: "8495771141", whatsapp: false, zone: "Cevicos / Cotuí", priority: "A", evidence: "Ha publicado terrenos específicamente en Cevicos.", status: "No contactado" },
  { id: 6, name: "Agente Inmobiliario RJH", phone: "8096642050", whatsapp: true, zone: "Cotuí", priority: "A", evidence: "Contacto local con enfoque inmobiliario en Cotuí.", status: "No contactado" },
  { id: 7, name: "Fincas y Terrenos RD", phone: "8296774132", whatsapp: false, zone: "República Dominicana", priority: "A", evidence: "Cuenta especializada en fincas, lotes y solares.", status: "No contactado" },
  { id: 8, name: "Xionilca Inmobiliaria", phone: "8098558592", whatsapp: true, zone: "Santiago", priority: "A", evidence: "Trayectoria declarada de más de dos décadas y cartera de fincas/terrenos.", status: "No contactado" },
  { id: 9, name: "ApartHome", phone: "8099614955", whatsapp: true, zone: "San Francisco de Macorís", priority: "A", evidence: "Publica terrenos grandes y propiedades de inversión en el Cibao.", status: "No contactado" },
  { id: 10, name: "Vetas Soluciones Inmobiliaria", phone: "8099714900", whatsapp: false, zone: "Santiago / SFM", priority: "A", evidence: "Fincas rurales y proyectos, con cobertura regional.", status: "No contactado" },
  { id: 11, name: "ZuHouse Real Estate", phone: "8097243785", whatsapp: false, zone: "Santiago / Bonao", priority: "A", evidence: "Inventario de finca para agricultura/ganadería y presencia en el Cibao.", status: "No contactado" },
  { id: 12, name: "Plusval Zona Norte", phone: "8096123333", whatsapp: false, zone: "Santiago", priority: "A", evidence: "Oficina formal dentro de una red nacional amplia de asesores.", status: "No contactado" },
  { id: 13, name: "Jordi Albertus — Plusval", phone: "8299627186", whatsapp: false, zone: "Santiago", priority: "A", evidence: "Cartera pública con terrenos de gran metraje y 271 tareas.", status: "No contactado" },
  { id: 14, name: "Plusval HQ", phone: "8095401234", whatsapp: true, zone: "Santo Domingo / Nacional", priority: "A", evidence: "Red institucional con capacidad de distribución a múltiples asesores.", status: "No contactado" },
  { id: 15, name: "RE/MAX Metropolitana / RD", phone: "8297452076", whatsapp: false, zone: "Santo Domingo / Nacional", priority: "A", evidence: "Red nacional con inventario y categoría específica de terrenos.", status: "No contactado" },
  { id: 16, name: "CENTURY 21 Perdomo", phone: "8095712100", whatsapp: true, zone: "Puerto Plata / Nacional", priority: "A", evidence: "Categoría explícita de terrenos y fincas y amplia trayectoria.", status: "No contactado" },
  { id: 17, name: "GRUFINSA", phone: "8495033056", whatsapp: true, zone: "Santo Domingo", priority: "A", evidence: "Declara red de asociados e inversionistas privados.", status: "No contactado" },
  { id: 18, name: "ApartamentosRD — Santiago", phone: "8295834218", whatsapp: false, zone: "Santiago", priority: "A", evidence: "Oficina regional con proyectos y propiedades de inversión.", status: "No contactado" },
  { id: 19, name: "Inmobiliaria Cecorca", phone: "8099616692", whatsapp: true, zone: "Cibao", priority: "A", evidence: "Declara expresamente fincas, terrenos y desarrollo de proyectos.", status: "No contactado" },
];

export const brokerStatuses: BrokerStatus[] = [
  "No contactado",
  "Contactado",
  "Respondió",
  "Interesado",
  "Comprador registrado",
  "Visita",
  "Oferta",
  "Negociación",
];

export function money(value: number) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    maximumFractionDigits: 0,
  }).format(value);
}
