/** Pricing guardrails for the pinned text-only GPT-5.4 mini Responses API.
 * Pricing verified from OpenAI model page 2026-10-29:
 * $0.75 / 1M input tokens, $4.50 / 1M output tokens.
 * Do not reuse with other models or bill tenants from these estimates.
 */
export const EMPLOYEE_AI_MODEL="gpt-5.4-mini-2026-03-17";
export const EMPLOYEE_AI_MAX_OUTPUT_TOKENS=450;
export const EMPLOYEE_AI_INPUT_USD_PER_MILLION=0.75;
export const EMPLOYEE_AI_OUTPUT_USD_PER_MILLION=4.50;
export const EMPLOYEE_AI_FORMAT={
  type:"json_schema",
  name:"look_digital_staff_sales_draft",
  strict:true,
  schema:{
    type:"object",
    properties:{
      draft:{type:"string"},
      intent:{type:"string",enum:["informacion","compra","cita","soporte","cobros","otro"]},
      next_step:{type:"string",enum:["responder","solicitar_datos","proponer_cita","transferir_humano","preparar_propuesta"]},
      requires_human:{type:"boolean"},
    },
    required:["draft","intent","next_step","requires_human"],
    additionalProperties:false,
  }
} as const;
export type EmployeeAIOutcome={
 draft:string;intent:"informacion"|"compra"|"cita"|"soporte"|"cobros"|"otro";
 next_step:"responder"|"solicitar_datos"|"proponer_cita"|"transferir_humano"|"preparar_propuesta";
 requires_human:boolean;
};
const validIntents=new Set(EMPLOYEE_AI_FORMAT.schema.properties.intent.enum);
const validSteps=new Set(EMPLOYEE_AI_FORMAT.schema.properties.next_step.enum);
export function validateEmployeeAIOutcome(raw:unknown):EmployeeAIOutcome|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const v=raw as Record<string,unknown>;
 if(typeof v.draft!=="string"||!v.draft.trim()||v.draft.length>5000)return null;
 if(typeof v.intent!=="string"||!validIntents.has(v.intent as any))return null;
 if(typeof v.next_step!=="string"||!validSteps.has(v.next_step as any))return null;
 if(typeof v.requires_human!=="boolean")return null;
 return {draft:v.draft.trim(),intent:v.intent as EmployeeAIOutcome["intent"],next_step:v.next_step as EmployeeAIOutcome["next_step"],requires_human:v.requires_human};
}
/** Only exact decimal strings from server secrets are permitted.
 * Missing/invalid/zero limits always disable paid calls.
 */
export function budgetUsdToMicros(value:unknown):number|null{
 if(typeof value!=="string"||!/^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{1,2})?$/.test(value))return null;
 const parsed=Number(value);
 if(!Number.isFinite(parsed)||parsed<0.01||parsed>10000)return null;
 return Math.round(parsed*1_000_000);
}
/** Conservative upper-bound reservation, not a bill:
 * GPT tokenizer is byte-based; UTF-8 bytes + 512 overhead is a safe
 * accounting ceiling for these short prompts and simple schema.
 * Fail closed if the worst case is outside our configured bounds.
 */
export function estimatedMaxCostMicros(instructions:string,question:string):number|null{
 const totalBytes=new TextEncoder().encode(instructions).byteLength+
   new TextEncoder().encode(question).byteLength;
 if(totalBytes<3||totalBytes>30000)return null;
 const maxInputTokens=totalBytes+512;
 return Math.ceil(maxInputTokens*EMPLOYEE_AI_INPUT_USD_PER_MILLION+
   EMPLOYEE_AI_MAX_OUTPUT_TOKENS*EMPLOYEE_AI_OUTPUT_USD_PER_MILLION);
}
/** Cost is in integer USD micro-units (1 US$ = 1,000,000 micros). */
export function observedCostMicros(inputTokens:unknown,outputTokens:unknown):number|null{
 if(!Number.isInteger(inputTokens)||!Number.isInteger(outputTokens)||
   (inputTokens as number)<0||(outputTokens as number)<0||
   (inputTokens as number)>100000||(outputTokens as number)>EMPLOYEE_AI_MAX_OUTPUT_TOKENS)return null;
 return Math.ceil((inputTokens as number)*EMPLOYEE_AI_INPUT_USD_PER_MILLION+
   (outputTokens as number)*EMPLOYEE_AI_OUTPUT_USD_PER_MILLION);
}
