// Shared CRM/ARM machine-learning engine. Every caller must supply ONE authorized tenant's rows.
// PII is excluded: no names, messages, phones, email, IPs or company identifiers in features.
export type MlCapability="sales_win"|"quote_acceptance";
export type MlFeatureMap=Record<string,number>;
export type MlTrainingExample={capability:MlCapability;features:MlFeatureMap;positive:boolean;recorded_at:string};
export type MlResult={mode:"heuristic"|"validated_ml";score:number;reasons:string[]};
export type MlModel={capability:MlCapability;weights:number[];samples:number;auc:number;brier:number};
export type MlOpportunity={
 id:string; pipeline_id:string; stage_id:string; status:string; created_at:string;
 owner_user_id:string|null; last_activity_at:string|null; next_action_at:string|null;
};
export type MlStage={id:string;pipeline_id:string;stage_type:string;position:number};
export type MlQuote={id:string;opportunity_id:string|null;status:string;created_at:string;valid_until:string|null};
export type MlTask={opportunity_id:string|null;status:string;due_at:string|null};
export type MlQuoteItem={quotation_id:string};

const capabilityKeys:Record<MlCapability,readonly string[]>={
 sales_win:["stage","age","quotes","tasks","overdue","assigned","freshness"],
 quote_acceptance:["age","items","linked","expiry"]
};
const cap=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
const daysElapsed=(past:string|undefined|null,now:number)=>past&&Number.isFinite(Date.parse(past))?Math.max(0,(now-Date.parse(past))/86400000):0;
const logistic=(z:number)=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
function vec(c:MlCapability,f:MlFeatureMap){return capabilityKeys[c].map(k=>cap(f[k]??0));}
function sortedExamples(c:MlCapability,examples:MlTrainingExample[]){
 return examples.filter(e=>e.capability===c&&typeof e.positive==="boolean"&&Number.isFinite(Date.parse(e.recorded_at))&&
  e.features&&capabilityKeys[c].every(k=>typeof e.features[k]==="number"&&Number.isFinite(e.features[k])&&e.features[k]>=0&&e.features[k]<=1))
 .sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)).slice(-500);
}
export function salesSignals(o:MlOpportunity,stages:MlStage[],quotes:MlQuote[],tasks:MlTask[],now=Date.now()):MlFeatureMap{
 const current=stages.find(s=>s.id===o.stage_id&&s.pipeline_id===o.pipeline_id);
 const open=stages.filter(s=>s.pipeline_id===o.pipeline_id&&s.stage_type==="open");
 const lower=Math.min(...open.map(s=>s.position),0);
 const upper=Math.max(...open.map(s=>s.position),1);
 const ts=tasks.filter(t=>t.opportunity_id===o.id);
 const isActive=(t:MlTask)=>!["completed","done","cancelled","canceled"].includes(t.status);
 return {
  stage:cap(((current?.position??lower)-lower)/Math.max(1,upper-lower)),
  age:cap(daysElapsed(o.created_at,now)/90),
  quotes:cap(quotes.filter(q=>q.opportunity_id===o.id).length/3),
  tasks:cap(ts.length/5),
  overdue:cap(ts.filter(t=>isActive(t)&&!!t.due_at&&Date.parse(t.due_at)<now).length/3),
  assigned:o.owner_user_id?1:0,
  freshness:1-cap(daysElapsed(o.last_activity_at??o.created_at,now)/30)
 };
}
export function quoteSignals(q:MlQuote,items:MlQuoteItem[],now=Date.now()):MlFeatureMap{
 const remaining=q.valid_until?Math.max(0,(Date.parse(q.valid_until)-now)/86400000):0;
 return {age:cap(daysElapsed(q.created_at,now)/60),
  items:cap(items.filter(i=>i.quotation_id===q.id).length/5),
  linked:q.opportunity_id?1:0,expiry:cap(remaining/30)};
}
function rocAuc(labels:boolean[],preds:number[]):number{
 let total=0,correct=0;
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
  if(labels[i]===labels[j])continue;
  total++;
  const positive=labels[i]?preds[i]:preds[j],negative=labels[i]?preds[j]:preds[i];
  correct+=positive===negative?0.5:positive>negative?1:0;
 }
 return total?correct/total:0.5;
}
// No prediction is ever returned from an unvalidated or imbalanced model.
// Train with chronological 80/20 holdout; never use a label in the feature vector.
export function trainTenantModel(capability:MlCapability,all:MlTrainingExample[]):MlModel|null{
 const rows=sortedExamples(capability,all);
 if(rows.length<60)return null;
 const cut=Math.floor(rows.length*.8),train=rows.slice(0,cut),test=rows.slice(cut);
 const won=(arr:MlTrainingExample[])=>arr.filter(e=>e.positive).length;
 if(won(train)<15||train.length-won(train)<15||won(test)<3||test.length-won(test)<3)return null;
 const xs=train.map(e=>vec(capability,e.features)),ys=train.map(e=>e.positive?1:0);
 const baseRate=won(train)/train.length,weights=[Math.log(baseRate/(1-baseRate)),...capabilityKeys[capability].map(()=>0)];
 for(let iter=0;iter<1000;iter++){
  const delta=Array(weights.length).fill(0);
  for(let i=0;i<xs.length;i++){
   const x=xs[i],err=logistic(weights[0]+x.reduce((s,v,j)=>s+v*weights[j+1],0))-ys[i];
   delta[0]+=err;
   for(let j=0;j<x.length;j++)delta[j+1]+=err*x[j];
  }
  weights[0]-=.2*delta[0]/xs.length;
  for(let j=1;j<weights.length;j++)weights[j]-=.2*(delta[j]/xs.length+.04*weights[j]);
 }
 const predicted=test.map(e=>logistic(weights[0]+vec(capability,e.features).reduce((s,v,j)=>s+v*weights[j+1],0)));
 const labels=test.map(e=>e.positive);
 const auc=rocAuc(labels,predicted);
 const brier=predicted.reduce((sum,p,i)=>sum+(p-(labels[i]?1:0))**2,0)/predicted.length;
 const baseline=labels.reduce((sum,v)=>sum+((v?1:0)-baseRate)**2,0)/labels.length;
 if(auc<.62||brier>=baseline*.98)return null;
 return {capability,weights,samples:rows.length,auc,brier};
}
export function scoreMl(capability:MlCapability,features:MlFeatureMap,model:MlModel|null):MlResult{
 const reasons:string[]=[];
 if(capability==="sales_win"){
  if(features.stage>=.6)reasons.push("Etapa comercial avanzada");
  if(features.quotes>0)reasons.push("Ya se preparó una cotización");
  if(features.overdue>0)reasons.push("Seguimiento vencido");
  if(features.freshness<.5)reasons.push("Contacto poco reciente");
  if(!features.assigned)reasons.push("Sin responsable asignado");
  if(reasons.length===0)reasons.push("Necesita calificación comercial");
 }else{
  if(features.linked)reasons.push("Vinculada a oportunidad");
  if(!features.items)reasons.push("Sin partidas registradas");
  if(features.age>.5)reasons.push("Cotización antigua");
  if(features.expiry===0)reasons.push("Sin vigencia futura confirmada");
  if(reasons.length===0)reasons.push("Revisar condiciones comerciales");
 }
 if(model?.capability===capability&&model.weights.length===capabilityKeys[capability].length+1){
  const probability=logistic(model.weights[0]+vec(capability,features).reduce((s,x,j)=>s+x*model.weights[j+1],0));
  return {mode:"validated_ml",score:Math.round(cap(probability)*100),reasons};
 }
 const score=cap(capability==="sales_win"?
  (.10+.34*(features.stage??0)+.20*(features.quotes??0)+.08*(features.tasks??0)+.10*(features.assigned??0)+.18*(features.freshness??0)-.12*(features.overdue??0)):
  (.15+.30*(features.items??0)+.15*(features.linked??0)+.25*(features.expiry??0)+.15*(1-(features.age??0))));
 return {mode:"heuristic",score:Math.round(score*100),reasons};
}
export function followupRisk(o:MlOpportunity,now=Date.now()):{level:"alta"|"media"|"baja";reason:string}{
 const overdue=!!o.next_action_at&&Date.parse(o.next_action_at)<now;
 if(overdue)return {level:"alta",reason:"Próxima acción vencida"};
 const inactivity=daysElapsed(o.last_activity_at??o.created_at,now);
 if(inactivity>=7)return {level:"media",reason:"Sin actividad reciente ("+Math.floor(inactivity)+" días)"};
 return {level:"baja",reason:"Seguimiento al día"};
}
