'use strict';
const DATA=JSON.parse(document.getElementById('presentation-data').textContent),D=window.ResearchDecision;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(x,d=3)=>Number.isFinite(x)?Number(x).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
const axis=a=>a.label+(a.unit&&a.unit!=='mass ratio'?' ('+a.unit+')':'');
const S={view:'models',caseId:DATA.cases[0].id,method:'gp',inspectIndex:0,band:true,tradeId:'dosage',tradeMethod:'gp',manualKey:null,memo:[],planForm:null,plan:null,trade:null,lastView:'models',scope:[],metricSpecs:[],rankWeights:{},rankEnabled:false,frontLimit:12,runConfig:null};
const plotConfig={responsive:true,displaylogo:false,displayModeBar:false};
const caseById=id=>DATA.cases.find(c=>c.id===id),activeCase=()=>caseById(S.caseId),profile=()=>DATA.profiles.find(p=>p.id===S.tradeId);
function table(headers,rows){return '<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function basePlot(x,y){return {margin:{l:80,r:28,t:60,b:74},font:{family:'Segoe UI,Arial,sans-serif',size:12,color:'#526176'},paper_bgcolor:'#fff',plot_bgcolor:'#fff',xaxis:{title:{text:x,standoff:14},gridcolor:'#e9eef5',zeroline:false,automargin:true},yaxis:{title:{text:y,standoff:12},gridcolor:'#e9eef5',zeroline:false,automargin:true},legend:{orientation:'h',x:0,y:1.2,font:{size:11}},hovermode:'closest'};}
function optionGroups(){
 const categories=[...new Set(DATA.cases.map(c=>c.category))];
 $('#model-case').innerHTML=categories.map(cat=>`<optgroup label="${esc(cat)}">${DATA.cases.filter(c=>c.category===cat).map(c=>`<option value="${esc(c.id)}">${esc(c.title)} · ${c.observations.length} settings</option>`).join('')}</optgroup>`).join('');
 $('#model-case').value=S.caseId;
 $('#trade-case').innerHTML=DATA.profiles.map(p=>`<option value="${esc(p.id)}">${esc(systemLabel(p))}</option>`).join('');$('#trade-case').value=S.tradeId;
}
function modelPlot(c,rows,picked){
 const traces=[];
 if(S.method!=='observed'){
  if(S.method==='gp'&&S.band){traces.push({x:rows.map(p=>p.x),y:rows.map(p=>p.y+1.96*p.sd),mode:'lines',line:{width:0},showlegend:false,hoverinfo:'skip'},
   {x:rows.map(p=>p.x),y:rows.map(p=>p.y-1.96*p.sd),mode:'lines',line:{width:0},fill:'tonexty',fillcolor:'rgba(52,111,174,.14)',name:'Mean ±1.96 × model SD',hoverinfo:'skip'});}
  traces.push({x:rows.map(p=>p.x),y:rows.map(p=>p.y),mode:'lines',line:{color:'#356fb5',width:2.5},name:D.names[S.method]});
 }
 const obs={x:c.observations.map(p=>p.x),y:c.observations.map(p=>p.y),mode:'markers',marker:{size:9,color:'#b5821e',line:{color:'#fff',width:1.5}},name:'Reported observations',hovertemplate:'Input %{x:.5g}<br>Reported response %{y:.5g}<extra>Observation</extra>'};
 if(c.observations.every(o=>Number.isFinite(o.error))){obs.error_y={type:'data',array:c.observations.map(o=>o.error),visible:true,color:'#b5821e',thickness:1};obs.name='Reported values + source error bars';}
 traces.push(obs);
 if(picked)traces.push({x:[picked.x],y:[picked.y],mode:'markers',marker:{symbol:'diamond',size:11,color:'#14263d'},name:'Inspected input'});
 const layout=basePlot(axis(c.x),axis(c.y));layout.uirevision=c.id+'-'+S.method;
 layout.xaxis.range=[...c.x.range];Plotly.react('model-plot',traces,layout,plotConfig);
}
function renderModel(){
 const c=activeCase(),rows=D.points(c,S.method);S.inspectIndex=Math.min(Math.max(0,S.inspectIndex),rows.length-1);
 const picked=rows[S.inspectIndex];
 $('#model-case').value=c.id;$('#model-method').value=S.method;
 $('#model-title').textContent=c.title;$('#case-scope').textContent=c.scope;
 $('#model-description').textContent=c.mode==='descriptive'?'Inspect the relationship between measured residual concentration and graph-reported capacity. This input is an outcome, so it is not offered as an operating control.':'Explore one local response series. Values follow the source study; transfer to different materials or operating conditions has not been validated.';
 $('#model-band').checked=S.band;$('#model-band').disabled=S.method!=='gp';
 $('#inspect-x').min='0';$('#inspect-x').max=String(Math.max(0,rows.length-1));$('#inspect-x').step='1';$('#inspect-x').value=String(S.inspectIndex);
 $('#inspection-value').textContent=picked?n(picked.x,4)+(c.x.unit==='mass ratio'?'':' '+c.x.unit):'—';
 $('#model-readout').innerHTML=picked?`<span class="eyebrow">${picked.observed?'Reported observation':'Model estimate at a grid input'}</span><strong>${n(picked.y,5)} <small>${esc(c.y.unit)}</small></strong><p>${picked.observed?'A reported setting in the source series.':picked.atMeasuredInput?'This input was previously measured, but the number above is still the model estimate.':'This intermediate input has not been independently tested.'}${Number.isFinite(picked.cu)?' Corresponding Cu: '+n(picked.cu,5)+' mg/L.':''}${picked.y<0?' This negative estimate has no physical capacity interpretation.':''}</p>`:'';
 const ranked=Object.entries(c.validation.metrics).filter(([,m])=>Number.isFinite(m.rmse)).sort((a,b)=>a[1].rmse-b[1].rmse);
 $('#model-facts').innerHTML=`<div class="metric"><span>Source settings</span><strong>${c.observations.length}</strong></div><div class="metric"><span>Independent repeats</span><strong>Not established</strong></div><div class="metric"><span>Lowest holdout RMSE</span><strong>${esc(D.names[ranked[0]?.[0]]||'—')}</strong></div>`;
 $('#validation-table').innerHTML=table(['Method','MAE','RMSE','R²','Held-out settings'],Object.entries(c.validation.metrics).map(([key,m])=>[esc(D.names[key]||key),n(m.mae,5),n(m.rmse,5),n(m.r2,4),String(m.n??c.validation.n_settings)]));
 $('#validation-note').textContent=c.validation.scheme+' Endpoint folds are extrapolations relative to their training fold. Small-sample or strongly processed source data can give misleadingly good retrospective fits; no external validation has been performed.';
 $('#case-notes').innerHTML=c.notes.map(x=>'<li>'+esc(x)+'</li>').join('');
 $('#model-to-trade').disabled=c.mode==='descriptive';$('#model-to-trade').textContent=c.mode==='descriptive'?'Descriptive relation — not an operating control':'Use this surrogate in optimisation';
 $('#model-contract').textContent='Input: '+axis(c.x)+'. Available outputs: '+axis(c.y)+(c.observations.some(o=>Number.isFinite(o.cu))?', reported Cu concentration (mg/L)':'')+'. Domain: '+n(c.x.range[0],4)+' to '+n(c.x.range[1],4)+'. '+D.names[S.method]+'.';
 modelPlot(c,rows,picked);
}
/* Objective configuration and post-search decisions; numeric models stay unchanged. */
function systemLabel(p){return {composition:'Composition surrogate',dosage:'Dosage → Au and Cu',sponge_ph:'Sponge-pH surrogate',membrane_ph:'Membrane-pH surrogates',potential:'Potential → capacity'}[p.id]||p.title;}
function catalog(){return D.metricCatalog(DATA.cases,profile());}
function isObjective(m){return m.role==='objective'||m.role==='both';}
function isConstraint(m){return m.role==='constraint'||m.role==='both';}
function optionalNumber(value){return String(value??'').trim()===''?null:Number(value);}
function numberInput(id){const value=$('#'+id).value;return value.trim()===''?NaN:Number(value);}
function presetOptions(){
 const options=[['example','Example trade-off — editable'],['response','Response only'],['blank','Blank configuration']];
 if(profile().kind==='dose')options.splice(1,0,['co-removal','Lower both Au and Cu'],['input-limits','Minimum dosage under limits']);
 options.push(['custom','Custom configuration']);
 $('#problem-preset').innerHTML=options.map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
}
function applyPreset(name){
 const p=profile(),cards=catalog(),best=Math.max(...S.scope.map(caseById).flatMap(c=>c.observations.map(o=>o.y)));
 S.metricSpecs=cards.map(m=>({key:m.key,role:'ignore',direction:m.defaultDirection||'min',target:null,lower:null,upper:null}));
 const get=key=>S.metricSpecs.find(m=>m.key===key);
 const use=(key,direction,role='objective')=>{const m=get(key);if(m){m.role=role;m.direction=direction}return m;};
 if(name==='response')use('response',p.kind==='dose'?'min':'max');
 if(name==='example'){
  if(p.kind==='dose'){use('response','min','both').upper=p.auMax??.9;use('cu','max','both').lower=p.cuMin??1;use('input','min');}
  else{use('response','max','both').lower=best*(p.target??80)/100;use(p.kind==='ph'?'distance':p.kind==='potential'?'magnitude':'input','min');}
 }
 if(name==='co-removal'){use('response','min');use('cu','min');use('input','min');}
 if(name==='input-limits'){use('input','min');use('response','min','constraint').upper=p.auMax??.9;use('cu','max','constraint').lower=p.cuMin??1;}
 S.rankWeights=Object.fromEntries(cards.map(m=>[m.key,50]));
 $('#problem-preset').value=name;
 renderMetricEditor();markProblemDirty();
}
function renderMetricEditor(){
 const cards=catalog();
 $('#metric-editor').innerHTML=cards.map(c=>{
  const m=S.metricSpecs.find(v=>v.key===c.key),objective=isObjective(m),bound=isConstraint(m),target=objective&&m.direction==='target';
  const option=(value,label,selected)=>`<option value="${value}"${value===selected?' selected':''}>${label}</option>`;
  return `<fieldset class="metric-editor-card"><legend>${esc(c.label)}${c.unit?' <span class="metric-unit">('+esc(c.unit)+')</span>':''}</legend><p class="field-help">${c.kind==='predicted'?'Predicted by the selected surrogate, or reported in observation-only mode.':'Calculated directly from the selected input; no additional outcome model is implied.'}</p><div class="metric-editor-grid"><div class="config-field"><label for="metric-${c.key}-role">Use this metric as</label><select id="metric-${c.key}-role" data-metric="${c.key}" data-field="role">${[['ignore','Not used'],['objective','Objective'],['constraint','Constraint only'],['both','Both']].map(([v,l])=>option(v,l,m.role)).join('')}</select></div><div class="config-field"${objective?'':' hidden'}><label for="metric-${c.key}-direction">Objective direction</label><select id="metric-${c.key}-direction" data-metric="${c.key}" data-field="direction">${[['min','Minimise'],['max','Maximise'],['target','Closest to target']].map(([v,l])=>option(v,l,m.direction)).join('')}</select></div><div class="config-field"${target?'':' hidden'}><label for="metric-${c.key}-target">Target value</label><input id="metric-${c.key}-target" type="number" step="any" data-metric="${c.key}" data-field="target" value="${m.target??''}" placeholder="Required for target"></div><div class="config-field"${bound?'':' hidden'}><label for="metric-${c.key}-lower">Lower bound</label><input id="metric-${c.key}-lower" type="number" step="any" data-metric="${c.key}" data-field="lower" value="${m.lower??''}" placeholder="No lower limit"></div><div class="config-field"${bound?'':' hidden'}><label for="metric-${c.key}-upper">Upper bound</label><input id="metric-${c.key}-upper" type="number" step="any" data-metric="${c.key}" data-field="upper" value="${m.upper??''}" placeholder="No upper limit"></div></div></fieldset>`;
 }).join('');
 $$('#metric-editor [data-field]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{
  const m=S.metricSpecs.find(v=>v.key===el.dataset.metric),field=el.dataset.field;
  m[field]=['role','direction'].includes(field)?el.value:optionalNumber(el.value);
  $('#problem-preset').value='custom';markProblemDirty();
  if(['role','direction'].includes(field))renderMetricEditor();
 }));
}
function renderScope(){
 const p=profile();
 $('#scope-cases').innerHTML=p.caseIds.length>1?p.caseIds.map(id=>`<label class="check-field"><input type="checkbox" data-scope-case="${id}"${S.scope.includes(id)?' checked':''}><span>${esc(caseById(id).title)}</span></label>`).join('')+'<p class="field-help">Only these two same-figure categories may be compared. Categories are never interpolated.</p>':'<p class="field-help">One source series; no cross-study model combination.</p>';
 $$('#scope-cases [data-scope-case]').forEach(el=>el.addEventListener('change',()=>{S.scope=$$('#scope-cases [data-scope-case]:checked').map(e=>e.dataset.scopeCase);markProblemDirty();renderTrade()}));
}
function tradeDefaults(scope){
 const p=profile(),chosen=scope?.length?scope:p.caseIds;S.scope=[...chosen];
 const cases=S.scope.map(caseById);$('#trade-case').value=p.id;$('#trade-method').value=S.tradeMethod;
 $('#trade-caution').value='0';$('#trade-x-min').value=Number(Math.min(...cases.map(c=>c.x.range[0])).toPrecision(12));$('#trade-x-max').value=Number(Math.max(...cases.map(c=>c.x.range[1])).toPrecision(12));
 $('#trade-ref').value=p.reference??7;$('#trade-algorithm').value='grid';$('#search-population').value='60';$('#search-generations').value='60';$('#search-seed').value='42';
 $('#ranking-enabled').checked=false;S.rankEnabled=false;S.manualKey=null;S.frontLimit=12;
 presetOptions();renderScope();applyPreset('example');
}
function markProblemDirty(){
 S.trade=null;S.manualKey=null;S.frontLimit=12;S.comparisons=null;
 $('#problem-status').textContent='Configuration ready. Run the search to generate a new Pareto set.';
 $('#trade-summary').innerHTML='';$('#trade-table').innerHTML='';$('#trade-comparison').innerHTML='';
 $('#candidate-summary').textContent='No current selection. Configure the problem and run the search.';
 $('#add-candidate').disabled=true;$('#add-candidate').textContent='Add to candidate memo';
 $('#ranking-controls').innerHTML='';$('#ranking-controls').hidden=true;$('#ranking-enabled').disabled=true;$('#ranking-status').textContent='Ranking is optional and applies only after a Pareto search.';
 for(const id of ['objective-x','objective-y']){$('#'+id).innerHTML='<option value="">Available after search</option>';$('#'+id).disabled=true;}
 Plotly.react('trade-plot',[],basePlot('',''),plotConfig);
}
function readProblem(method=S.tradeMethod,algorithm=$('#trade-algorithm').value){return {method,caseIds:[...S.scope],min:numberInput('trade-x-min'),max:numberInput('trade-x-max'),caution:numberInput('trade-caution'),reference:optionalNumber($('#trade-ref').value),metrics:S.metricSpecs.map(m=>({...m})),algorithm,population:numberInput('search-population'),generations:numberInput('search-generations'),seed:numberInput('search-seed')};}
function metricLabel(key){const m=catalog().find(v=>v.key===key);return m?m.label+(m.unit?' ('+m.unit+')':''):key;}
function goalText(m){return (m.direction==='min'?'Minimise ':m.direction==='max'?'Maximise ':'Closest to '+n(m.target)+' · ')+metricLabel(m.key);}
function axisLabel(key){const m=S.trade?.objectiveSpecs.find(m=>m.key===key);return metricLabel(key)+(m?m.direction==='min'?' · lower preferred':m.direction==='max'?' · higher preferred':' · target '+n(m.target):'');}
function renderAxisOptions(){
 const choices=catalog().filter(m=>S.trade.all.some(p=>Number.isFinite(p.values[m.key]))),active=S.trade.objectiveSpecs.map(m=>m.key);
 if(!choices.length){for(const id of ['objective-x','objective-y']){$('#'+id).innerHTML='<option value="">No evaluated values</option>';$('#'+id).disabled=true;}return;}
 const x=active[0]||choices[0].key,y=active.find(k=>k!==x)||choices.find(c=>c.key!==x)?.key||x;
 for(const id of ['objective-x','objective-y']){$('#'+id).innerHTML=choices.map(c=>`<option value="${c.key}">${esc(c.label)}</option>`).join('');$('#'+id).disabled=false;}
 $('#objective-x').value=x;$('#objective-y').value=y;
}
function rankingRows(){
 if(!S.trade)return [];
 if(!S.rankEnabled)return [...S.trade.front].sort((a,b)=>a.caseId.localeCompare(b.caseId)||a.x-b.x);
 return D.rankFront(S.trade,Object.fromEntries(S.trade.objectiveSpecs.map(m=>[m.key,S.rankWeights[m.key]??50])));
}
function selectedCandidate(){
 if(!S.trade)return null;
 const manual=S.trade.front.find(p=>p.key===S.manualKey);if(manual)return manual;
 if(!S.rankEnabled)return null;
 try{return rankingRows()[0]||null;}catch{return null;}
}
function renderRankingControls(){
 const r=S.trade;if(!r)return;
 $('#ranking-enabled').disabled=false;$('#ranking-controls').hidden=!S.rankEnabled;
 $('#ranking-enabled').checked=S.rankEnabled;
 $('#ranking-controls').innerHTML=r.objectiveSpecs.map(m=>`<div class="field"><label for="rank-${m.key}">${esc(goalText(m))} <span id="rank-${m.key}-value">${S.rankWeights[m.key]??50}</span></label><input id="rank-${m.key}" type="range" min="0" max="100" value="${S.rankWeights[m.key]??50}" data-rank-key="${m.key}"${S.rankEnabled?'':' disabled'}></div>`).join('');
 $$('#ranking-controls [data-rank-key]').forEach(el=>el.addEventListener('input',()=>{S.rankWeights[el.dataset.rankKey]=Number(el.value);$('#rank-'+el.dataset.rankKey+'-value').textContent=el.value;S.manualKey=null;renderTradeResult()}));
}
function objectivePlot(){
 const r=S.trade;if(!r)return;const keyX=$('#objective-x').value,keyY=$('#objective-y').value;
 if(!keyX||!keyY){Plotly.react('trade-plot',[],basePlot('',''),plotConfig);return;}
 const traces=[],colours=['#356fb5','#2e8b77'];
 const shown=r.all||[];
 for(const [i,id] of S.scope.entries()){
  const set=shown.filter(p=>p.caseId===id);
  traces.push({x:set.map(p=>p.values[keyX]),y:set.map(p=>p.values[keyY]),mode:'markers',name:caseById(id).title,marker:{size:4,color:colours[i%colours.length],opacity:.3},customdata:set.map(p=>[p.x,p.label]),hovertemplate:'Input %{customdata[0]:.5g}<br>%{customdata[1]}<br>x %{x:.5g}, y %{y:.5g}<extra>Candidate catalogue</extra>'});
 }
 if(r.front.length)traces.push({x:r.front.map(p=>p.values[keyX]),y:r.front.map(p=>p.values[keyY]),mode:'markers',name:r.algorithm==='nsga2'?'Pareto candidates found by NSGA-II':'Exact finite-grid Pareto set',marker:{size:7,color:'#b5821e'},customdata:r.front.map(p=>p.x),hovertemplate:'Input %{customdata:.5g}<br>x %{x:.5g}, y %{y:.5g}<extra>Pareto candidate</extra>'});
 const selected=selectedCandidate();if(selected)traces.push({x:[selected.values[keyX]],y:[selected.values[keyY]],mode:'markers',name:S.manualKey?'Inspected candidate':'Preference-ranked candidate',marker:{size:13,symbol:'diamond',color:'#14263d'},hovertemplate:'Input '+n(selected.x,5)+'<extra>Selected candidate</extra>'});
 const layout=basePlot(axisLabel(keyX),axisLabel(keyY));layout.uirevision=S.tradeId+'-'+S.tradeMethod+'-'+keyX+'-'+keyY;
 Plotly.react('trade-plot',traces,layout,plotConfig);
}
function renderTradeResult(){
 const r=S.trade;if(!r)return;
 let rows,rankError='';try{rows=rankingRows();}catch(error){rankError=error.message;rows=[...r.front];}
 $('#ranking-status').textContent=rankError|| (S.rankEnabled?'Priorities rank this existing Pareto set; changing them does not rerun or alter the search. Objective ranges from this run’s evaluated candidates are used for scaling. Lower relative scores are preferred.':'No preference ranking is applied. Inspect a row to choose a candidate; the first row is not presented as a recommendation.');
 const obj=r.objectiveSpecs.map(goalText).join(' · '),stats=r.stats||{};
 const evaluated=stats.evaluatedCount??stats.evaluations??r.all.length;
 const boundCount=r.metrics.filter(isConstraint).length;
 const screening=boundCount?(r.z?'Constraint bounds use '+r.z+' × model SD; objective values remain means.':'Constraints use reported values or predicted means.'):'No metric constraints are enabled, so model-SD screening has no effect on this search.';
 const searchDetail=r.algorithm==='nsga2'?' Seed '+stats.seed+'; population '+stats.population+'; '+stats.generations+' generations; '+n(100*stats.coverage,1)+'% of available candidates evaluated. '+(stats.isExhaustive?'This run covered the full finite catalogue.':'Unvisited candidates may change the Pareto set.'):'';
 $('#trade-summary').innerHTML=`<div class="metric"><span>Available catalogue</span><strong>${stats.searchSpaceSize??r.all.length}</strong></div><div class="metric"><span>Evaluated</span><strong>${evaluated}</strong></div><div class="metric"><span>Feasible evaluated</span><strong>${r.feasible.length}</strong></div><div class="metric"><span>Pareto candidates</span><strong>${r.front.length}</strong></div><p class="muted">${esc(obj)}. ${r.algorithm==='nsga2'?'NSGA-II is a seeded approximate search of the same discrete surrogate catalogue. It does not evaluate new experiments or provide a continuous global optimum.':'All available in-range surrogate grid points or reported settings are evaluated.'}${esc(searchDetail)} ${esc(screening)}</p>`;
 const metrics=S.metricSpecs.filter(m=>m.role!=='ignore');
 $('#trade-table').innerHTML=table(['Input','Source category',...metrics.map(m=>metricLabel(m.key)),...(S.rankEnabled?['Preference score']:[]),''],rows.slice(0,S.frontLimit).map(p=>[n(p.x,5)+' '+esc(caseById(p.caseId).x.unit==='mass ratio'?'':caseById(p.caseId).x.unit),esc(p.label),...metrics.map(m=>n(p.values[m.key],5)),...(S.rankEnabled?[n(p.score,4)]:[]),`<button type="button" class="small-button" data-pick="${esc(p.key)}">Inspect</button>`]))+(rows.length>S.frontLimit?'<button type="button" class="secondary" id="show-more-candidates">Show more candidates</button>':'')+'<p class="footnote">Fine digits reflect the stored model grid, not experimental preparation precision. The search evaluates model estimates, not new measurements.</p>';
 $$('#trade-table [data-pick]').forEach(button=>button.addEventListener('click',()=>{S.manualKey=button.dataset.pick;renderTradeResult()}));
 $('#show-more-candidates')?.addEventListener('click',()=>{S.frontLimit+=12;renderTradeResult()});
 const selected=selectedCandidate(),c=selected?caseById(selected.caseId):null;
 $('#candidate-summary').innerHTML=selected?`<span class="eyebrow">${S.manualKey?'Manually inspected':S.rankEnabled?'Preference-ranked':''} · ${selected.observed?'Reported setting':'Model estimate'}</span><strong>${n(selected.x,5)} ${esc(c.x.unit==='mass ratio'?'':c.x.unit)}</strong><p>${esc(c.title)}. ${metrics.map(m=>esc(metricLabel(m.key))+': '+n(selected.values[m.key],5)).join('; ')}. ${selected.atMeasuredInput?'This input is present in the source observations.':'This input still requires a new experiment.'}</p>`:r.front.length?'<strong>Pareto set ready</strong><p>Inspect a candidate in the table, or enable optional preference ranking. No single best solution is assumed.</p>':'<strong>No feasible candidate found</strong><p>Keep the constraints visible and review them against the source range. An approximate search may also miss feasible points; compare with exact grid search.</p>';
 $('#add-candidate').disabled=!selected;
 $('#trade-comparison').innerHTML=S.comparisons?table(['Method','Exact-grid feasible','Exact-grid Pareto','Constraint treatment'],S.comparisons):'';
 objectivePlot();
}
function renderTrade(){
 const p=profile(),selected=S.scope.map(caseById),base=selected[0]||caseById(p.caseIds[0]);
 $('#trade-title').textContent='Configure an optimisation problem';
 $('#trade-description').textContent='Choose which available metrics to optimise, constrain or ignore. Then search the selected surrogate and inspect the resulting alternatives.';
 $('#trade-warning').textContent=p.warning;
 const outputs=catalog().filter(m=>m.kind==='predicted').map(m=>metricLabel(m.key));
 $('#surrogate-contract').innerHTML=`<strong>${esc(systemLabel(p))} · ${esc(D.names[S.tradeMethod])}</strong><p>Input: ${esc(axis(base.x))}. Available outputs: ${outputs.map(esc).join(', ')}. ${selected.length} source ${selected.length===1?'category':'categories'} selected. Predictions are evaluated on stored model grid points; no online retraining or new continuous interpolation is performed.</p>`;
 $('#ph-preference').hidden=p.kind!=='ph';$('#trade-caution').disabled=S.tradeMethod!=='gp';
 $('#nsga-settings').hidden=$('#trade-algorithm').value!=='nsga2';
 if(S.trade)renderTradeResult();
}
async function runOptimisation(){
 S.trade=null;S.manualKey=null;$('#add-candidate').disabled=true;$('#run-optimization').disabled=true;$('#problem-status').textContent='Running the selected search…';
 await new Promise(resolve=>setTimeout(resolve,0));
 try{
  const config=readProblem();S.trade=D.runProblem(DATA.cases,profile(),config);S.runConfig=JSON.parse(JSON.stringify(S.trade.config));S.frontLimit=12;
  S.comparisons=Object.keys(D.names).map(method=>{try{const result=D.runProblem(DATA.cases,profile(),{...config,method,algorithm:'grid'});return [esc(D.names[method]),String(result.feasible.length),String(result.front.length),method==='gp'?'Uses selected model-SD bounds':'No model band applied'];}catch{return [esc(D.names[method]),'Unavailable','—','Check metric availability'];}});
   $('#problem-status').textContent='Search complete. Review the Pareto set, then choose a candidate.';
  renderAxisOptions();renderRankingControls();renderTradeResult();
 }catch(error){S.trade=null;$('#problem-status').textContent=error.message;$('#trade-summary').innerHTML='';$('#trade-table').innerHTML='';$('#trade-comparison').innerHTML='';$('#candidate-summary').textContent='No current candidate. Check the configuration.';$('#ranking-controls').innerHTML='';Plotly.react('trade-plot',[],basePlot('',''),plotConfig);}
 finally{$('#run-optimization').disabled=false;}
}
function addCandidate(){
 const point=selectedCandidate();if(!point||!S.runConfig)return;
 const c=caseById(point.caseId),key=point.key+'|'+JSON.stringify(S.runConfig);
 if(!S.memo.some(m=>m.key===key))S.memo.push({key,caseId:c.id,title:c.title,category:c.category,input:point.x,unit:c.x.unit,method:D.names[S.tradeMethod],evidence:point.observed?'Reported observation':'Model prediction',response:point.y,profileId:S.tradeId,problem:JSON.parse(JSON.stringify(S.runConfig)),goalLabels:S.trade.objectiveSpecs.map(goalText),rankingWeights:S.rankEnabled?{...S.rankWeights}:null,choice:S.manualKey?'manual':'preference_ranking'});
 $('#add-candidate').textContent='Added to candidate memo';
}
function transferModel(){
 const p=DATA.profiles.find(p=>p.caseIds.includes(S.caseId));if(!p)return;
 S.tradeId=p.id;S.tradeMethod=S.method;tradeDefaults([S.caseId]);showView('trade');
 $('#problem-status').textContent='Selected source category and '+D.names[S.method]+' carried from Response models. Configure the goals and run the search.';
}
function bindProblemControls(){
 $('#model-to-trade').addEventListener('click',transferModel);
 $('#trade-case').addEventListener('change',e=>{S.tradeId=e.target.value;tradeDefaults();renderTrade()});
 $('#trade-method').addEventListener('change',e=>{S.tradeMethod=e.target.value;markProblemDirty();renderTrade()});
 $('#problem-preset').addEventListener('change',e=>{if(e.target.value!=='custom')applyPreset(e.target.value)});
 for(const id of ['trade-caution','trade-x-min','trade-x-max','trade-ref','trade-algorithm','search-population','search-generations','search-seed'])$('#'+id).addEventListener('input',()=>{markProblemDirty();renderTrade()});
 $('#trade-reset').addEventListener('click',()=>{tradeDefaults();renderTrade()});$('#run-optimization').addEventListener('click',runOptimisation);$('#add-candidate').addEventListener('click',addCandidate);
 $('#ranking-enabled').addEventListener('change',e=>{S.rankEnabled=e.target.checked;S.manualKey=null;if(S.trade){renderRankingControls();renderTradeResult()}});
 for(const id of ['objective-x','objective-y'])$('#'+id).addEventListener('change',objectivePlot);
}

function readPlan(){return {ratios:$('#plan-ratios').value,doses:$('#plan-doses').value,phLevels:$('#plan-ph').value,blocks:$('#plan-blocks').value,metadata:{batch:$('#meta-batch').value,recipe:$('#meta-recipe').value,volume_ml:$('#meta-volume').value,ph:$('#meta-ph').value,contact_min:$('#meta-time').value,temperature_c:$('#meta-temp').value}};}
function renderMemo(){
 $('#plan-memo').innerHTML=S.memo.length?table(['Study','Input','Method','Evidence','Objectives at selection'],S.memo.map(m=>[esc(m.title),n(m.input,4)+' '+esc(m.unit==='mass ratio'?'':m.unit),esc(m.method),esc(m.evidence),esc((m.goalLabels||[]).join('; '))])):'<p class="muted">Add a candidate from Multi-objective to retain it for this page session.</p>';
 $('#include-candidates').disabled=!S.memo.some(m=>['kou_cs_go_ratio','huo_20260518_dose'].includes(m.caseId));
 $('#clear-memo').disabled=!S.memo.length;
}
function renderPlan(){
 renderMemo();if(S.planForm){const p=S.planForm;$('#plan-ratios').value=p.ratios;$('#plan-doses').value=p.doses;$('#plan-ph').value=p.phLevels;$('#plan-blocks').value=p.blocks;for(const [id,key] of [['batch','batch'],['recipe','recipe'],['volume','volume_ml'],['ph','ph'],['time','contact_min'],['temp','temperature_c']])$('#meta-'+id).value=p.metadata[key]??'';}
 generatePlan();
}
function generatePlan(){
 S.planForm=readPlan();
 try{S.plan=D.makePlan(S.planForm);const p=S.plan;$('#plan-error').textContent='';
  $('#plan-summary').innerHTML=`<div class="metric"><span>Factor combinations</span><strong>${p.conditions}</strong></div><div class="metric"><span>Matched controls</span><strong>${p.controls}</strong></div><div class="metric"><span>Total treatment units</span><strong>${p.rows.length}</strong></div><p class="note">${esc(p.status)}${p.missing.length?' · '+p.missing.length+' required fields missing.':'.'} These are proposed experiments, with no joint performance prediction.${p.variedPH?' A no-adsorbent control is included at every proposed solution-pH level in every block.':''}</p>`;
  $('#plan-table').innerHTML=table(['Run','Block','CS:GO','Dosage (mg)','Proposed solution pH','Type'],p.rows.map(r=>[r.id,String(r.block),r.ratio===null?'N/A':n(r.ratio),n(r.dose),r.ph===''?'To specify':n(r.ph),esc(r.kind)]));
 }catch(error){S.plan=null;$('#plan-error').textContent=error.message;$('#plan-summary').innerHTML='';$('#plan-table').innerHTML='';}
}
function includeCandidates(){
 try{const ratios=D.parseLevels($('#plan-ratios').value,0,20),doses=D.parseLevels($('#plan-doses').value,5,20);for(const m of S.memo){if(m.caseId==='kou_cs_go_ratio')ratios.push(m.input);if(m.caseId==='huo_20260518_dose')doses.push(m.input)}$('#plan-ratios').value=[...new Set(ratios)].sort((a,b)=>a-b).join(', ');$('#plan-doses').value=[...new Set(doses)].sort((a,b)=>a-b).join(', ');generatePlan();}catch(error){$('#plan-error').textContent=error.message;}
}
function renderEvidence(){
 const rows=DATA.cases.map(c=>{const m=c.validation.metrics;return [esc(c.title),String(c.observations.length),esc(c.y.unit),n(m.gp?.rmse,5),n(m.pchip?.rmse,5),c.mode==='descriptive'?'Descriptive only':'Local candidate comparison'];});
 $('#evidence-content').innerHTML=`<div class="eyebrow">Evidence and interpretation</div><h1>More data, with the original study boundaries retained</h1><p class="lead">${DATA.cases.length} local response series contain ${DATA.cases.reduce((s,c)=>s+c.observations.length,0)} source settings in total. This is an inventory count across different studies, not a pooled training set or a known count of independent experiments.</p><div class="source-grid">${DATA.evidence.map(e=>`<article class="source-item"><span class="tag">${esc(e.status)}</span><h2>${esc(e.title)}</h2><p>${esc(e.detail)}</p></article>`).join('')}</div><h2>Retrospective model checks</h2><div class="table-scroll">${table(['Response series','Source settings','Response unit','GP RMSE','PCHIP RMSE','Decision scope'],rows)}</div><p class="muted">RMSE has the response units shown in each row and cannot be compared across studies with different units. Entire input settings are held out. Source processing, missing repeats and endpoint extrapolation limit what these scores establish.</p><h2>How to interpret a candidate</h2><ol class="evidence-list"><li>Measurements, model estimates and proposed experiments remain distinct.</li><li>The Pareto set is computed only within the selected local study and measured input range, after the stated constraints.</li><li>Optional post-search weights rank trade-offs; they do not prove a unique scientific optimum. No candidate has been verified by a new experiment.</li><li>Distance from a pH reference and reported potential magnitude are preferences, not reagent consumption, energy or cost.</li><li>Concentration decreases are not metallic-gold yields. Recovery needs matched feed and product measurements and a material balance.</li></ol><p class="note">${esc(DATA.privacy_note)}</p>`;
}
function showView(next){
 if(!['models','trade','plan','evidence','guide'].includes(next))return;
 const previous=S.view;
 if(S.view==='plan')S.planForm=readPlan();
 if(next==='guide'&&S.view!=='guide')S.lastView=S.view;
 const wasGuide=S.view==='guide';S.view=next;
 for(const key of ['models','trade','plan','evidence','guide'])$('#'+key+'-view').hidden=key!==next;
 $$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===next);b.setAttribute('aria-current',b.dataset.view===next?'page':'false')});
 $('#guide-open').setAttribute('aria-expanded',String(next==='guide'));
 if(next==='models')renderModel();if(next==='trade')renderTrade();if(next==='plan')renderPlan();if(next==='evidence')renderEvidence();
 if(next==='guide')history.replaceState(null,'',location.pathname+location.search+'#instructions');else if(wasGuide)history.replaceState(null,'',location.pathname+location.search);
 if(next!==previous){const view=$('#'+next+'-view');view.scrollIntoView({block:'start'});const heading=view.querySelector('h1');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});}
}
optionGroups();tradeDefaults();
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('#guide-open').addEventListener('click',()=>showView('guide'));$('#guide-close').addEventListener('click',()=>showView(S.lastView));
$('#model-case').addEventListener('change',e=>{S.caseId=e.target.value;S.inspectIndex=0;renderModel()});
$('#model-method').addEventListener('change',e=>{S.method=e.target.value;S.inspectIndex=0;renderModel()});
$('#model-band').addEventListener('change',e=>{S.band=e.target.checked;renderModel()});$('#inspect-x').addEventListener('input',e=>{S.inspectIndex=+e.target.value;renderModel()});
bindProblemControls();
$('#generate-plan').addEventListener('click',generatePlan);$('#include-candidates').addEventListener('click',includeCandidates);$('#clear-memo').addEventListener('click',()=>{S.memo=[];renderMemo()});
showView(location.hash==='#instructions'?'guide':'models');
