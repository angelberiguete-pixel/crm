export const SECTOR_KEYS = ["general","energy","clinic","real_estate","retail"] as const;
export type CommercialSector = (typeof SECTOR_KEYS)[number];
export type CommercialStepKey = "visibility"|"interaction"|"conversations"|"contacts"|"opportunities"|"quotations"|"orders"|"ecf"|"deliveries"|"loyalty";

type SectorPreset = {
 name:string;
 summary:string;
 labels:Partial<Record<CommercialStepKey,string>>;
};
export const COMMERCIAL_SECTORS:Record<CommercialSector,SectorPreset>={
 general:{name:"Comercio y servicios",summary:"Seguimiento comercial de punta a punta",labels:{}},
 energy:{name:"Energía e instalaciones",summary:"Consultas, inversores, cotizaciones, instalación y seguimiento",labels:{contacts:"Cliente interesado",opportunities:"Oportunidad energética",quotations:"Cotización técnica",orders:"Pedido confirmado",deliveries:"Entrega / instalación"}},
 clinic:{name:"Clínicas y citas",summary:"Solicitudes, oportunidades de atención y seguimiento",labels:{contacts:"Paciente potencial",opportunities:"Oportunidad de cita",quotations:"Propuesta registrada",orders:"Pedido confirmado",deliveries:"Entrega / servicio"}},
 real_estate:{name:"Inmobiliaria",summary:"Consultas, compradores, propuestas y cierre comercial",labels:{contacts:"Interesado",opportunities:"Oportunidad inmobiliaria",quotations:"Propuesta registrada",orders:"Pedido confirmado",deliveries:"Entrega registrada"}},
 retail:{name:"Tiendas y comercios",summary:"Interacciones, clientes, pedidos y recompra",labels:{contacts:"Comprador potencial",opportunities:"Venta potencial",quotations:"Cotización",orders:"Pedido confirmado",deliveries:"Entrega registrada"}}
};
export function normalizeSector(value:unknown):CommercialSector|null{
 if(typeof value!=="string")return null;
 const v=value.trim().toLowerCase();
 if(v==="sublimation_dtf"||v==="sublimation"||v==="shop"||v==="store")return "retail";
 if(v==="clinics"||v==="healthcare"||v==="cita-24"||v==="dental")return "clinic";
 if(v==="real-estate"||v==="realestate"||v==="inmobiliaria")return "real_estate";
 if(v==="energia-instalaciones"||v==="energy"||v==="energía y servicios técnicos")return "energy";
 return SECTOR_KEYS.includes(v as CommercialSector)?v as CommercialSector:null;
}
export function resolveSector(setting:unknown,templateKey:unknown,templateVertical:unknown):CommercialSector{
 return normalizeSector(setting)??normalizeSector(templateKey)??normalizeSector(templateVertical)??"general";
}
