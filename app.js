'use strict';
const DATA=JSON.parse(document.getElementById('presentation-data').textContent),D=window.ResearchDecision;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(x,d=3)=>Number.isFinite(x)?Number(x).toLocaleString('en-US',{maximumFractionDigits:d}):'—';
const axis=a=>a.label+(a.unit&&a.unit!=='mass ratio'?' ('+a.unit+')':'');
const S={view:'models',caseId:DATA.cases[0].id,method:'gp',inspectIndex:0,band:true,tradeId:'dosage',tradeMethod:'gp',manualKey:null,memo:[],planForm:null,plan:null,trade:null,lastView:'models'};
const plotConfig={responsive:true,displaylogo:false,displayModeBar:false};
const caseById=id=>DATA.cases.find(c=>c.id===id),activeCase=()=>caseById(S.caseId),profile=()=>DATA.profiles.find(p=>p.id===S.tradeId);
function table(headers,rows){return '<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function basePlot(x,y){return {margin:{l:80,r:28,t:60,b:74},font:{family:'Segoe UI,Arial,sans-serif',size:12,color:'#526176'},paper_bgcolor:'#fff',plot_bgcolor:'#fff',xaxis:{title:{text:x,standoff:14},gridcolor:'#e9eef5',zeroline:false,automargin:true},yaxis:{title:{text:y,standoff:12},gridcolor:'#e9eef5',zeroline:false,automargin:true},legend:{orientation:'h',x:0,y:1.2,font:{size:11}},hovermode:'closest'};}
function optionGroups(){
 const categories=[...new Set(DATA.cases.map(c=>c.category))];
 $('#model-case').innerHTML=categories.map(cat=>`<optgroup label="${esc(cat)}">${DATA.cases.filter(c=>c.category===cat).map(c=>`<option value="${esc(c.id)}">${esc(c.title)} · ${c.observations.length} settings</option>`).join('')}</optgroup>`).join('');
 $('#model-case').value=S.caseId;
 $('#trade-case').innerHTML=DATA.profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');$('#trade-case').value=S.tradeId;
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
 $('#model-to-trade').disabled=c.mode==='descriptive';$('#model-to-trade').textContent=c.mode==='descriptive'?'Descriptive relation — not an operating control':'Compare objectives for this study';
 modelPlot(c,rows,picked);
}
function tradeDefaults(){
 const p=profile(),cases=p.caseIds.map(caseById);
 $('#trade-case').value=p.id;$('#trade-method').value=S.tradeMethod;
 $('#trade-caution').value='0';$('#trade-x-min').value=Number(Math.min(...cases.map(c=>c.x.range[0])).toPrecision(12));$('#trade-x-max').value=Number(Math.max(...cases.map(c=>c.x.range[1])).toPrecision(12));
 $('#trade-target').value=p.target??95;$('#trade-au-max').value=p.auMax??.9;$('#trade-cu-min').value=p.cuMin??1;$('#trade-ref').value=p.reference??7;
 ['first','second','third'].forEach((key,i)=>{$('#weight-'+key).value=p.weights[i]??0});S.manualKey=null;
}
function numberInput(id){return $('#'+id).value.trim()===''?NaN:Number($('#'+id).value);}
function tradeOptions(method=S.tradeMethod){return {method,caution:numberInput('trade-caution'),min:numberInput('trade-x-min'),max:numberInput('trade-x-max'),targetPercent:numberInput('trade-target'),auMax:numberInput('trade-au-max'),cuMin:numberInput('trade-cu-min'),reference:numberInput('trade-ref'),weights:['first','second','third'].map(s=>numberInput('weight-'+s))};}
function selectedCandidate(){return S.trade?.front.find(p=>p.key===S.manualKey)||S.trade?.candidate||null;}
function objectivePlot(r){
 const p=profile(),kind=p.kind,c=caseById(p.caseIds[0]),traces=[],labels=['#356fb5','#2e8b77'];
 const coord=q=>kind==='dose'?[q.y,q.cu]:[q.demand,q.y];
 for(const [i,cid] of p.caseIds.entries()){
  const set=r.all.filter(q=>q.caseId===cid),xy=set.map(coord);
  traces.push({x:xy.map(v=>v[0]),y:xy.map(v=>v[1]),mode:S.tradeMethod==='observed'?'markers':'lines',name:caseById(cid).title,line:{color:labels[i%labels.length],width:1.5},marker:{size:7,color:labels[i%labels.length]},customdata:set.map(q=>[q.x,q.label]),hovertemplate:'Input %{customdata[0]:.5g}<br>%{customdata[1]}<br>x %{x:.5g}, y %{y:.5g}<extra></extra>'});
 }
 if(S.tradeMethod!=='observed'){
  const observed=p.caseIds.flatMap(id=>D.points(caseById(id),'observed')).filter(q=>q.x>=numberInput('trade-x-min')&&q.x<=numberInput('trade-x-max')).map(q=>({...q,demand:kind==='ph'?Math.abs(q.x-r.reference):kind==='potential'?Math.abs(q.x):q.x}));
  const xy=observed.map(coord);
  traces.push({x:xy.map(v=>v[0]),y:xy.map(v=>v[1]),mode:kind==='dose'?'markers+text':'markers',text:observed.map(q=>n(q.x)+' '+(c.x.unit==='mass ratio'?'':c.x.unit)),textposition:'top center',textfont:{size:10},marker:{size:8,color:'#b35435',line:{color:'#fff',width:1}},name:'Reported settings',customdata:observed.map(q=>[q.x,q.label]),hovertemplate:'Reported input %{customdata[0]:.5g}<br>%{customdata[1]}<br>x %{x:.5g}, y %{y:.5g}<extra>Observation</extra>'});
 }
 if(r.front.length){const xy=r.front.map(coord);traces.push({x:xy.map(v=>v[0]),y:xy.map(v=>v[1]),mode:'markers',name:'Feasible Pareto candidates',marker:{size:6,color:'#b5821e'},customdata:r.front.map(q=>q.x),hovertemplate:'Input %{customdata:.5g}<br>x %{x:.5g}, y %{y:.5g}<extra>Pareto candidate</extra>'});}
 const best=selectedCandidate();if(best){const xy=coord(best);traces.push({x:[xy[0]],y:[xy[1]],mode:'markers',name:'Selected candidate',marker:{size:13,symbol:'diamond',color:'#14263d'},hovertemplate:'Selected input '+n(best.x,4)+'<extra></extra>'});}
 const xlabel=kind==='dose'?'Reported Au ('+c.y.unit+') · lower preferred':kind==='ph'?'Distance from pH '+n(r.reference)+' · smaller preferred':kind==='potential'?'Reported |E| (V) · smaller preferred':'CS:GO ratio · lower preferred';
 const ylabel=kind==='dose'?'Reported Cu (mg/L) · higher preferred':c.y.label+' ('+c.y.unit+') · higher preferred';
 const layout=basePlot(xlabel,ylabel);layout.uirevision=p.id+'-'+S.tradeMethod;
 Plotly.react('trade-plot',traces,layout,plotConfig);
}
function renderTrade(){
 const p=profile(),c=caseById(p.caseIds[0]);
 $('#trade-title').textContent=p.title;$('#trade-description').textContent=p.description;$('#trade-warning').textContent=p.warning;
 $('#response-constraints').hidden=p.kind==='dose';$('#dose-constraints').hidden=p.kind!=='dose';$('#ph-preference').hidden=p.kind!=='ph';$('#weight-third-field').hidden=p.kind!=='dose';
 $('#trade-caution').disabled=S.tradeMethod!=='gp';
 ['first','second','third'].forEach((key,i)=>{$('#weight-'+key+'-label').textContent=(p.objectives[i]||'Unused')+' · '+$('#weight-'+key).value});
 try{
  S.trade=D.optimise(DATA.cases,p,tradeOptions());const r=S.trade,chosen=selectedCandidate();
  $('#trade-summary').innerHTML=`<div class="metric"><span>In-range candidates</span><strong>${r.all.length}</strong></div><div class="metric"><span>Meet constraints</span><strong>${r.feasible.length}</strong></div><div class="metric"><span>On Pareto front</span><strong>${r.front.length}</strong></div><p class="muted">${p.kind==='dose'?'Constraints screen Au and Cu separately.':'Minimum response: '+n(r.target,4)+' '+esc(c.y.unit)+'.'} Weights rank the feasible Pareto set after scaling each objective over the current candidate range. ${r.z?'Screening uses '+r.z+' × GP model SD; ranking still compares means.':'Screening uses reported values or predicted means.'} ${r.excludedNegative?r.excludedNegative+' negative model predictions were excluded from decision candidates.':''}</p>`;
  $('#candidate-summary').innerHTML=chosen?`<span class="eyebrow">${chosen.observed?'Reported setting meeting preferences':'Model candidate — requires validation'}</span><strong>${n(chosen.x,4)} ${esc(c.x.unit==='mass ratio'?'':c.x.unit)}</strong><p>${esc(chosen.label)}<br>Response: ${n(chosen.y,5)} ${esc(c.y.unit)}${Number.isFinite(chosen.cu)?'; Cu: '+n(chosen.cu,5)+' mg/L':''}. ${chosen.atMeasuredInput?'The input is already represented in the source data.':'Choose practically achievable settings before a new experiment.'}</p>`:'<strong>No supported candidate</strong><p>No evaluated point satisfies these constraints. Review the targets or obtain additional measurements; the search does not extend beyond the source range.</p>';
  $('#add-candidate').disabled=!chosen;
  const front=r.front.slice(0,12);$('#trade-table').innerHTML=table(['Candidate','Study','Response','Secondary objective','Relative score',''],front.map(q=>[n(q.x,4)+' '+esc(c.x.unit==='mass ratio'?'':c.x.unit),esc(q.label),n(q.y,5),p.kind==='dose'?'Cu '+n(q.cu,5)+' mg/L':n(q.demand,4),n(q.score,4),`<button type="button" class="small-button" data-pick="${esc(q.key)}">Inspect</button>`]))+'<p class="footnote">The table shows up to 12 candidates ranked by the current priorities. Fine digits reflect the calculation grid, not preparation precision.</p>';
  $$('#trade-table [data-pick]').forEach(button=>button.addEventListener('click',()=>{S.manualKey=button.dataset.pick;renderTrade()}));
  const comparison=Object.keys(D.names).map(method=>{const result=D.optimise(DATA.cases,p,tradeOptions(method)),q=result.candidate;return[esc(D.names[method]),q?n(q.x,4):'None',q?esc(q.label):'—',String(result.feasible.length),method==='gp'?'Uses selected model-SD screening':'No uncertainty band applied'];});
  $('#trade-comparison').innerHTML=table(['Method','Preferred input','Study','Feasible candidates','Screening'],comparison);
  objectivePlot(r);
 }catch(error){S.trade=null;$('#trade-summary').innerHTML='<p class="note">'+esc(error.message)+'</p>';$('#candidate-summary').textContent='Check the input settings.';$('#add-candidate').disabled=true;$('#trade-table').innerHTML='';$('#trade-comparison').innerHTML='';Plotly.react('trade-plot',[],basePlot('',''),plotConfig);}
}
function addCandidate(){
 const p=selectedCandidate();if(!p)return;const c=caseById(p.caseId),key=p.key;
 if(!S.memo.some(m=>m.key===key))S.memo.push({key,caseId:c.id,title:c.title,category:c.category,input:p.x,unit:c.x.unit,method:D.names[S.tradeMethod],evidence:p.observed?'Reported observation':'Model prediction',response:p.y,profileId:S.tradeId});
 $('#add-candidate').textContent='Added to candidate memo';
}
function readPlan(){return {ratios:$('#plan-ratios').value,doses:$('#plan-doses').value,phLevels:$('#plan-ph').value,blocks:$('#plan-blocks').value,metadata:{batch:$('#meta-batch').value,recipe:$('#meta-recipe').value,volume_ml:$('#meta-volume').value,ph:$('#meta-ph').value,contact_min:$('#meta-time').value,temperature_c:$('#meta-temp').value}};}
function renderMemo(){
 $('#plan-memo').innerHTML=S.memo.length?table(['Study','Input','Method','Evidence'],S.memo.map(m=>[esc(m.title),n(m.input,4)+' '+esc(m.unit==='mass ratio'?'':m.unit),esc(m.method),esc(m.evidence)])):'<p class="muted">Add a candidate from Multi-objective to retain it for this page session.</p>';
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
 $('#evidence-content').innerHTML=`<div class="eyebrow">Evidence and interpretation</div><h1>More data, with the original study boundaries retained</h1><p class="lead">${DATA.cases.length} local response series contain ${DATA.cases.reduce((s,c)=>s+c.observations.length,0)} source settings in total. This is an inventory count across different studies, not a pooled training set or a known count of independent experiments.</p><div class="source-grid">${DATA.evidence.map(e=>`<article class="source-item"><span class="tag">${esc(e.status)}</span><h2>${esc(e.title)}</h2><p>${esc(e.detail)}</p></article>`).join('')}</div><h2>Retrospective model checks</h2><div class="table-scroll">${table(['Response series','Source settings','Response unit','GP RMSE','PCHIP RMSE','Decision scope'],rows)}</div><p class="muted">RMSE has the response units shown in each row and cannot be compared across studies with different units. Entire input settings are held out. Source processing, missing repeats and endpoint extrapolation limit what these scores establish.</p><h2>How to interpret a candidate</h2><ol class="evidence-list"><li>Measurements, model estimates and proposed experiments remain distinct.</li><li>The Pareto set is computed only within the selected local study and measured input range, after the stated constraints.</li><li>Priority weights rank trade-offs; they do not prove a unique scientific optimum. No candidate has been verified by a new experiment.</li><li>Distance from a pH reference and reported potential magnitude are preferences, not reagent consumption, energy or cost.</li><li>Concentration decreases are not metallic-gold yields. Recovery needs matched feed and product measurements and a material balance.</li></ol><p class="note">${esc(DATA.privacy_note)}</p>`;
}
function showView(next){
 if(!['models','trade','plan','evidence','guide'].includes(next))return;
 if(S.view==='plan')S.planForm=readPlan();
 if(next==='guide'&&S.view!=='guide')S.lastView=S.view;
 const wasGuide=S.view==='guide';S.view=next;
 for(const key of ['models','trade','plan','evidence','guide'])$('#'+key+'-view').hidden=key!==next;
 $$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===next);b.setAttribute('aria-current',b.dataset.view===next?'page':'false')});
 $('#guide-open').setAttribute('aria-expanded',String(next==='guide'));
 if(next==='models')renderModel();if(next==='trade')renderTrade();if(next==='plan')renderPlan();if(next==='evidence')renderEvidence();
 if(next==='guide')history.replaceState(null,'',location.pathname+location.search+'#instructions');else if(wasGuide)history.replaceState(null,'',location.pathname+location.search);
}
optionGroups();tradeDefaults();
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('#guide-open').addEventListener('click',()=>showView('guide'));$('#guide-close').addEventListener('click',()=>showView(S.lastView));
$('#model-case').addEventListener('change',e=>{S.caseId=e.target.value;S.inspectIndex=0;renderModel()});
$('#model-method').addEventListener('change',e=>{S.method=e.target.value;S.inspectIndex=0;renderModel()});
$('#model-band').addEventListener('change',e=>{S.band=e.target.checked;renderModel()});$('#inspect-x').addEventListener('input',e=>{S.inspectIndex=+e.target.value;renderModel()});
$('#model-to-trade').addEventListener('click',()=>{const p=DATA.profiles.find(p=>p.caseIds.includes(S.caseId));if(p){S.tradeId=p.id;S.tradeMethod=S.method;tradeDefaults();showView('trade')}});
$('#trade-case').addEventListener('change',e=>{S.tradeId=e.target.value;tradeDefaults();renderTrade()});
$('#trade-method').addEventListener('change',e=>{S.tradeMethod=e.target.value;S.manualKey=null;renderTrade()});
for(const id of ['trade-caution','trade-x-min','trade-x-max','trade-target','trade-au-max','trade-cu-min','trade-ref','weight-first','weight-second','weight-third'])$('#'+id).addEventListener('input',()=>{S.manualKey=null;$('#add-candidate').textContent='Add to candidate memo';renderTrade()});
$('#trade-reset').addEventListener('click',()=>{tradeDefaults();renderTrade()});$('#add-candidate').addEventListener('click',addCandidate);
$('#generate-plan').addEventListener('click',generatePlan);$('#include-candidates').addEventListener('click',includeCandidates);$('#clear-memo').addEventListener('click',()=>{S.memo=[];renderMemo()});
showView(location.hash==='#instructions'?'guide':'models');
