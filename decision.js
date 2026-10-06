/* Independent local response models and bounded finite-candidate decisions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ResearchDecision=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=Number.isFinite;
 const names={gp:'Gaussian process',pchip:'PCHIP interpolation',linear:'Linear regression',mean:'Training-mean baseline',observed:'Reported observations only'};
 function points(c,method){
  if(!Object.hasOwn(names,method))throw new Error('Choose a supported prediction method.');
  if(method==='observed')return c.observations.map((o,i)=>({key:c.id+':o:'+i,caseId:c.id,label:c.title,x:o.x,y:o.y,cu:o.cu,sd:null,cuSd:null,observed:true,atMeasuredInput:true}));
  const ykey=method==='gp'?'mean':method==='mean'?'mean_baseline':method;
  const cukey=method==='gp'?'cu_mean':method==='mean'?'cu_mean_baseline':'cu_'+method;
  return c.prediction.grid.map((p,i)=>({key:c.id+':'+method+':'+i,caseId:c.id,label:c.title,x:p.x,y:p[ykey],cu:p[cukey],sd:method==='gp'?p.std:null,cuSd:method==='gp'?p.cu_std:null,observed:false,atMeasuredInput:c.observations.some(o=>Math.abs(o.x-p.x)<=1e-9*Math.max(1,Math.abs(p.x)))})).filter(p=>finite(p.x)&&finite(p.y));
 }
 function pareto(items){
  if(!items.length)return [];
  const dims=items[0].loss.length,tols=Array.from({length:dims},(_,j)=>1e-10*Math.max(1,...items.map(p=>Math.abs(p.loss[j]))));
  return items.filter((b,bi)=>!items.some((a,ai)=>ai!==bi&&a.loss.every((v,j)=>v<=b.loss[j]+tols[j])&&a.loss.some((v,j)=>v<b.loss[j]-tols[j])));
 }
 function optimise(cases,profile,o){
  if(!profile||!profile.caseIds?.length)throw new Error('Select an eligible local comparison.');
  const selected=profile.caseIds.map(id=>cases.find(c=>c.id===id));
  if(selected.some(c=>!c||c.mode==='descriptive'))throw new Error('Residual concentration is a measured outcome, not an operating decision variable.');
  const method=o.method||'gp',z=method==='gp'?Number(o.caution||0):0;
  if(![0,1,1.96].includes(z))throw new Error('Choose a listed screening rule.');
  const lower=Math.min(...selected.map(c=>c.x.range[0])),upper=Math.max(...selected.map(c=>c.x.range[1]));
  const min=Number(o.min),max=Number(o.max);
  if(!finite(min)||!finite(max)||min<lower-1e-10||max>upper+1e-10||min>max)throw new Error('Input limits must stay inside the measured range and be ordered.');
  const weights=(o.weights||[]).slice(0,profile.kind==='dose'?3:2).map(Number);
  if(weights.length!==(profile.kind==='dose'?3:2)||weights.some(w=>!finite(w)||w<0)||weights.every(w=>w===0))throw new Error('Set at least one non-negative priority above zero.');
  const best=Math.max(...selected.flatMap(c=>c.observations.map(v=>v.y)));
  const fraction=Number(o.targetPercent)/100,target=best*fraction;
  const auMax=Number(o.auMax),cuMin=Number(o.cuMin),reference=Number(o.reference);
  if(profile.kind==='dose'&&(!finite(auMax)||!finite(cuMin)||auMax<0||cuMin<0))throw new Error('Concentration limits must be finite and non-negative.');
  if(profile.kind!=='dose'&&(!finite(fraction)||fraction<0||fraction>1))throw new Error('The response target must be between 0 and 100%.');
  if(profile.kind==='ph'&&(!finite(reference)||reference<0||reference>14))throw new Error('The pH preference reference must lie between 0 and 14.');
  const raw=selected.flatMap(c=>points(c,method).filter(p=>p.x>=min-1e-10&&p.x<=max+1e-10&&p.x>=c.x.range[0]-1e-10&&p.x<=c.x.range[1]+1e-10));
  const valid=raw.filter(p=>p.y>=0&&(profile.kind!=='dose'||(finite(p.cu)&&p.cu>=0)));
  const all=valid.map(p=>{
   const demand=profile.kind==='ph'?Math.abs(p.x-reference):profile.kind==='potential'?Math.abs(p.x):p.x;
   const loss=profile.kind==='dose'?[p.y,-p.cu,p.x]:[-p.y,demand];
   const passes=profile.kind==='dose'?p.y+z*(p.sd||0)<=auMax+1e-12&&p.cu-z*(p.cuSd||0)>=cuMin-1e-12:p.y-z*(p.sd||0)>=target-1e-12;
   return {...p,demand,loss,passes};
  });
  const feasible=all.filter(p=>p.passes),front=pareto(feasible),totalWeight=weights.reduce((a,b)=>a+b,0);
  const limits=weights.map((_,j)=>({min:Math.min(...all.map(p=>p.loss[j])),max:Math.max(...all.map(p=>p.loss[j]))}));
  for(const p of front)p.score=p.loss.reduce((sum,v,j)=>sum+(limits[j].max-limits[j].min>1e-12?(v-limits[j].min)/(limits[j].max-limits[j].min):0)*weights[j]/totalWeight,0);
  front.sort((a,b)=>a.score-b.score||a.demand-b.demand||a.x-b.x||a.caseId.localeCompare(b.caseId));
  return {method,z,best,target,auMax,cuMin,reference,all,feasible,front,candidate:front[0]||null,excludedNegative:raw.length-valid.length,profile,normalisation:'Current in-range physically non-negative candidates; weights rank only feasible Pareto candidates.'};
 }
 function parseLevels(text,min,max,limit=6){
  const values=String(text).split(/[,;\s]+/).filter(Boolean).map(Number);
  if(!values.length||values.some(x=>!finite(x)||x<min||x>max))throw new Error('Factor levels must be between '+min+' and '+max+'.');
  const unique=[...new Set(values)].sort((a,b)=>a-b);
  if(unique.length>limit)throw new Error('Use at most '+limit+' distinct levels for this factor.');
  return unique;
 }
 function shuffle(a,seed){let t=seed>>>0;function next(){t+=0x6D2B79F5;let v=t;v=Math.imul(v^v>>>15,v|1);v^=v+Math.imul(v^v>>>7,v|61);return((v^v>>>14)>>>0)/4294967296}for(let i=a.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
 function makePlan(o){
  const ratios=parseLevels(o.ratios,0,20),doses=parseLevels(o.doses,5,20),blocks=Number(o.blocks),m=o.metadata||{};
  if(!Number.isInteger(blocks)||blocks<1||blocks>10)throw new Error('Use 1–10 independent treatment blocks.');
  const variedPH=String(o.phLevels||'').trim()!=='';
  const empty=value=>value===null||value===undefined||(typeof value==='string'&&value.trim()==='');
  const ph=variedPH?parseLevels(o.phLevels,0,14,5):[empty(m.ph)?'':Number(m.ph)];
  const required=['batch','recipe','volume_ml','contact_min','temperature_c'].concat(variedPH?[]:['ph']);
  const missing=required.filter(k=>empty(m[k]));
  if(!missing.includes('volume_ml')&&(!finite(Number(m.volume_ml))||Number(m.volume_ml)<=0))throw new Error('Liquid volume must be positive.');
  if(!missing.includes('contact_min')&&(!finite(Number(m.contact_min))||Number(m.contact_min)<=0))throw new Error('Contact time must be positive.');
  if(!missing.includes('temperature_c')&&!finite(Number(m.temperature_c)))throw new Error('Temperature must be finite.');
  if(!variedPH&&!missing.includes('ph')&&(!finite(ph[0])||ph[0]<0||ph[0]>14))throw new Error('Solution pH must be between 0 and 14.');
  const conditions=ratios.length*doses.length*ph.length,total=(conditions+ph.length)*blocks;
  if(total>300)throw new Error('This design exceeds 300 treatment units. Reduce factor levels or blocks.');
  const rows=[];
  for(let block=1;block<=blocks;block++){
   const group=[];
   for(const pH of ph){
    for(const ratio of ratios)for(const dose of doses)group.push({ratio,dose,ph:pH,kind:'Proposed treatment'});
    group.push({ratio:null,dose:0,ph:pH,kind:'No-adsorbent control'});
   }
   shuffle(group,20261006+block).forEach((r,i)=>rows.push({...r,id:'B'+block+'-'+String(i+1).padStart(2,'0'),block,order:i+1,metadata:{...m},status:'proposed_not_executed',initialAu:null,initialCu:null,finalAu:null,finalCu:null,jointPrediction:null}));
  }
  return {rows,conditions,blocks,controls:ph.length*blocks,missing,variedPH,phLevels:ph,status:missing.length?'Draft — fixed conditions incomplete':'Proposed — protocol review still required',jointPredictionAvailable:false};
 }
 return {names,points,pareto,optimise,parseLevels,makePlan};
});
