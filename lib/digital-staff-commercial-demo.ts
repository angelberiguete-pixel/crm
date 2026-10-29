/** Local illustrative demo. NO provider, database, WhatsApp, CRM or network interaction. */
export type DemoRole="recepcionista"|"vendedor"|"secretaria"|"cobros";
export type DemoScenario="consulta"|"cotizacion"|"cita"|"factura";
export type DemoReply={
  message:string;intent:string;nextStep:string;crmStage:string;
  needsApproval:true;role:DemoRole;
};
export const DEMO_ROLES:Record<DemoRole,string>={
 recepcionista:"Recepcionista digital",
 vendedor:"Asesor comercial",
 secretaria:"Secretaría",
 cobros:"Asistente de cobros",
};
export const DEMO_SCENARIOS:Record<DemoScenario,{label:string;customerText:string;role:DemoRole}>={
 consulta:{label:"Primera consulta",customerText:"Hola, quisiera saber qué servicios ofrecen.",role:"recepcionista"},
 cotizacion:{label:"Solicitar propuesta",customerText:"Quiero una cotización para mi negocio.",role:"vendedor"},
 cita:{label:"Agendar reunión",customerText:"¿Podemos reunirnos para conocer la solución?",role:"secretaria"},
 factura:{label:"Consulta administrativa",customerText:"Quiero revisar el estado de una factura.",role:"cobros"},
};
export function makeDemoReply(role:DemoRole,scenario:DemoScenario,businessName:string):DemoReply{
 const name=(businessName.trim().slice(0,80)||"el negocio");
 const d:Record<DemoRole,DemoReply>={
  recepcionista:{role:"recepcionista",message:"¡Hola! Gracias por escribir a "+name+". Podemos orientarte sobre nuestros servicios. ¿Qué necesitas resolver? Un representante confirmará los detalles.",intent:"Consulta inicial",nextStep:"Solicitar necesidad del cliente",crmStage:"Nuevo",needsApproval:true},
  vendedor:{role:"vendedor",message:"Gracias por tu interés en "+name+". Para preparar una propuesta necesitamos conocer el tipo de negocio, el alcance y tus objetivos. El responsable revisará cualquier cotización antes de enviarla.",intent:"Oportunidad comercial",nextStep:"Calificar y preparar propuesta",crmStage:"Calificado",needsApproval:true},
  secretaria:{role:"secretaria",message:"Con gusto puedo tomar tu solicitud de reunión con "+name+". ¿Qué día y horario prefieres? La confirmación depende de la disponibilidad verificada por una persona.",intent:"Solicitud de reunión",nextStep:"Verificar agenda y confirmar con responsable",crmStage:"Reunión solicitada",needsApproval:true},
  cobros:{role:"cobros",message:"Podemos ayudarte a revisar tu consulta administrativa con "+name+". Antes de facilitar detalles sobre facturas, un responsable verificará el documento y tu autorización.",intent:"Consulta administrativa",nextStep:"Revisar documento y escalar a responsable",crmStage:"Atención pendiente",needsApproval:true},
 };
 const actual=d[role];
 // Scenario is used only to select the sample lead, never to claim AI reasoning.
 void scenario;
 return actual;
}
export function buildIllustrativeProposal(business:string,plan:string,services:string):string{
 const client=business.trim().slice(0,100)||"[Empresa interesada]";
 const packageName=plan.trim().slice(0,80)||"Plan por definir";
 const scope=services.trim().slice(0,600)||"Personalización del CRM, formación y configuración inicial según contrato.";
 return [
  "PROPUESTA PRELIMINAR — NO CONTRATO NI FACTURA",
  "Prestador propuesto: Ángel Berigüete",
  "Marca operativa: Look Social Media",
  "Cliente: "+client,
  "Solución: Look Digital Staff — "+packageName,
  "Alcance preliminar: "+scope,
  "Incluye: configuración por empresa, control de usuarios, CRM, demostración supervisada de empleados digitales.",
  "No incluye por defecto: API de IA, licencias de terceros, WhatsApp Meta, envío automático, voz, pagos ni dominio propio.",
  "Precios, calendario, límites, protección de datos, soporte y entregables: sujetos a evaluación y acuerdo escrito.",
  "Requiere: reunión de levantamiento de necesidades y aprobación de alcance.",
  "Estado: borrador ilustrativo, no enviado.",
 ].join("\n");
}
