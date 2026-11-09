// Auditable data-quality checks used by the CRM/ARM governance panel.
// Rules do not make sales decisions or train on labels.
export type QualityOpportunity={
 id:string;title:string;status:string;stage_id:string;pipeline_id:string;
 contact_id:string|null;company_id:string|null;owner_user_id:string|null;
 next_action_at:string|null;last_activity_at:string|null;created_at:string;
 expected_close_date:string|null;actual_close_date:string|null;loss_reason:string|null;
 acquisition_source:string|null
};
export type QualityStage={id:string;pipeline_id:string;stage_type:string};
export type QualityIssue={
 key:"unknown_stage"|"stage_status_mismatch"|"no_client"|"no_owner"|"no_next_action"|
 "missing_activity"|"overdue_action"|"old_expected_close"|"no_loss_reason"|"missing_close_date"|"no_source";
 label:string;weight:number;blocking:boolean;
};
export type QualityResult={score:number;issues:QualityIssue[];readyForProbability:boolean};

const issue=(key:QualityIssue["key"],label:string,weight:number,blocking=false):QualityIssue=>
 ({key,label,weight,blocking});
export function assessOpportunityQuality(
 o:QualityOpportunity,stages:QualityStage[],at=Date.now()
):QualityResult{
 const found:QualityIssue[]=[];
 const stage=stages.find(s=>s.id===o.stage_id&&s.pipeline_id===o.pipeline_id);
 if(!stage)found.push(issue("unknown_stage","La etapa no pertenece al proceso comercial",45,true));
 else if(stage.stage_type!==o.status)
  found.push(issue("stage_status_mismatch","El estado no coincide con la etapa",45,true));
 if(!o.contact_id&&!o.company_id)found.push(issue("no_client","Sin cliente o contacto vinculado",35,true));
 if(!o.owner_user_id)found.push(issue("no_owner","Sin vendedor responsable",15));
 if(!o.acquisition_source?.trim())found.push(issue("no_source","Origen comercial sin registrar",6));
 if(o.status==="open"){
  if(!o.next_action_at)found.push(issue("no_next_action","Sin próxima acción programada",18));
  else if(Number.isFinite(Date.parse(o.next_action_at))&&Date.parse(o.next_action_at)<at)
   found.push(issue("overdue_action","Seguimiento vencido",12));
  if(!o.last_activity_at)found.push(issue("missing_activity","Sin actividad comercial verificada",18));
  if(o.expected_close_date&&Date.parse(o.expected_close_date+"T23:59:59Z")<at)
   found.push(issue("old_expected_close","Fecha de cierre estimada vencida",10));
 }
 if(o.status==="lost"&&!o.loss_reason?.trim())
  found.push(issue("no_loss_reason","Motivo de pérdida sin registrar",18));
 if(o.status!=="open"&&!o.actual_close_date)
  found.push(issue("missing_close_date","Falta fecha real de cierre",12));
 const score=Math.max(0,100-found.reduce((sum,x)=>sum+x.weight,0));
 return {score,issues:found,readyForProbability:!found.some(x=>x.blocking)&&score>=70};
}
export type JourneyEvent={
 id:string;opportunity_id:string;event_type:string;from_stage_name:string|null;to_stage_name:string|null;
 from_status:string|null;to_status:string;occurred_at:string;is_historical_baseline:boolean;
};
export function describeJourney(e:JourneyEvent):string{
 if(e.is_historical_baseline||e.event_type==="legacy_baseline")
  return "Estado observado al activar el historial (no reconstruye cambios anteriores)";
 if(e.event_type==="created")return "Oportunidad creada en "+(e.to_stage_name??"su etapa inicial");
 if(e.event_type==="stage_changed")return "Etapa: "+(e.from_stage_name??"anterior")+" → "+(e.to_stage_name??"actual");
 if(e.event_type==="pipeline_changed")return "Traslado de proceso comercial";
 if(e.event_type==="outcome_recorded")
  return e.to_status==="won"?"Venta ganada":"Venta perdida";
 if(e.event_type==="reopened")return "Oportunidad reabierta";
 if(e.event_type==="status_changed")return "Estado actualizado: "+e.to_status;
 return "Cambio registrado";
}
