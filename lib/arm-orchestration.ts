/** Shared, tenant-scoped ARM orchestration planner. No external calls or side effects. */
export type ArmRole="reception"|"technical"|"sales"|"supervisor"|"communications"|"followup";
export type ArmIntent="new_inquiry"|"technical_question"|"quote_request"|"quote_approval"|"send_quote"|"follow_up";
export type ArmAction="identify_contact"|"lookup_catalog"|"draft_quote"|"request_approval"|"send_approved_quote"|"schedule_followup";
export type ArmStep={role:ArmRole;action:ArmAction;requiresHumanApproval:boolean};
export type ArmPlan={tenantId:string;eventId:string;intent:ArmIntent;steps:readonly ArmStep[]};

const validId=(value:string)=>typeof value==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{5,127}$/.test(value);
const sequences:Record<ArmIntent,readonly ArmStep[]>={
 new_inquiry:[{role:"reception",action:"identify_contact",requiresHumanApproval:false}],
 technical_question:[{role:"reception",action:"identify_contact",requiresHumanApproval:false},{role:"technical",action:"lookup_catalog",requiresHumanApproval:false}],
 quote_request:[{role:"reception",action:"identify_contact",requiresHumanApproval:false},{role:"technical",action:"lookup_catalog",requiresHumanApproval:false},{role:"sales",action:"draft_quote",requiresHumanApproval:false},{role:"supervisor",action:"request_approval",requiresHumanApproval:true}],
 quote_approval:[{role:"supervisor",action:"request_approval",requiresHumanApproval:true}],
 send_quote:[{role:"supervisor",action:"request_approval",requiresHumanApproval:true},{role:"communications",action:"send_approved_quote",requiresHumanApproval:true}],
 follow_up:[{role:"followup",action:"schedule_followup",requiresHumanApproval:false}]
};
/** Caller MUST derive tenantId from authenticated server context, never message payload. */
export function createArmPlan(tenantId:string,eventId:string,intent:ArmIntent):ArmPlan{
 if(!validId(tenantId)||!validId(eventId))throw new Error("Invalid ARM context");
 if(!Object.prototype.hasOwnProperty.call(sequences,intent))throw new Error("Unknown ARM intent");
 return {tenantId,eventId,intent,steps:sequences[intent].map(step=>({...step}))};
}
export type ArmExecutionContext={authorizedTenantId:string;approvedActions:readonly ArmAction[]};
/** No side effects: executor must enforce permissions again at DB/API boundary. */
export function canExecuteArmStep(plan:ArmPlan,step:ArmStep,context:ArmExecutionContext):boolean{
 return plan.tenantId===context.authorizedTenantId&&
   plan.steps.some(s=>s.action===step.action&&s.role===step.role)&&
   (!step.requiresHumanApproval||context.approvedActions.includes(step.action));
}
