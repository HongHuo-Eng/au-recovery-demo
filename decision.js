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
 /* Configurable problems deliberately keep preference ranking out of search. */
 const approvedProfiles={
  composition:{kind:'ratio',ids:['kou_cs_go_ratio']},
  dosage:{kind:'dose',ids:['huo_20260518_dose']},
  sponge_ph:{kind:'ph',ids:['ph_sponge']},
  membrane_ph:{kind:'ph',ids:['ph_membrane_go','ph_membrane_gocs10']},
  potential:{kind:'potential',ids:['kou_potential_o16']}
 };
 const roles=new Set(['ignore','objective','constraint','both']);
 const directions=new Set(['min','max','target']);
 const missing=value=>value===null||value===undefined||(typeof value==='string'&&value.trim()==='');
 function numberField(value,label,optional=false){
  if(missing(value)){if(optional)return null;throw new Error(label+' is required.');}
  if((typeof value!=='number'&&typeof value!=='string')||!finite(Number(value)))throw new Error(label+' must be a finite number.');
  return Number(value);
 }
 function selectedCases(cases,profile,requested){
  if(!Array.isArray(cases)||!profile||!Array.isArray(profile.caseIds)||!profile.caseIds.length)throw new Error('Select an approved local comparison.');
  if(new Set(cases.map(c=>c.id)).size!==cases.length)throw new Error('Case identifiers must be unique.');
  if(new Set(profile.caseIds).size!==profile.caseIds.length)throw new Error('Profile case identifiers must be unique.');
  const approved=profile.caseIds.map(id=>cases.find(c=>c.id===id));
  if(approved.some(c=>!c))throw new Error('The profile contains an unavailable case.');
  if(approved.some(c=>c.mode==='descriptive'))throw new Error('Residual concentration is a measured outcome, not an operating decision variable.');
  const definition=approvedProfiles[profile.id];
  if(!definition||definition.kind!==profile.kind||profile.caseIds.some(id=>!definition.ids.includes(id)))throw new Error('This cross-study grouping is not an approved local comparison.');
  const ids=requested===undefined?profile.caseIds:requested;
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('Select a non-empty set of unique case identifiers.');
  if(ids.some(id=>!profile.caseIds.includes(id)))throw new Error('Selected cases must be an approved subset of this profile.');
  const selected=approved.filter(c=>ids.includes(c.id));
  if(selected.length>1&&(profile.id!=='membrane_ph'||selected.some(c=>!approvedProfiles.membrane_ph.ids.includes(c.id))))throw new Error('Only the paired membrane categories may be compared together.');
  if(selected.some(c=>c.y.unit!==selected[0].y.unit||c.x.unit!==selected[0].x.unit))throw new Error('The selected categories do not share compatible reported units.');
  return selected;
 }
 function metricCatalog(cases,profile){
  const selected=selectedCases(cases,profile),c=selected[0];
  const metrics=[{key:'response',label:c.y.label,unit:c.y.unit||'',kind:'predicted',defaultDirection:profile.kind==='dose'?'min':'max'}];
  if(profile.kind==='dose')metrics.push({key:'cu',label:'Reported Cu concentration',unit:c.cu?.unit||'mg/L',kind:'predicted',defaultDirection:'max'});
  metrics.push({key:'input',label:c.x.label,unit:c.x.unit||'',kind:'deterministic',defaultDirection:'min'});
  if(profile.kind==='ph')metrics.push({key:'distance',label:'Distance from selected pH reference',unit:'pH units',kind:'deterministic',defaultDirection:'min'});
  if(profile.kind==='potential')metrics.push({key:'magnitude',label:'Reported potential magnitude |E|',unit:c.x.unit||'V',kind:'deterministic',defaultDirection:'min'});
  return metrics;
 }
 function configureProblem(cases,profile,config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Provide a problem configuration.');
  const selected=selectedCases(cases,profile,config.caseIds),catalog=metricCatalog(cases,profile);
  const method=config.method===undefined?'gp':config.method;
  if(!Object.hasOwn(names,method))throw new Error('Choose a supported prediction method.');
  const z=method==='gp'?(config.caution===undefined?0:numberField(config.caution,'GP screening multiplier')):0;
  if(![0,1,1.96].includes(z))throw new Error('Choose a listed GP screening rule: 0, 1 or 1.96.');
  const min=numberField(config.min,'Minimum input'),max=numberField(config.max,'Maximum input');
  const lower=Math.min(...selected.map(c=>c.x.range[0])),upper=Math.max(...selected.map(c=>c.x.range[1]));
  if(min>max||min<lower-1e-10||max>upper+1e-10)throw new Error('Input limits must be ordered and remain inside the selected measured range.');
  if(!Array.isArray(config.metrics))throw new Error('Provide a metric configuration array.');
  const supplied=new Map();
  for(const item of config.metrics){
   if(!item||typeof item!=='object'||!catalog.some(m=>m.key===item.key))throw new Error('Unsupported metric key.');
   if(supplied.has(item.key))throw new Error('Metric keys must not be duplicated.');
   if(!roles.has(item.role))throw new Error('Choose ignore, objective, constraint or both for each metric.');
   const descriptor=catalog.find(m=>m.key===item.key),direction=item.direction===undefined?descriptor.defaultDirection:item.direction;
   if(!directions.has(direction))throw new Error('Objective direction must be min, max or target.');
   const target=numberField(item.target,item.key+' target',true),lo=numberField(item.lower,item.key+' lower limit',true),hi=numberField(item.upper,item.key+' upper limit',true);
   const objective=item.role==='objective'||item.role==='both',constraint=item.role==='constraint'||item.role==='both';
   if(objective&&direction==='target'&&target===null)throw new Error('A target objective needs a finite target value.');
   if(constraint&&lo===null&&hi===null)throw new Error('A constrained metric needs a lower or upper limit.');
   if(constraint&&lo!==null&&hi!==null&&lo>hi)throw new Error('Constraint lower limits cannot exceed upper limits.');
   supplied.set(item.key,{...descriptor,role:item.role,direction,target,lower:lo,upper:hi});
  }
  const metrics=catalog.map(m=>supplied.get(m.key)||{...m,role:'ignore',direction:m.defaultDirection,target:null,lower:null,upper:null});
  const objectiveSpecs=metrics.filter(m=>m.role==='objective'||m.role==='both'),constraints=metrics.filter(m=>m.role==='constraint'||m.role==='both');
  if(!objectiveSpecs.length)throw new Error('Select at least one objective. Feasibility-only search is not enabled.');
  const reference=numberField(config.reference,'pH preference reference',true);
  if(profile.kind==='ph'&&metrics.some(m=>m.key==='distance'&&m.role!=='ignore')&&reference===null)throw new Error('An active pH-distance metric needs a reference value.');
  if(profile.kind==='ph'&&reference!==null&&(reference<0||reference>14))throw new Error('The pH preference reference must lie between 0 and 14.');
  const algorithm=config.algorithm===undefined?'grid':config.algorithm;
  if(!['grid','nsga2'].includes(algorithm))throw new Error('Choose exact grid or finite-catalogue NSGA-II.');
  let population=0,generations=0,seed=null;
  if(algorithm==='nsga2'){
   population=config.population===undefined?60:numberField(config.population,'NSGA-II population');
   generations=config.generations===undefined?60:numberField(config.generations,'NSGA-II generations');
   seed=config.seed===undefined?42:numberField(config.seed,'NSGA-II seed');
   if(!Number.isInteger(population)||population<2||population>200)throw new Error('NSGA-II population must be an integer from 2 to 200.');
   if(!Number.isInteger(generations)||generations<0||generations>200||population*population*generations>4000000)throw new Error('Choose 0–200 generations within the browser search budget.');
   if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new Error('NSGA-II seed must be an unsigned 32-bit integer.');
  }
  return {selected,catalog,metrics,objectiveSpecs,constraints,method,z,min,max,reference,algorithm,population,generations,seed,
   config:{method,caseIds:selected.map(c=>c.id),min,max,caution:z,reference,metrics:metrics.map(m=>({key:m.key,role:m.role,direction:m.direction,target:m.target,lower:m.lower,upper:m.upper})),algorithm,population:algorithm==='nsga2'?population:null,generations:algorithm==='nsga2'?generations:null,seed}};
 }
 function metricValues(point,profile,reference){
  const values={response:point.y,input:point.x};
  if(profile.kind==='dose')values.cu=point.cu;
  if(profile.kind==='ph')values.distance=reference===null?null:Math.abs(point.x-reference);
  if(profile.kind==='potential')values.magnitude=Math.abs(point.x);
  return values;
 }
 function evaluatePoint(point,index,profile,p){
  const values=metricValues(point,profile,p.reference),sdByMetric={};
  for(const metric of p.catalog){
   const supplied=metric.key==='response'?point.sd:metric.key==='cu'?point.cuSd:null;
   sdByMetric[metric.key]=metric.kind==='deterministic'?0:(p.method==='gp'&&finite(supplied)&&supplied>=0?supplied:null);
  }
  const loss=p.objectiveSpecs.map(m=>{
   const value=values[m.key];if(!finite(value))throw new Error('An active objective has no finite value.');
   return m.direction==='max'?-value:m.direction==='target'?Math.abs(value-m.target):value;
  });
  if(loss.some(v=>!finite(v)))throw new Error('Objective arithmetic exceeded the finite numeric range.');
  let passes=true,constraintViolation=0;
  const constraintChecks=p.constraints.map(m=>{
   const value=values[m.key];if(!finite(value))throw new Error('An active constraint has no finite value.');
   let sigma=0;
   if(m.kind==='predicted'&&p.z>0){sigma=sdByMetric[m.key];if(!finite(sigma)||sigma<0)throw new Error('GP caution requires a valid standard deviation for each constrained prediction.');}
   const lowerValue=value-p.z*sigma,upperValue=value+p.z*sigma;
   if(!finite(lowerValue)||!finite(upperValue))throw new Error('Constraint arithmetic exceeded the finite numeric range.');
   const lowTolerance=1e-10*Math.max(1,Math.abs(m.lower||0)),highTolerance=1e-10*Math.max(1,Math.abs(m.upper||0));
   const lowPass=m.lower===null||lowerValue>=m.lower-lowTolerance,highPass=m.upper===null||upperValue<=m.upper+highTolerance;
   const lowViolation=m.lower!==null&&!lowPass?(m.lower-lowerValue)/Math.max(1,Math.abs(m.lower)):0;
   const highViolation=m.upper!==null&&!highPass?(upperValue-m.upper)/Math.max(1,Math.abs(m.upper)):0;
   constraintViolation+=lowViolation+highViolation;passes=passes&&lowPass&&highPass;
   return {key:m.key,lower:m.lower,upper:m.upper,lowerValue,upperValue,sigmaUsed:sigma,passes:lowPass&&highPass};
  });
  return {...point,catalogueIndex:index,values,sdByMetric,loss,passes,constraintViolation,constraintChecks};
 }
 function randomSource(seed){let t=seed>>>0;return function(){t+=0x6D2B79F5;let v=t;v=Math.imul(v^v>>>15,v|1);v^=v+Math.imul(v^v>>>7,v|61);return((v^v>>>14)>>>0)/4294967296;};}
 function constrainedFronts(individuals){
  if(!individuals.length)return [];
  const dims=individuals[0].point.loss.length,tols=Array.from({length:dims},(_,j)=>1e-10*Math.max(1,...individuals.map(v=>Math.abs(v.point.loss[j]))));
  const better=(a,b)=>{
   if(a.passes!==b.passes)return a.passes;
   if(!a.passes)return a.constraintViolation<b.constraintViolation-1e-12;
   return a.loss.every((v,j)=>v<=b.loss[j]+tols[j])&&a.loss.some((v,j)=>v<b.loss[j]-tols[j]);
  };
  const dominated=individuals.map(()=>[]),counts=individuals.map(()=>0),fronts=[[]];
  for(let i=0;i<individuals.length;i++)for(let j=i+1;j<individuals.length;j++){
   if(better(individuals[i].point,individuals[j].point)){dominated[i].push(j);counts[j]++;}
   else if(better(individuals[j].point,individuals[i].point)){dominated[j].push(i);counts[i]++;}
  }
  for(let i=0;i<individuals.length;i++)if(counts[i]===0){individuals[i].rank=0;fronts[0].push(i);}
  for(let rank=0;rank<fronts.length;rank++){
   const next=[];for(const i of fronts[rank])for(const j of dominated[i])if(--counts[j]===0){individuals[j].rank=rank+1;next.push(j);}
   if(next.length)fronts.push(next);
  }
  for(const front of fronts){
   for(const i of front)individuals[i].crowding=0;
   if(front.length<=2){for(const i of front)individuals[i].crowding=Infinity;continue;}
   for(let j=0;j<dims;j++){
    const order=front.slice().sort((a,b)=>individuals[a].point.loss[j]-individuals[b].point.loss[j]||individuals[a].gene-individuals[b].gene);
    const lo=individuals[order[0]].point.loss[j],hi=individuals[order[order.length-1]].point.loss[j];
    if(hi-lo<=1e-12)continue;
    individuals[order[0]].crowding=Infinity;individuals[order[order.length-1]].crowding=Infinity;
    for(let k=1;k<order.length-1;k++)individuals[order[k]].crowding+=(individuals[order[k+1]].point.loss[j]-individuals[order[k-1]].point.loss[j])/(hi-lo);
   }
  }
  return fronts;
 }
 function nsgaSearch(size,p,evaluate){
  const random=randomSource(p.seed),count=Math.min(size,p.population);
  if(!count)return {population:0,generations:0,finalPopulationIndices:[],crossovers:0,mutations:0,tournaments:0};
  const indexes=Array.from({length:size},(_,i)=>i);
  for(let i=indexes.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[indexes[i],indexes[j]]=[indexes[j],indexes[i]];}
  const individual=gene=>({gene,point:evaluate(gene),rank:0,crowding:0});
  let population=indexes.slice(0,count).map(individual),crossovers=0,mutations=0,tournaments=0;
  constrainedFronts(population);
  function tournament(){
   tournaments++;const a=population[Math.floor(random()*population.length)],b=population[Math.floor(random()*population.length)];
   if(a.rank!==b.rank)return a.rank<b.rank?a:b;
   if(a.crowding!==b.crowding)return a.crowding>b.crowding?a:b;
   return random()<.5?a:b;
  }
  function mutate(gene){
   if(random()<.3){mutations++;if(random()<.5)return Math.floor(random()*size);const radius=Math.max(1,Math.floor(size*.1));return Math.max(0,Math.min(size-1,gene+Math.floor(random()*(2*radius+1))-radius));}
   return gene;
  }
  for(let generation=0;generation<p.generations;generation++){
   const children=[];
   while(children.length<count){
    const a=tournament().gene,b=tournament().gene;let first=a,second=b;
    if(random()<.9){crossovers++;const blend=random();first=Math.round(blend*a+(1-blend)*b);second=Math.round((1-blend)*a+blend*b);}
    children.push(individual(mutate(first)));if(children.length<count)children.push(individual(mutate(second)));
   }
   const combined=population.concat(children),fronts=constrainedFronts(combined),next=[];
   for(const front of fronts){
    if(next.length+front.length<=count)next.push(...front.map(i=>combined[i]));
    else {const remaining=front.map(i=>combined[i]).sort((a,b)=>b.crowding-a.crowding||a.gene-b.gene);next.push(...remaining.slice(0,count-next.length));break;}
   }
   population=next;constrainedFronts(population);
  }
  return {population:count,generations:p.generations,finalPopulationIndices:population.map(x=>x.gene),crossovers,mutations,tournaments};
 }
 function runProblem(cases,profile,config){
  const p=configureProblem(cases,profile,config);
  const raw=p.selected.flatMap(c=>points(c,p.method).filter(point=>finite(point.x)&&finite(point.y)&&point.x>=p.min-1e-10&&point.x<=p.max+1e-10&&point.x>=c.x.range[0]-1e-10&&point.x<=c.x.range[1]+1e-10));
  const catalogue=raw.filter(point=>point.y>=0&&(profile.kind!=='dose'||finite(point.cu)&&point.cu>=0));
  const evaluated=new Map();let requests=0;
  function evaluate(index){requests++;if(!evaluated.has(index))evaluated.set(index,evaluatePoint(catalogue[index],index,profile,p));return evaluated.get(index);}
  let search={population:0,generations:0,finalPopulationIndices:[],crossovers:0,mutations:0,tournaments:0};
  if(p.algorithm==='grid')for(let i=0;i<catalogue.length;i++)evaluate(i);
  else search=nsgaSearch(catalogue.length,p,evaluate);
  const all=[...evaluated.entries()].sort((a,b)=>a[0]-b[0]).map(([,point])=>point),feasible=all.filter(point=>point.passes),front=pareto(feasible);
  const exhaustive=all.length===catalogue.length;
  return {all,feasible,front,objectiveSpecs:p.objectiveSpecs.map(m=>({...m})),metrics:p.metrics.map(m=>({...m})),metricCatalog:p.catalog.map(m=>({...m})),method:p.method,z:p.z,algorithm:p.algorithm,config:p.config,excludedNegative:raw.length-catalogue.length,
   profile:{...profile,caseIds:p.selected.map(c=>c.id),weights:profile.weights?.slice()},
   semantics:{candidateSpace:p.method==='observed'?'Exact reported observations in the requested domain.':'Exact saved predictions at existing catalogue inputs; no model is refitted or evaluated at a new continuous input.',materialHandling:'An integer chromosome selects one existing category/input record; no response or material-category interpolation is performed.',frontSource:p.algorithm==='grid'?'Exact non-dominated feasible front over the saved candidate catalogue.':'Non-dominated feasible archive of candidates actually visited by NSGA-II; not replaced by an exhaustive-grid answer.',frontOrder:'Catalogue order only; no preference ranking or candidate is selected.',constraints:'Lower limits use value minus z times GP SD; upper limits use value plus z times GP SD. Deterministic metrics and baselines do not borrow GP uncertainty. This model-based screen is not a calibrated joint probability of feasibility.',ranking:'Optional and separate; weights do not enter feasibility, Pareto filtering, or NSGA-II search.',constraintHandling:'NSGA-II uses feasible-first dominance; infeasible candidates compare summed bound deficits normalized by max(1, absolute bound).',searchOperators:p.algorithm==='nsga2'?'Non-dominated sorting, crowding distance, binary tournaments, integer-index arithmetic crossover and mixed local/global mutation, with elitist parent-offspring selection.':'Every eligible saved catalogue point is evaluated once.',normalisation:'rankFront normalizes active objective losses over result.all (the evaluated catalogue for this run).'},
   stats:{searchSpaceSize:catalogue.length,rawInRangeCount:raw.length,excludedNegative:raw.length-catalogue.length,evaluatedCount:all.length,evaluations:all.length,evaluationRequests:requests,visited:all.length,visitedCount:all.length,coverage:catalogue.length?all.length/catalogue.length:0,feasibleCount:feasible.length,frontCount:front.length,isExhaustive:exhaustive,approximate:!exhaustive,requestedPopulation:p.algorithm==='nsga2'?p.population:null,requestedGenerations:p.algorithm==='nsga2'?p.generations:null,population:search.population,generations:search.generations,seed:p.seed,crossovers:search.crossovers,mutations:search.mutations,tournaments:search.tournaments,finalPopulationIndices:search.finalPopulationIndices,emptyReason:catalogue.length?null:'No saved, physically non-negative candidates lie in the requested interval.'}};
 }
 function rankFront(result,weightsByKey){
  if(!result||!Array.isArray(result.objectiveSpecs)||!result.objectiveSpecs.length||!Array.isArray(result.front)||!Array.isArray(result.all))throw new Error('Rank a completed configurable-problem result.');
  if(!weightsByKey||typeof weightsByKey!=='object'||Array.isArray(weightsByKey))throw new Error('Provide a weight for every active objective.');
  const keys=result.objectiveSpecs.map(m=>m.key);
  if(Object.keys(weightsByKey).some(key=>!keys.includes(key)))throw new Error('Ranking weights may refer only to active objective keys.');
  const weights=keys.map(key=>numberField(weightsByKey[key],key+' ranking weight'));
  if(weights.some(w=>w<0)||weights.every(w=>w===0))throw new Error('Set at least one non-negative ranking weight above zero.');
  if(!result.front.length)return [];
  if(!result.all.length||result.all.some(p=>p.loss.length!==keys.length||p.loss.some(v=>!finite(v))))throw new Error('Ranking requires finite, aligned objective losses.');
  const maxWeight=Math.max(...weights),scaled=weights.map(w=>w/maxWeight),total=scaled.reduce((a,b)=>a+b,0);
  const limits=keys.map((_,j)=>({min:Math.min(...result.all.map(p=>p.loss[j])),max:Math.max(...result.all.map(p=>p.loss[j]))}));
  const ranked=result.front.map((point,index)=>{
   const normalizedLoss=point.loss.map((v,j)=>limits[j].max-limits[j].min>1e-12?(v-limits[j].min)/(limits[j].max-limits[j].min):0);
   const score=normalizedLoss.reduce((sum,v,j)=>sum+v*scaled[j]/total,0);
   return {...point,values:{...point.values},sdByMetric:{...point.sdByMetric},loss:point.loss.slice(),constraintChecks:point.constraintChecks?.map(c=>({...c})),normalizedLoss,score,_originalOrder:index};
  });
  ranked.sort((a,b)=>a.score-b.score||a._originalOrder-b._originalOrder);
  return ranked.map(({_originalOrder,...point})=>point);
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
 return {names,points,pareto,optimise,parseLevels,makePlan,metricCatalog,runProblem,rankFront};
});
