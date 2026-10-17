/* Plan actions and on-demand settings. Personal records stay browser-local. MIT. */
(async function(){
'use strict';
const desktopPlanning=window.matchMedia?.('(min-width: 961px)');
const U=window.RCIUI,C=window.RCI,T=window.RCICourseContext,E=window.RCIPlanning,e=C.esc,box=document.getElementById('planning-controls');if(!box)return;
let db,p,query='',mode='desired',worker=null,preparing=false,searchTimer=null,generation=0,generationIssue='',renderId=0,fixedSettingsNotice=false,workloadSemester=1,defaultsApplied=false,defaultsFeedbackTimer=null;
let settingsDraft=null,settingsBase='',settingsSaving=false,settingsClosing=false,autoEntrySetup=false,settingsAttempted=false;
let autoDraft=null,autoBase='',autoClosing=false,autoApplying=false,autoOpening=false,quickStarting=false,generateAfterSettings=false,lastApplied=null;
let searchDocs,settingsViewKey='',conditionsViewKey='',contextViewKey='';
const dialog=document.getElementById('planning-error-dialog'),result=document.getElementById('planning-error-content');
const conditions=document.getElementById('auto-conditions-dialog');
const settings=document.getElementById('plan-settings-dialog'),tools=document.getElementById('plan-tools-dialog');
try{
 db=await U.data();
 searchDocs=db.courses.map(c=>({id:c.module_code,code:c.module_code,title:C.courseName(c),summary:db.names[c.module_code]||'',aliases:[c.module_code,db.names[c.module_code]||''],body:c.section_2025,tasks:['study'],kind:'course',course:c}));
 await render();
}catch(error){box.innerHTML=`<p class="notice">${e(error.message)}。现有计划没有修改。</p><button type="button" class="button secondary" data-backup-open>备份与恢复</button>`;return;}
function title(code){const own=p.items.find(x=>x.code===code&&x.custom);if(own)return own.name;return db.names[code]||C.courseName(db.courses.find(c=>c.module_code===code))||p.items.find(x=>x.code===code)?.name||code;}
function fields(value,prefix,keys=['minECTS','maxECTS','minExams','maxExams'],form=''){return [['minECTS','学分下限','ECTS',120,.5],['maxECTS','学分上限','ECTS',120,.5],['minExams','考试数下限','次',50,1],['maxExams','考试数上限','次',50,1]].filter(([key])=>keys.includes(key)).map(([key,label,unit,max,step])=>`<label>${label}<span class="plan-number-control"><input name="${prefix+key}" ${form?`form="${form}"`:''} type="number" min="0" max="${max}" step="${step}" value="${value[key]}" aria-label="${label}（${unit}）" required><span aria-hidden="true">${unit}</span></span></label>`).join('');}
function semesterLabel(number,plan=p){const term=T.term(plan,number);return term.year===null?term.label:`第 ${number} 学期 · ${term.label}`;}
const clone=value=>JSON.parse(JSON.stringify(value));
function settingsValues(plan){return clone({cohort:plan.cohort,conditional:plan.conditional,conditionalConfirmed:plan.conditionalConfirmed,timeline:plan.timeline});}
function autoValues(plan){return clone({workload:plan.workload,preferences:Object.fromEntries(['languages','startSemester','allowUnconfirmed','deadlineException','desired','excluded'].map(key=>[key,plan.preferences[key]]))});}
function settingsDirty(){return !!settingsDraft&&JSON.stringify(settingsDraft)!==settingsBase;}
function settingsPlan(latest=p){
 if(!settingsDraft)return latest;
 const draft=clone(settingsDraft),count=draft.timeline.count;
 return {...latest,...draft,preferences:{...latest.preferences,startSemester:Math.min(latest.preferences.startSemester,count)},items:latest.items.map(x=>x.status==='planned'&&x.semester>count?{...x,semester:desktopPlanning?.matches?1:0}:x)};
}
function autoPlan(latest=p){
 if(!autoDraft)return latest;
 const draft=clone(autoDraft);
 return {...latest,workload:draft.workload,preferences:{...latest.preferences,...draft.preferences,startSemester:Math.min(draft.preferences.startSemester,latest.timeline.count)}};
}
function autoDirty(){return !!autoDraft&&JSON.stringify(autoDraft)!==autoBase;}
function autoError(message='',reload=false){const node=document.getElementById('auto-conditions-error');node.hidden=!message;node.innerHTML=`<p>${e(message)}</p>${reload?'<button type="button" class="quiet" data-reload-auto>载入已保存条件</button>':''}`;}
function settingsError(message='',reload=false){
 document.getElementById('plan-settings-error').hidden=!message;
 document.getElementById('plan-settings-error-message').textContent=message;
 document.getElementById('plan-settings-reload').hidden=!reload;
}
function updateSettingsState(){
 const note=document.getElementById('plan-settings-save-state'),button=settings.querySelector('[data-finish-settings]');
 document.getElementById('plan-settings-title').textContent=generateAfterSettings?'补充学业信息':'学业信息';
 document.getElementById('plan-settings-description').textContent=generateAfterSettings?'确认一次，之后即可直接一键规划。':'修改后保存，返回规划条件。';
 document.getElementById('plan-settings-cancel').textContent=autoEntrySetup?'取消':'返回条件';
 document.getElementById('plan-settings-close').setAttribute('aria-label',autoEntrySetup?'关闭自动规划':'返回条件');
 note.textContent=settingsSaving?'正在保存设置…':generateAfterSettings?'保存后直接生成并更新看板，可撤销。':'保存学业信息，保留本次课程偏好。';
 document.getElementById('plan-settings-content').inert=settingsSaving;
 button.disabled=settingsSaving;button.textContent=settingsSaving?'正在保存…':generateAfterSettings?'开始规划':'保存并返回';
}
function updateQuickState(){
 const busy=!!(quickStarting||preparing||worker||autoApplying);
 document.getElementById('plan-quick-button').disabled=busy;
 document.getElementById('plan-quick-button').setAttribute('aria-busy',String(busy));
 document.getElementById('plan-quick-label').textContent=busy?'正在规划…':'一键规划';
 document.getElementById('plan-conditions-button').disabled=busy;
}
function renderQuickResult(){
 const node=document.getElementById('plan-quick-result');
 if(lastApplied&&JSON.stringify(p)!==JSON.stringify(lastApplied.next))lastApplied=null;
 node.hidden=!lastApplied;if(!lastApplied)return;
 const r=lastApplied.result,omitted=r.desired?.omitted.length||0,excluded=(r.removed||[]).length-(r.replaced||[]).length;
 node.innerHTML=`<div><b>已完成规划 · ${r.finish} 个学期</b><p>新增 ${r.added.length} 门 · 调整 ${r.moved.length} 门 · 替换 ${(r.replaced||[]).length} 门${excluded?` · 按排除移除 ${excluded} 门`:''}${omitted?` · ${omitted} 门想选未纳入`:''}。${r.warnings.length?'实际开课与选课要求请在课程详情中核对。':''}</p>${omitted?`<ul class="plan-result-omissions">${r.desired.omitted.map(x=>`<li><b>${e(x.name)}（${e(x.code)}）</b>：${e(x.reason)}</li>`).join('')}</ul>`:''}</div><div class="inline-actions"><button type="button" class="quiet" data-undo-quick>撤销</button></div>`;
}
function requiredSettings(plan){return !C.cohorts.includes(plan.cohort)?'先选择入学时间，并确认录取通知里的补修要求。':!plan.conditionalConfirmed?'先确认录取通知里的补修要求。':(plan.cohort.endsWith('夏季')?'summer':'winter')!==plan.timeline.start?'第一学期与入学时间不一致，请调整。':'';}
function requiredSettingErrors(plan){
 const errors={};
 if(plan.cohort==='unknown')errors['plan-cohort']='请选择入学时间。';
 else if(!C.cohorts.includes(plan.cohort))errors['plan-cohort']='该入学时间暂不支持自动规划，可继续手动排课。';
 if(!plan.conditionalConfirmed)errors['controls-conditional-status']='请按录取通知选择是否需要补修。';
 if(C.cohorts.includes(plan.cohort)&&(plan.cohort.endsWith('夏季')?'summer':'winter')!==plan.timeline.start)errors['plan-start-term']='请与入学时间的冬／夏季保持一致。';
 return errors;
}
function settingErrorHTML(id,errors){return `<small id="${id}-error" class="settings-field-error" ${errors[id]?'':'hidden'}>${e(errors[id]||'')}</small>`;}
function settingErrorAttrs(id,errors){return `aria-invalid="${!!errors[id]}" aria-describedby="${id}-error${id==='controls-conditional-status'?' settings-remediation-help':''}"`;}
function defaultConditions(plan){return C.validatePlan({...plan,workload:undefined,preferences:{...plan.preferences,languages:undefined,startSemester:Math.min(plan.timeline.count,Math.max(1,...plan.items.filter(x=>x.status==='passed').map(x=>x.semester))),allowUnconfirmed:undefined,deadlineException:undefined}},db.courses);}
function updateDefaultFeedback(){
 const button=document.getElementById('plan-use-default-conditions'),status=document.getElementById('plan-default-conditions-status');
 if(button){button.classList.toggle('is-success',defaultsApplied);button.innerHTML=defaultsApplied?'<span aria-hidden="true">✓</span>已填入默认条件':'使用默认条件';}
 if(status)status.textContent=defaultsApplied?'已填入默认条件，可继续调整，规划成功后生效。':'';
}
function setDefaultFeedback(applied=false){
 clearTimeout(defaultsFeedbackTimer);defaultsFeedbackTimer=null;defaultsApplied=applied;updateDefaultFeedback();
 if(applied)defaultsFeedbackTimer=setTimeout(()=>setDefaultFeedback(),3500);
}
async function applyDefaultConditions(){
 if(worker||preparing||autoApplying||!autoDraft)return;
 setDefaultFeedback();autoDraft=autoValues(defaultConditions(autoPlan()));
 await render();setDefaultFeedback(true);
}
function settingsHTML(p=settingsPlan()){const errors=autoEntrySetup&&!settingsAttempted?{}:requiredSettingErrors(p);return `
 <section id="plan-options" class="plan-basic-settings plan-settings-card" aria-labelledby="plan-basics-title">
  <div class="settings-section-heading"><div><h3 id="plan-basics-title">学业信息</h3></div><span class="settings-save-badge is-draft">保存后生效</span></div>
  <div class="plan-settings-grid">
   <label><span class="settings-field-label">入学时间 <small class="settings-required">必选</small></span><select id="plan-cohort" aria-required="true" ${settingErrorAttrs('plan-cohort',errors)}>${[['unknown','请选择'],...C.cohorts.map(v=>[v,v]),['older','其他时间']].map(([v,t])=>`<option value="${e(v)}" ${p.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select>${settingErrorHTML('plan-cohort',errors)}</label>
   <label><span class="settings-field-label">录取通知的补修要求 <small class="settings-required">必选</small></span><select id="controls-conditional-status" aria-required="true" ${settingErrorAttrs('controls-conditional-status',errors)}><option value="unknown" ${!p.conditionalConfirmed?'selected':''}>还没确认</option><option value="no" ${p.conditionalConfirmed&&!p.conditional?'selected':''}>不需要</option><option value="yes" ${p.conditionalConfirmed&&p.conditional?'selected':''}>需要</option></select>${settingErrorHTML('controls-conditional-status',errors)}</label>
  </div>
  <details id="plan-timeline-options" class="plan-timeline-options" ${generateAfterSettings?'':'open'}><summary>学期安排 · ${p.timeline.count} 个学期</summary><div class="plan-settings-grid">
   <label>计划学期数<select id="plan-semester-count">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${p.timeline.count===i+1?'selected':''}>${i+1} 个学期</option>`).join('')}</select></label>
   <label ${p.cohort==='unknown'?'hidden':''}>第一学期<select id="plan-start-term" ${settingErrorAttrs('plan-start-term',errors)}><option value="winter" ${p.timeline.start==='winter'?'selected':''}>冬季学期</option><option value="summer" ${p.timeline.start==='summer'?'selected':''}>夏季学期</option></select>${settingErrorHTML('plan-start-term',errors)}</label>
  </div></details>
  <div class="settings-basics-foot"><p id="settings-remediation-help" class="meta settings-field-help">入学时间决定适用规则，补修要求请按录取通知填写。</p><p class="settings-pace">120 ECTS ÷ ${p.timeline.count} 学期 <span aria-hidden="true">≈</span> <strong>${Number((120/p.timeline.count).toFixed(1))} ECTS／学期</strong><span>仅作平均参考</span></p></div>
 </section>
 `;}
function autoCourseHTML(plan){return `<details id="auto-course-options" class="auto-course-options"><summary><span><b>想选与排除</b><small>想选 ${plan.preferences.desired.length} 门 · 排除 ${plan.preferences.excluded.length} 门</small></span><span class="settings-disclosure-arrow" aria-hidden="true">⌄</span></summary><div class="auto-course-content"><div class="preference-modes" role="tablist" aria-label="自动规划课程偏好">${[['desired','想选'],['excluded','排除']].map(([key,label])=>`<button id="auto-preference-tab-${key}" type="button" role="tab" aria-selected="${mode===key}" tabindex="${mode===key?0:-1}" aria-controls="auto-preference-panel" data-auto-preference-mode="${key}">${label}<span>${plan.preferences[key].length}</span></button>`).join('')}</div><div id="auto-preference-panel" role="tabpanel" aria-labelledby="auto-preference-tab-${mode}"><p class="preference-mode-help">${mode==='excluded'?'自动方案不会补入这些课程；已修记录继续保留。':'优先纳入这些课程，可替换未固定的已有选修；无法纳入时会说明原因。'}</p><label class="preference-search-label" for="auto-preference-search">搜索课程</label><input id="auto-preference-search" type="search" value="${e(query)}" placeholder="输入课程名或代码" maxlength="160" autocomplete="off"><div id="auto-preference-results" class="preference-results"></div><section class="preference-selections"><h3>${mode==='excluded'?'已排除':'已设为想选'} <small>规划成功后保存</small></h3>${plan.preferences[mode==='excluded'?'excluded':'desired'].map(code=>`<span class="preference-chip">${e(title(code))} <small>${e(code)}</small><button class="quiet" type="button" data-auto-forget="${e(code)}" data-kind="${mode==='excluded'?'excluded':'desired'}" aria-label="取消${mode==='excluded'?'排除':'想选'} ${e(title(code))}">×</button></span>`).join('')||'<p class="meta">尚未添加</p>'}</section></div></div></details>`;}
function autoConditionsHTML(plan=autoPlan()){
 const p=plan,defaults=defaultConditions(plan),missing=requiredSettings(plan);
 return `<section class="auto-academic-summary" aria-label="当前计划信息"><div><span class="auto-context-label">当前计划</span><p><b>${e(plan.cohort==='unknown'?'入学时间待设置':plan.cohort==='older'?'其他入学时间':plan.cohort)}</b><span>· ${plan.timeline.count} 个学期</span><span>· ${plan.conditionalConfirmed?(plan.conditional?'需要补修':'无补修要求'):'补修要求待确认'}</span></p>${missing?`<small class="auto-academic-missing">${e(missing)}</small>`:''}</div><button type="button" class="button secondary" data-edit-academic>修改学业信息</button></section><div class="auto-record-summary">已修 ${C.calculate(defaults,db.courses,true).allocated} ECTS · ${plan.items.filter(x=>x.status==='planned'&&x.locked).length} 门课程固定学期。已修记录和固定安排会保留；未固定选修可被替换。</div><div class="auto-default-row"><p id="auto-default-help">设置每学期负担和课程偏好，也可使用默认条件。</p><button id="plan-use-default-conditions" type="button" class="quiet" data-use-default-conditions aria-describedby="auto-default-help">使用默认条件</button><span id="plan-default-conditions-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></span></div>
 <section id="planning-preference-settings" class="plan-load-settings plan-settings-card" aria-labelledby="plan-load-title">
  <div class="settings-section-heading"><span class="settings-section-number" aria-hidden="true">01</span><div><h3 id="plan-load-title">每学期的负担与语言</h3></div><span class="settings-save-badge is-draft">规划成功后生效</span></div>
  <form id="planning-preferences">
   <div class="plan-common-fields">${fields(p.workload,'',['maxECTS','maxExams'])}<label>从哪个学期开始规划<select name="startSemester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}" ${p.preferences.startSemester===i+1?'selected':''}>${e(semesterLabel(i+1,p))}</option>`).join('')}</select></label>
   <fieldset class="settings-language-choices"><legend>授课语言 <small>可多选</small></legend><div>${['EN','DE'].map(l=>`<label class="check"><input type="checkbox" name="language" value="${l}" ${p.preferences.languages.includes(l)?'checked':''}><span>${l==='EN'?'英语':'德语'}</span></label>`).join('')}</div></fieldset></div>
   <p class="meta settings-exam-note">考试数为估算：每门课计 1 次，论文和研讨课也计入。</p>
  </form>
 </section>
 ${autoCourseHTML(p)}
 <section class="settings-optional" aria-label="更多规划条件">
   <details id="advanced-planning-limits"><summary><span><b>其他排课要求</b><small>最低负担、开课确认与进度要求</small></span><span class="settings-disclosure-arrow" aria-hidden="true">⌄</span></summary><div class="settings-disclosure-body"><div class="load-fields">${fields(p.workload,'',['minECTS','minExams'],'planning-preferences')}</div><p class="meta">填 0 表示不设最低要求。</p>
    <div class="planning-toggle-options">${[
     ['allowUnconfirmed','提前安排尚未公布开课的课程','例如某课通常在冬季开，可先排到明年冬季，之后再确认是否开课。'],
     ['deadlineException','没达到学校进度要求，也继续排课','例如某学期累计学分不足，仍继续排课并提醒你；不代表学校已批准延期。']
    ].map(([key,label,help])=>`<div class="planning-toggle-option"><label class="check"><input name="${key}" form="planning-preferences" type="checkbox" aria-describedby="${key}-help" ${p.preferences[key]?'checked':''}>${label}</label><p id="${key}-help" class="meta">${help}</p></div>`).join('')}</div></div>
   </details>
  <details id="semester-overrides"><summary><span><b>单独设置某个学期${Object.keys(p.workload.semesters).length?`<span class="settings-override-count">${Object.keys(p.workload.semesters).length} 个已设置</span>`:''}</b><small>为实习、论文等学期调整负担</small></span><span class="settings-disclosure-arrow" aria-hidden="true">⌄</span></summary><div class="settings-disclosure-body"><p class="meta">只覆盖所选学期，其他学期沿用上方设置。生成时统一检查各学期条件。</p><form id="semester-workload"><label>选择学期<select name="semester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}" ${workloadSemester===i+1?'selected':''}>${e(semesterLabel(i+1,p))}</option>`).join('')}</select></label><div class="load-fields">${fields(E.bounds(p,workloadSemester),'')}</div><div class="inline-actions"><button class="quiet" type="button" data-reset-workload>恢复为统一设置</button></div></form><div class="workload-overrides">${Object.entries(p.workload.semesters).map(([n])=>`<p>第 ${n} 学期：学分 ${E.bounds(p,n).minECTS}–${E.bounds(p,n).maxECTS} ECTS，考试 ${E.bounds(p,n).minExams}–${E.bounds(p,n).maxExams} 次（估算）</p>`).join('')||''}</div></div></details>
 </section>
 `;
}
function renderSettingsContent(){
 const plan=settingsPlan(),key=JSON.stringify([settingsValues(plan),autoEntrySetup,settingsAttempted,generateAfterSettings]);
 if(key===settingsViewKey)return;
 document.getElementById('plan-settings-content').innerHTML=settingsHTML(plan);settingsViewKey=key;
}
function renderConditionsContent(){
 const plan=autoPlan();workloadSemester=Math.min(workloadSemester,plan.timeline.count);
 const key=JSON.stringify([plan,workloadSemester,mode,query]);
 if(key===conditionsViewKey)return;
 document.getElementById('auto-conditions-content').innerHTML=autoConditionsHTML(plan);conditionsViewKey=key;
 searchAuto(plan);updateDefaultFeedback();
}
async function render(openingPanel=null){
 const id=++renderId;p=await U.plan();if(id!==renderId)return;
 const scrollState=['auto-conditions-content','auto-preference-results'].map(id=>[id,document.getElementById(id)?.scrollTop||0]);
 const detailState=[...box.querySelectorAll('details[id]')].map(x=>[x.id,x.open]);
 if(autoDraft&&!autoApplying){
  const saved=autoValues(p),base=JSON.parse(autoBase);base.preferences.startSemester=Math.min(base.preferences.startSemester,p.timeline.count);
  if(JSON.stringify(saved)===JSON.stringify(base)){autoBase=JSON.stringify(base);autoDraft.preferences.startSemester=Math.min(autoDraft.preferences.startSemester,p.timeline.count);}
  else if(!autoDirty()){autoDraft=saved;autoBase=JSON.stringify(saved);}
  else autoError('自动规划条件已在其他页面修改。当前草稿已保留，请载入已保存条件后重新调整。',true);
 }
 if(settingsDraft&&!settingsSaving&&JSON.stringify(settingsValues(p))!==settingsBase){
  if(!settingsDirty()){settingsDraft=settingsValues(p);settingsBase=JSON.stringify(settingsDraft);}
  else settingsError('设置已在其他页面修改。当前草稿已保留，请载入已保存设置后重新调整。',true);
 }
 const active=document.activeElement,focus=active?.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:active?.form?.id&&active.name?{form:active.form.id,name:active.name,value:active.value}:null;
 const contextKey=JSON.stringify([p.cohort,p.timeline.count]);
 if(contextKey!==contextViewKey){document.getElementById('plan-context').innerHTML=`<p class="plan-context-summary"><span>${e(p.cohort==='unknown'?'入学时间待设置':p.cohort==='older'?'其他入学时间':p.cohort)}</span><span aria-hidden="true">·</span><span>${p.timeline.count} 个学期</span></p>`;contextViewKey=contextKey;}
 const saveState=document.getElementById('plan-save-state');
 saveState.className=`plan-save-state${U.persisted?'':' is-temporary'}`;
 saveState.textContent=U.persisted?'自动保存在此浏览器':'仅本页有效，请导出备份';
 document.getElementById('plan-add-course').dataset.pickSemester=String(desktopPlanning?.matches?1:p.preferences.startSemester);
 if(settings.open||openingPanel===settings)renderSettingsContent();
 updateSettingsState();
 if(conditions.open||openingPanel===conditions)renderConditionsContent();
 updateQuickState();renderQuickResult();
 if(settings.open&&!fixedSettingsNotice){const notice=document.getElementById('plan-settings-notice'),message=requiredSettings(settingsPlan());notice.textContent=message;notice.hidden=!message;}
 box.querySelector('[data-clear-area]').hidden=!p.items.length;
 for(const [key,isOpen] of detailState){const el=document.getElementById(key);if(el)el.open=isOpen;}
 for(const [key,top] of scrollState){const el=document.getElementById(key);if(el)el.scrollTop=top;}
 if(focus){const el=focus.id?document.getElementById(focus.id):[...(document.getElementById(focus.form)?.elements||[])].find(x=>x.name===focus.name&&(x.type!=='checkbox'||x.value===focus.value));if(el?.focus){el.focus({preventScroll:true});if(focus.id&&el.type==='search'&&Number.isInteger(focus.start))el.setSelectionRange(focus.start,focus.end);}}
}
function searchHTML(kind,searchQuery,plan){
 const list=window.RCISearch.search(searchDocs,searchQuery,db.synonyms||[]).slice(0,searchQuery?20:6).map(d=>d.course);
 return list.map(c=>{const own=plan.items.find(x=>x.code===c.module_code&&x.custom),shown=own?{...c,ects:own.ects,allowed_groups:[own.group]}:c;const already=plan.preferences[kind].includes(c.module_code);return `<div class="preference-result"><span><b>${e(C.courseName(c))}</b><small>${e(c.module_code)} · ${shown.ects} ECTS${db.names[c.module_code]?' · '+e(db.names[c.module_code]):''}</small>${own?'<small>保留原有自录认定；学分与归类需个人核对。</small>':c.recommendation_note?`<small>${e(c.recommendation_note)}</small>`:''}</span><button class="quiet" type="button" data-auto-record="${e(c.module_code)}" ${already?'disabled':''}>${already?'已记录':kind==='desired'?'想选 ＋':'排除 ＋'}</button></div>`;}).join('')||'<p class="meta">未找到。目录外课程可从「更多」中自行录入，认定需学校确认。</p>';
}
function searchAuto(plan=autoPlan()){document.getElementById('auto-preference-results').innerHTML=searchHTML(mode,query,plan);}
async function closeSettings(){
 if(settingsSaving||settingsClosing)return false;
 settingsClosing=true;
 try{
  if(settingsDirty()&&!await U.confirmAction('放弃未保存的设置？','本次修改还未生效，关闭后将保留原来的设置。','放弃修改'))return false;
  if(autoEntrySetup&&!await closeAuto())return false;
  const resume=!autoEntrySetup;settings.close();settingsDraft=null;settingsBase='';settingsViewKey='';autoEntrySetup=false;settingsError();
  if(resume)await openAutoConditions();return true;
 }finally{settingsClosing=false;}
}
async function closeAuto(){
 if(autoApplying||autoClosing)return false;autoClosing=true;
 try{
  if(autoDirty()&&!await U.confirmAction('放弃本次规划条件？','当前课程安排没有修改；本次调整的条件将不再保留。','放弃本次调整'))return false;
  cancelGeneration();conditions.close();dialog.close();autoDraft=null;autoBase='';conditionsViewKey='';generateAfterSettings=false;autoError();setDefaultFeedback();return true;
 }finally{autoClosing=false;}
}
async function openPlanDialog(target){
 for(const other of [settings,tools,conditions])if(other!==target&&other.open){if(other===settings){if(!await closeSettings())return false;}else other.close();}
 if(!target.open)target.showModal();return true;
}
function focusRequiredSettings(plan){
 const required=Object.keys(requiredSettingErrors(plan))[0];
 if(required){const field=document.getElementById(required),details=field.closest?.('details');if(details)details.open=true;field.focus({preventScroll:true});field.scrollIntoView({block:'nearest'});}
}
async function loadAutoDraft(){
 if(!autoDraft){autoDraft=autoValues(await U.plan());autoBase=JSON.stringify(autoDraft);mode='desired';query='';}
}
async function openSettings(message='',fixedNotice=false,entrySetup=false){
 const starting=!autoDraft;await loadAutoDraft();
 if(!settingsDraft){settingsDraft=settingsValues(await U.plan());settingsBase=JSON.stringify(settingsDraft);settingsAttempted=false;settingsError();}
 autoEntrySetup=entrySetup||starting;fixedSettingsNotice=fixedNotice;await render(settings);
 const notice=document.getElementById('plan-settings-notice');notice.textContent=message;notice.hidden=!message;
 updateSettingsState();await openPlanDialog(settings);
 document.getElementById('plan-settings-content').scrollTop=0;
 focusRequiredSettings(settingsPlan());
}
async function openAutoConditions(checkSetup=false){
 if(worker||preparing||autoApplying||autoOpening)return;autoOpening=true;
 try{
  generateAfterSettings=false;
  await loadAutoDraft();
  autoError();await render(conditions);
  if(checkSetup&&requiredSettings(p)){await openSettings('',false,true);return;}
  await openPlanDialog(conditions);
  document.getElementById('auto-conditions-content').scrollTop=0;
 }finally{autoOpening=false;}
}
async function quickGenerate(){
 if(worker||preparing||autoApplying||autoOpening||quickStarting||settingsSaving)return;
 quickStarting=true;updateQuickState();const entry=generation;
 try{
  await loadAutoDraft();await render();if(entry!==generation)return;
  generateAfterSettings=true;
  if(requiredSettings(p)){await openSettings('',false,true);return;}
  await generate();
 }catch(error){if(entry===generation)generationError('暂时生成不了方案',error.message);
 }finally{quickStarting=false;updateQuickState();}
}
async function saveSettings(){
 if(settingsSaving||!settingsDraft)return false;
 const draftPlan=settingsPlan(),missing=requiredSettings(draftPlan);
 if(missing){
  settingsAttempted=true;await render();
  const notice=document.getElementById('plan-settings-notice');notice.textContent=missing;notice.hidden=false;focusRequiredSettings(draftPlan);return false;
 }
 for(const field of settings.querySelectorAll('input,select'))if(field.willValidate&&!field.validity.valid){const details=field.closest('details');if(details)details.open=true;field.reportValidity();return false;}
 settingsSaving=true;updateSettingsState();settingsError();
 try{
  C.validatePlan(draftPlan,db.courses);
  if(!settingsDirty())return true;
  let accepted=false;
  await U.updatePlan(async latest=>{
   if(JSON.stringify(settingsValues(latest))!==settingsBase){settingsError('设置已在其他页面修改。当前草稿已保留，请载入已保存设置后重新调整。',true);return null;}
   const count=settingsDraft.timeline.count,displaced=latest.items.filter(x=>x.status==='planned'&&x.semester>count);
   if(displaced.length&&!await U.confirmAction(`保存为 ${count} 个学期？`,`${displaced.length} 门课会移到${desktopPlanning?.matches?'第 1 学期':'「待分配」'}，课程和学分都会保留。`,'保存并调整学期'))return null;
   const next=C.validatePlan(settingsPlan(latest),db.courses);accepted=true;return next;
  });
  return accepted;
 }catch(error){settingsError(error.message+'。修改尚未保存，可重试。');return false;}
 finally{settingsSaving=false;updateSettingsState();}
}
function editSettings(el){
 if(!settingsDraft||settingsSaving)return false;
 const basics=['plan-cohort','controls-conditional-status','plan-start-term','plan-semester-count'];
 if(!basics.includes(el.id))return false;
 if(el.id==='plan-cohort'){settingsDraft.cohort=el.value;if(C.cohorts.includes(el.value))settingsDraft.timeline.start=el.value.endsWith('夏季')?'summer':'winter';}
 if(el.id==='controls-conditional-status'){settingsDraft.conditional=el.value==='yes';settingsDraft.conditionalConfirmed=el.value!=='unknown';}
 if(el.id==='plan-start-term')settingsDraft.timeline.start=el.value;
 if(el.id==='plan-semester-count')settingsDraft.timeline.count=Number(el.value);
 settingsError();updateSettingsState();return true;
}
function editAuto(el){
 if(!autoDraft||autoApplying)return false;
 const form=el.form?.id;
 if(form==='planning-preferences'){
  if(['minECTS','maxECTS','minExams','maxExams'].includes(el.name))autoDraft.workload[el.name]=el.value===''?'':Number(el.value);
  else if(el.name==='startSemester')autoDraft.preferences.startSemester=Number(el.value);
  else if(el.name==='language')autoDraft.preferences.languages=['EN','DE'].filter(language=>language===el.value?el.checked:autoDraft.preferences.languages.includes(language));
  else if(['allowUnconfirmed','deadlineException'].includes(el.name))autoDraft.preferences[el.name]=el.checked;
  else return false;
 }else if(form==='semester-workload'){
  if(el.name==='semester'){workloadSemester=Number(el.value);return true;}
  if(!['minECTS','maxECTS','minExams','maxExams'].includes(el.name))return false;
  const bounds=E.bounds(autoPlan(),workloadSemester);autoDraft.workload.semesters[workloadSemester]=Object.fromEntries(['minECTS','maxECTS','minExams','maxExams'].map(key=>[key,key===el.name?(el.value===''?'':Number(el.value)):bounds[key]]));
 }else return false;
 setDefaultFeedback();autoError();return true;
}
box.addEventListener('input',event=>{editSettings(event.target);editAuto(event.target);if(event.target.id==='auto-preference-search'){query=event.target.value;searchAuto();}});
box.addEventListener('change',async event=>{if(editSettings(event.target)||editAuto(event.target))await render();});
box.addEventListener('submit',event=>{if(['planning-preferences','semester-workload'].includes(event.target.id))event.preventDefault();});
box.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;try{
  if(b.hasAttribute('data-auto-preference-mode')){mode=b.dataset.autoPreferenceMode;await render();document.getElementById('auto-preference-tab-'+mode).focus({preventScroll:true});}
  if(b.hasAttribute('data-open-tools'))await openPlanDialog(tools);
  if(b.hasAttribute('data-close-plan-dialog')){const panel=b.closest('dialog');if(panel===settings)await closeSettings();else panel.close();}
  if(b.hasAttribute('data-close-auto-conditions'))await closeAuto();
  if(b.hasAttribute('data-edit-academic')&&!preparing)await openSettings();
  if(b.hasAttribute('data-run-auto'))await generate();
  if(b.hasAttribute('data-open-auto-conditions'))await openAutoConditions(true);
  if(b.hasAttribute('data-undo-quick')&&lastApplied)await undoApplied(lastApplied);
  if(b.hasAttribute('data-reload-auto')&&!autoApplying){if(autoDirty()&&!await U.confirmAction('载入已保存条件？','本次调整将被替换，当前课程安排保持不变。','载入已保存条件'))return;autoDraft=autoValues(await U.plan());autoBase=JSON.stringify(autoDraft);autoError();await render();}
  if(b.hasAttribute('data-reload-settings')){
   if(!settingsSaving&&(!settingsDirty()||await U.confirmAction('载入已保存设置？','当前未保存的调整会被替换，课程记录会保留。','载入设置'))){settingsDraft=null;await openSettings('',false,autoEntrySetup);}
  }
  if(b.hasAttribute('data-finish-settings')){
   if(!await saveSettings())return;
   const runNow=generateAfterSettings;settings.close();settingsDraft=null;settingsBase='';autoEntrySetup=false;await render();if(runNow)await generate();else await openAutoConditions();
  }
  if(b.hasAttribute('data-open-custom')){tools.close();const own=document.getElementById('custom-options');own.open=true;own.querySelector('[name="code"]').focus();own.scrollIntoView({block:'center',behavior:'smooth'});}
  if(b.hasAttribute('data-clear')&&await U.clearPlan()&&U.persisted){tools.close();U.toast('计划已清空，可以重新开始。');}
  if(b.hasAttribute('data-auto-record')&&autoDraft){const code=b.dataset.autoRecord,other=mode==='desired'?'excluded':'desired';autoDraft.preferences[mode]=[...new Set([...autoDraft.preferences[mode],code])];autoDraft.preferences[other]=autoDraft.preferences[other].filter(x=>x!==code);await render();}
  if(b.hasAttribute('data-auto-forget')&&autoDraft){autoDraft.preferences[b.dataset.kind]=autoDraft.preferences[b.dataset.kind].filter(x=>x!==b.dataset.autoForget);await render();}
  if(b.hasAttribute('data-reset-workload')&&autoDraft&&!autoApplying){delete autoDraft.workload.semesters[workloadSemester];setDefaultFeedback();await render();}
  if(b.hasAttribute('data-use-default-conditions'))await applyDefaultConditions();
  if(b.hasAttribute('data-generate'))await quickGenerate();
 }catch(error){U.toast(error.message);}
});
box.addEventListener('keydown',async event=>{
 const tab=event.target.closest('[data-auto-preference-mode]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();mode=event.key==='Home'?'desired':event.key==='End'?'excluded':mode==='desired'?'excluded':'desired';await render();document.getElementById('auto-preference-tab-'+mode).focus({preventScroll:true});
});
for(const panel of [settings,tools,conditions])panel.addEventListener('click',event=>{if(event.target!==panel)return;const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){if(panel===settings)closeSettings();else if(panel===conditions)closeAuto();else panel.close();}});
settings.addEventListener('cancel',event=>{event.preventDefault();closeSettings();});
conditions.addEventListener('cancel',event=>{event.preventDefault();closeAuto();});
window.addEventListener('beforeunload',event=>{if(settingsDirty()||autoDirty()){event.preventDefault();event.returnValue='';}});
function showGenerationError(heading,html,issue=''){
 generationIssue=issue;
 document.getElementById('planning-error-title').textContent=heading;
 result.innerHTML=html;
 dialog.querySelector('[data-edit-auto-settings]').textContent=issue==='remediation-conflict'?'修改学业信息':'调整条件';
 conditions.close();if(!dialog.open)dialog.showModal();result.scrollTop=0;
}
function generationError(heading,message){showGenerationError(heading,`<p>${e(message)}</p>`);}
function remediationConflict(snapshot){
 const item=snapshot.items.find(x=>x.code==='ED140014'),desired=snapshot.preferences.desired.includes('ED140014');
 const places=[item?(item.status==='passed'?'已修记录':'已选课程'):'',desired?'“想选”列表':''].filter(Boolean).join('和');
 const records=(item?`<button type="button" class="button secondary" data-review-remediation="${item.status==='passed'?'passed':'planned'}">${item.status==='passed'?'查看已修记录':'查看已选课程'}</button>`:'')+(desired?'<button type="button" class="button secondary" data-review-remediation="desired">查看想选记录</button>':'');
 return `<p>${places}中有<b>控制理论（ED140014）</b>，但补修设置是<b>“不需要”</b>。</p><p>这里的“补修”指录取通知要求额外修读的课程。请按通知处理：</p><ul><li><b>通知要求补修：</b>点“修改学业信息”，按通知确认补修要求，再生成方案。</li><li><b>通知没有这项要求：</b>${item?.status==='passed'?'这门课已记为已修，请先保留成绩，向 RCI 学业咨询核对归类。':'查看下面的课程记录，取消误加的课程及其“想选”记录，再生成方案。'}</li><li><b>还没核对：</b>先通过右上角关闭说明，继续手动安排，查清录取通知后再修改补修设置。</li></ul><div class="inline-actions">${records}</div><p class="meta"><a class="text-link" href="${U.base}/guides/conditional-control/" target="_blank" rel="noopener noreferrer">不确定是否需要补修？查看说明 ↗</a></p>`;
}
result.addEventListener('click',async event=>{
 const b=event.target.closest('[data-review-remediation]');if(!b)return;
 try{
  const current=await U.plan(),item=current.items.find(x=>x.code==='ED140014');
  dialog.close();
  if(['planned','passed'].includes(b.dataset.reviewRemediation)&&item){
   const card=document.getElementById('plan-course-ED140014');
   if(card){for(let parent=card.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;card.open=true;card.querySelector('summary').focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:'smooth'});return;}
   U.toast('请在看板中核对这门课程的通过状态和通过学期。');return;
  }
  mode='desired';query='ED140014';await openAutoConditions();document.getElementById('auto-course-options').open=true;document.getElementById('auto-preference-search').focus();
 }catch(error){U.toast(error.message);}
});
dialog.querySelector('[data-edit-auto-settings]').addEventListener('click',async()=>{
 const conflict=generationIssue==='remediation-conflict';dialog.close();
 if(conflict){await openSettings('请按录取通知确认补修要求。只有要求修读 ED140014 时，才选“需要”。',true);document.getElementById('controls-conditional-status').focus();}
 else await openAutoConditions();
});
async function generate(){
 if(worker||preparing||autoApplying||!autoDraft)return;
 if(conditions.open)for(const field of conditions.querySelectorAll('input,select'))if(field.willValidate&&!field.validity.valid){const details=field.closest('details');if(details)details.open=true;field.reportValidity();return;}
 preparing=true;updateQuickState();generateAfterSettings=true;
 const run=++generation;
 let snapshot;
 try{snapshot=await U.plan();}
 catch(error){if(run===generation)generationError('暂时生成不了方案',error.message);return;}
 finally{preparing=false;updateQuickState();}
 if(run!==generation)return;
 if(JSON.stringify(autoValues(snapshot))!==autoBase){await openAutoConditions();autoError('自动规划条件已在其他页面修改，请载入已保存条件后重新调整。',true);return;}
 const missing=requiredSettings(snapshot);if(missing){await openSettings(missing,false,true);return;}
 let candidate;try{candidate=C.validatePlan(autoPlan(snapshot),db.courses);}catch(error){await openAutoConditions();autoError(error.message);return;}
 conditions.close();setDefaultFeedback();
 if(typeof Worker==='undefined'){generationError('这个浏览器暂时用不了自动规划','请换一个较新的浏览器，或继续手动排课。');return;}
 let activeWorker;
 try{activeWorker=new Worker(U.base+'/assets/planning-worker.js');}
 catch(error){generationError('暂时生成不了方案',error.message);return;}
 worker=activeWorker;updateQuickState();
 const finish=()=>{if(run!==generation||worker!==activeWorker)return false;clearTimeout(searchTimer);searchTimer=null;activeWorker.terminate();worker=null;updateQuickState();return true;};
 searchTimer=setTimeout(()=>{if(finish())generationError('这次没能算出方案','可以多安排几个学期，或减少固定学期的课程后再试。');},25000);
 activeWorker.onerror=()=>{if(finish())generationError('暂时生成不了方案','请刷新后再试。');};
 activeWorker.onmessage=async event=>{if(!finish())return;const response=event.data;
  if(!response.ok){
   if(response.issue==='remediation-conflict')showGenerationError('先核对补修要求',remediationConflict(candidate),response.issue);
   else showGenerationError(response.exhausted?'本次计算还没找到方案':'还没找到合适的方案',`<ul>${response.reasons.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`);
   return;
  }
  await applyResult(response,snapshot,run);
 };
 try{activeWorker.postMessage({plan:candidate,courses:db.courses,offerings:db.offerings||{}});}
 catch(error){if(finish())generationError('暂时生成不了方案',error.message);}
}
function cancelGeneration(){generation++;clearTimeout(searchTimer);searchTimer=null;worker?.terminate();worker=null;updateQuickState();}
dialog.addEventListener('close',cancelGeneration);
dialog.addEventListener('cancel',event=>{event.preventDefault();closeAuto();});
dialog.querySelector('[data-close-planning-error]').addEventListener('click',()=>closeAuto());
async function undoApplied(change){
 await U.updatePlan(p=>{if(JSON.stringify(p)!==JSON.stringify(change.next))throw new Error('计划后来又改过，不能直接撤销。请手动调整，或从备份恢复。');return change.before;});
 lastApplied=null;await render();if(U.persisted)U.toast('已撤销本次规划。');
}
async function applyResult(response,snapshot,run){
 if(autoApplying||run!==generation)return false;autoApplying=true;updateQuickState();
 try{
  const change={next:response.plan,before:snapshot,result:response},base=JSON.stringify(snapshot);let accepted=false;
  await U.updatePlan(p=>{if(run!==generation)return null;if(JSON.stringify(p)!==base)throw new Error('计划刚刚有变化，请重新规划。');accepted=true;return change.next;});
  if(!accepted)return false;
  autoDraft=null;autoBase='';generateAfterSettings=false;lastApplied=change;await render();
  if(U.persisted)U.toast('已完成规划，课程安排已更新。');
  return true;
 }catch(error){generationError('暂未更新计划',error.message);return false;}
 finally{autoApplying=false;updateQuickState();}
}
window.addEventListener('rci:planchange',()=>{render().catch(error=>U.toast(error.message));});
})();
