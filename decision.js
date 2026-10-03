/* Pure decision functions shared by the interface and numerical tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DemoDecision=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const finite=Number.isFinite;
 const names={gp:'Gaussian process',linear:'Linear regression',pchip:'PCHIP interpolation',mean:'Training-mean baseline',observed:'Observations only'};
 function resolveChannel(c,wavelength){
  if(!c.channel_sensitivity||!wavelength)return c;
  const s=c.channel_sensitivity.find(x=>String(x.wavelength_nm)===String(wavelength));if(!s)return c;
  return {...c,observations:c.observations.map(o=>({...o,y:o.au_channels[String(wavelength)],source:{...o.source,au:o.source.au_channels?.[String(wavelength)]||o.source.au}})),y:{...c.y,label:`Reported Au at ${wavelength} nm`},prediction:{...c.prediction,grid:s.grid||s.prediction?.grid||c.prediction.grid},validation:s.validation||c.validation,selected_channel:String(wavelength)};
 }
 function modelPoints(c,model='gp'){
  if(model==='observed')return c.observations.map(o=>({...o,mean:o.y,std:null,cu_mean:o.cu,cu_std:null,observed:true}));
  const key=model==='gp'?'mean':model==='mean'?'mean_baseline':model;
  const cuKey=model==='gp'?'cu_mean':model==='mean'?'cu_mean_baseline':`cu_${model}`;
  return (c.prediction?.grid||[]).map(p=>({...p,mean:p[key],std:model==='gp'?p.std:null,cu_mean:p[cuKey],cu_std:model==='gp'?p.cu_std:null,observed:false})).filter(p=>finite(p.mean));
 }
 function knownPoint(c,x){return c.observations.find(o=>Math.abs(o.x-x)<=1e-9*Math.max(1,Math.abs(x)));}
 function pareto(points,keys,directions){
  const good=points.filter(p=>keys.every(k=>finite(p[k])));if(!good.length)return [];
  const tol=keys.map(k=>1e-10*Math.max(1,...good.map(p=>Math.abs(p[k]))));
  return good.filter((b,bi)=>!good.some((a,ai)=>ai!==bi&&keys.every((k,j)=>directions[j]*a[k]<=directions[j]*b[k]+tol[j])&&keys.some((k,j)=>directions[j]*a[k]<directions[j]*b[k]-tol[j])));
 }
 function evaluate(c,o={}){
  const isProcess=c.group==='huo'||c.y.direction==='minimize',conditional=!!c.conditional_only,enabled=!conditional||!!o.allowConditional,model=enabled?(o.model||'gp'):'observed',z=model==='gp'?Math.max(0,Number(o.caution)||0):0;
  const points=modelPoints(c,model).filter(p=>p.x>=c.x.range[0]-1e-10&&p.x<=c.x.range[1]+1e-10);
  if(isProcess){
   const auMax=Number(o.auMax),cuMin=Number(o.cuMin);if(!finite(auMax)||!finite(cuMin)||auMax<0||cuMin<0)return{error:'Enter finite, non-negative concentration thresholds.',point:null,feasible:[],model,conditional,enabled};
   const feasible=points.filter(p=>finite(p.cu_mean)&&p.mean>=0&&p.cu_mean>=0&&p.mean+z*(p.std||0)<=auMax+1e-12&&p.cu_mean-z*(p.cu_std||0)>=cuMin-1e-12);
   const xObjective=!!c.x.meaning_confirmed||!!o.allowConditional;
   const front=pareto(points,xObjective?['mean','cu_mean','x']:['mean','cu_mean'],xObjective?[1,-1,1]:[1,-1]);
   const point=xObjective?[...feasible].sort((a,b)=>a.x-b.x)[0]||null:null;
   return{isProcess:true,model,z,enabled,conditional,xObjective,auMax,cuMin,points,feasible,front,point,selectedIsObserved:point?!!knownPoint(c,point.x):false,observedFeasible:c.observations.filter(x=>x.y<=auMax+1e-12&&x.cu>=cuMin-1e-12)};
  }
  const fraction=Number(o.targetPercent??95)/100;if(!finite(fraction)||fraction<=0||fraction>1)return{error:'The target percentage must be greater than 0 and at most 100%.',point:null,feasible:[],model};
  const best=Math.max(...c.observations.map(x=>x.y)),target=best*fraction;
  const feasible=points.filter(p=>p.mean-z*(p.std||0)>=target-1e-12).sort((a,b)=>a.x-b.x),observedFeasible=c.observations.filter(x=>x.y>=target-1e-12).sort((a,b)=>a.x-b.x);
  return{isProcess:false,model,z,enabled,conditional:false,points,feasible,point:feasible[0]||null,target,best,observedFeasible,selectedIsObserved:feasible.length?!!knownPoint(c,feasible[0].x):false,front:pareto(points,['x','mean'],[1,-1])};
 }
 function parseLevels(text,min,max){const a=String(text).split(/[,，;；\s]+/).filter(Boolean).map(Number);if(!a.length||a.some(v=>!finite(v)||v<min||v>max))throw new Error(`Factor levels must be within ${min}–${max}.`);if(a.length>6)throw new Error('Use no more than 6 levels per factor.');return[...new Set(a)].sort((a,b)=>a-b);}
 function shuffle(a,seed){let t=seed>>>0;const next=()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return((x^x>>>14)>>>0)/4294967296};for(let i=a.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a;}
 function makePlan(o){
  const ratios=parseLevels(o.ratios,0,20),doses=parseLevels(o.doses,5,20),blocks=Number(o.repeats);if(!Number.isInteger(blocks)||blocks<1||blocks>10)throw new Error('Use an integer from 1 to 10 for independent treatment blocks.');
  const meta=o.metadata||{},missing=['batch','recipe','volume_ml','ph','contact_min','temperature_c'].filter(k=>meta[k]===''||meta[k]===undefined||meta[k]===null);
  if(!missing.includes('volume_ml')&&(!finite(Number(meta.volume_ml))||Number(meta.volume_ml)<=0))throw new Error('Liquid volume must be positive.');
  if(!missing.includes('ph')&&(!finite(Number(meta.ph))||Number(meta.ph)<0||Number(meta.ph)>14))throw new Error('pH must be between 0 and 14.');
  if(!missing.includes('contact_min')&&(!finite(Number(meta.contact_min))||Number(meta.contact_min)<=0))throw new Error('Contact time must be positive.');
  if(!missing.includes('temperature_c')&&!finite(Number(meta.temperature_c)))throw new Error('Temperature must be finite.');
  const rows=[];for(let block=1;block<=blocks;block++){const a=[];for(const ratio of ratios)for(const dose of doses)a.push({ratio_cs_go:ratio,gocs_dose_mg:dose,kind:'factorial_condition'});a.push({ratio_cs_go:'',gocs_dose_mg:0,kind:'no_adsorbent_control'});shuffle(a,20261002+block).forEach((c,i)=>rows.push({experiment_id:`D${String(block).padStart(2,'0')}_${String(i+1).padStart(2,'0')}`,block,run_order:i+1,...c,...meta,initial_au:'',initial_cu:'',final_au:'',final_cu:'',concentration_unit:'',au_wavelength_nm:'',cu_wavelength_nm:'',initial_dilution_factor:'',final_dilution_factor:'',final_volume_ml:'',measurement_run_id:'',measurement_notes:'',status:'proposed_not_executed',joint_prediction_available:false}));}
  return{rows,missing,conditions:ratios.length*doses.length,blocks,controls:blocks,seed:20261002,status:missing.length?'draft_metadata_incomplete':'proposed_requires_protocol_review',joint_prediction_available:false};
 }
 return{names,resolveChannel,modelPoints,evaluate,pareto,knownPoint,makePlan};
});
