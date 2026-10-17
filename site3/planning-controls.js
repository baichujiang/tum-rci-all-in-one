/* Plan actions and on-demand settings. Personal records stay browser-local. MIT. */
(async function(){
'use strict';
const desktopPlanning=window.matchMedia?.('(min-width: 961px)');
const U=window.RCIUI,C=window.RCI,T=window.RCICourseContext,E=window.RCIPlanning,e=C.esc,box=document.getElementById('planning-controls');if(!box)return;
let db,p,query='',mode='passed',worker=null,preparing=false,searchTimer=null,generation=0,preview=null,expected='',original=null,renderId=0,autoIntent=false,fixedSettingsNotice=false,workloadSemester=1,defaultsApplied=false,defaultsFeedbackTimer=null;
let settingsDraft=null,settingsBase='',settingsSaving=false,settingsClosing=false;
const dialog=document.getElementById('auto-plan-dialog'),result=document.getElementById('auto-plan-result');
const settings=document.getElementById('plan-settings-dialog'),preferences=document.getElementById('course-preferences-dialog'),tools=document.getElementById('plan-tools-dialog');
try{db=await U.data();await render();}catch(error){box.innerHTML=`<p class="notice">${e(error.message)}。现有计划没有修改。</p><button type="button" class="button secondary" data-backup-open>备份与恢复</button>`;return;}
function title(code){const own=p.items.find(x=>x.code===code&&x.custom);if(own)return own.name;return db.names[code]||C.courseName(db.courses.find(c=>c.module_code===code))||p.items.find(x=>x.code===code)?.name||code;}
function chips(codes,kind){return codes.length?codes.map(code=>`<span class="preference-chip">${e(title(code))} <small>${e(code)}</small><button class="quiet" type="button" data-forget="${e(code)}" data-kind="${kind}" aria-label="取消${kind==='passed'?'已修':kind==='desired'?'想选':'排除'} ${e(title(code))}">×</button></span>`).join(''):'<p class="meta">尚未添加</p>';}
function fields(value,prefix,keys=['minECTS','maxECTS','minExams','maxExams'],form=''){return [['minECTS','学分下限','ECTS',120,.5],['maxECTS','学分上限','ECTS',120,.5],['minExams','考试数下限','次',50,1],['maxExams','考试数上限','次',50,1]].filter(([key])=>keys.includes(key)).map(([key,label,unit,max,step])=>`<label>${label}<span class="plan-number-control"><input name="${prefix+key}" ${form?`form="${form}"`:''} type="number" min="0" max="${max}" step="${step}" value="${value[key]}" aria-label="${label}（${unit}）" required><span aria-hidden="true">${unit}</span></span></label>`).join('');}
function semesterLabel(number,plan=p){const term=T.term(plan,number);return term.year===null?term.label:`第 ${number} 学期 · ${term.label}`;}
const clone=value=>JSON.parse(JSON.stringify(value));
function settingsValues(plan){return clone({cohort:plan.cohort,conditional:plan.conditional,conditionalConfirmed:plan.conditionalConfirmed,timeline:plan.timeline,workload:plan.workload,preferences:Object.fromEntries(['languages','startSemester','allowUnconfirmed','deadlineException'].map(key=>[key,plan.preferences[key]]))});}
function settingsDirty(){return !!settingsDraft&&JSON.stringify(settingsDraft)!==settingsBase;}
function settingsPlan(latest=p){
 if(!settingsDraft)return latest;
 const draft=clone(settingsDraft),count=draft.timeline.count;
 return {...latest,...draft,preferences:{...latest.preferences,...draft.preferences},items:latest.items.map(x=>x.status==='planned'&&x.semester>count?{...x,semester:desktopPlanning?.matches?1:0}:x)};
}
function settingsError(message='',reload=false){
 document.getElementById('plan-settings-error').hidden=!message;
 document.getElementById('plan-settings-error-message').textContent=message;
 document.getElementById('plan-settings-reload').hidden=!reload;
}
function updateSettingsState(){
 const note=document.getElementById('plan-settings-save-state'),button=settings.querySelector('[data-finish-settings]');
 note.textContent=settingsSaving?'正在保存设置…':settingsDirty()?'有未保存的修改，点击保存后生效。':'所有设置统一在点击保存后生效。';
 document.getElementById('plan-settings-content').inert=settingsSaving;
 button.disabled=settingsSaving;button.textContent=settingsSaving?'正在保存…':autoIntent?'保存并预览':'保存设置';
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
 if(button){button.classList.toggle('is-success',defaultsApplied);button.innerHTML=defaultsApplied?'<span aria-hidden="true">✓</span>已填入默认偏好':'使用默认偏好';}
 if(status)status.textContent=defaultsApplied?'已填入默认偏好，可继续调整，点击保存后生效。':'';
}
function setDefaultFeedback(applied=false){
 clearTimeout(defaultsFeedbackTimer);defaultsFeedbackTimer=null;defaultsApplied=applied;updateDefaultFeedback();
 if(applied)defaultsFeedbackTimer=setTimeout(()=>setDefaultFeedback(),3500);
}
async function applyDefaultConditions(){
 if(worker||preparing||settingsSaving||!settingsDraft)return;
 setDefaultFeedback();
 settingsDraft=settingsValues(defaultConditions(settingsPlan()));
 await render();setDefaultFeedback(true);
}
function settingsHTML(p=settingsPlan()){workloadSemester=Math.min(workloadSemester,p.timeline.count);const defaults=defaultConditions(p),errors=requiredSettingErrors(p);return `
 <section class="settings-default-shortcut" aria-labelledby="settings-default-title"><div><h3 id="settings-default-title">恢复默认偏好</h3><p>每学期最多 ${defaults.workload.maxECTS} ECTS · ${defaults.workload.maxExams} 次考试（估算）· 英语 / 德语</p><small>学业信息需自行确认；已填信息、课程与想选／排除记录保留。从第 ${defaults.preferences.startSemester} 学期开始，清除单学期限制。填入后可继续调整，点击保存才生效。</small></div><button id="plan-use-default-conditions" type="button" class="button secondary" data-use-default-conditions>使用默认偏好</button><span id="plan-default-conditions-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></span></section>
 <section id="plan-options" class="plan-basic-settings plan-settings-card" aria-labelledby="plan-basics-title">
  <div class="settings-section-heading"><span class="settings-section-number" aria-hidden="true">01</span><div><h3 id="plan-basics-title">学业信息</h3></div><span class="settings-save-badge is-draft">保存后生效</span></div>
  <div class="plan-settings-grid">
   <label><span class="settings-field-label">入学时间 <small class="settings-required">必选</small></span><select id="plan-cohort" aria-required="true" ${settingErrorAttrs('plan-cohort',errors)}>${[['unknown','请选择'],...C.cohorts.map(v=>[v,v]),['older','其他时间']].map(([v,t])=>`<option value="${e(v)}" ${p.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select>${settingErrorHTML('plan-cohort',errors)}</label>
   <label>计划学期数<select id="plan-semester-count">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${p.timeline.count===i+1?'selected':''}>${i+1} 个学期</option>`).join('')}</select></label>
   <label>第一学期<select id="plan-start-term" ${settingErrorAttrs('plan-start-term',errors)}><option value="winter" ${p.timeline.start==='winter'?'selected':''}>冬季学期</option><option value="summer" ${p.timeline.start==='summer'?'selected':''}>夏季学期</option></select>${settingErrorHTML('plan-start-term',errors)}</label>
   <label><span class="settings-field-label">录取通知的补修要求 <small class="settings-required">必选</small></span><select id="controls-conditional-status" aria-required="true" ${settingErrorAttrs('controls-conditional-status',errors)}><option value="unknown" ${!p.conditionalConfirmed?'selected':''}>还没确认</option><option value="no" ${p.conditionalConfirmed&&!p.conditional?'selected':''}>不需要</option><option value="yes" ${p.conditionalConfirmed&&p.conditional?'selected':''}>需要</option></select>${settingErrorHTML('controls-conditional-status',errors)}</label>
  </div>
  <div class="settings-basics-foot"><p id="settings-remediation-help" class="meta settings-field-help">入学时间决定适用规则，补修要求请按录取通知填写。</p><p class="settings-pace">120 ECTS ÷ ${p.timeline.count} 学期 <span aria-hidden="true">≈</span> <strong>${Number((120/p.timeline.count).toFixed(1))} ECTS／学期</strong><span>仅作平均参考</span></p></div>
 </section>
 <section id="planning-preference-settings" class="plan-load-settings plan-settings-card" aria-labelledby="plan-load-title">
  <div class="settings-section-heading"><span class="settings-section-number" aria-hidden="true">02</span><div><h3 id="plan-load-title">规划偏好</h3></div><span class="settings-save-badge is-draft">点击底部按钮保存</span></div>
  <form id="planning-preferences">
   <div class="plan-common-fields">${fields(p.workload,'',['maxECTS','maxExams'])}<label>从哪个学期开始规划<select name="startSemester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}" ${p.preferences.startSemester===i+1?'selected':''}>${e(semesterLabel(i+1,p))}</option>`).join('')}</select></label>
   <fieldset class="settings-language-choices"><legend>授课语言 <small>可多选</small></legend><div>${['EN','DE'].map(l=>`<label class="check"><input type="checkbox" name="language" value="${l}" ${p.preferences.languages.includes(l)?'checked':''}><span>${l==='EN'?'英语':'德语'}</span></label>`).join('')}</div></fieldset></div>
   <p class="meta settings-exam-note">考试数为估算：每门课计 1 次，论文和研讨课也计入。</p>
  </form>
 </section>
 <section class="settings-optional" aria-label="更多规划条件">
   <details id="advanced-planning-limits"><summary><span><b>其他排课要求</b><small>最低负担、开课确认与进度要求</small></span><span class="settings-disclosure-arrow" aria-hidden="true">⌄</span></summary><div class="settings-disclosure-body"><div class="load-fields">${fields(p.workload,'',['minECTS','minExams'],'planning-preferences')}</div><p class="meta">填 0 表示不设最低要求。</p>
    <div class="planning-toggle-options">${[
     ['allowUnconfirmed','提前安排尚未公布开课的课程','例如某课通常在冬季开，可先排到明年冬季，之后再确认是否开课。'],
     ['deadlineException','没达到学校进度要求，也继续排课','例如某学期累计学分不足，仍继续排课并提醒你；不代表学校已批准延期。']
    ].map(([key,label,help])=>`<div class="planning-toggle-option"><label class="check"><input name="${key}" form="planning-preferences" type="checkbox" aria-describedby="${key}-help" ${p.preferences[key]?'checked':''}>${label}</label><p id="${key}-help" class="meta">${help}</p></div>`).join('')}</div></div>
   </details>
  <details id="semester-overrides"><summary><span><b>单独设置某个学期${Object.keys(p.workload.semesters).length?`<span class="settings-override-count">${Object.keys(p.workload.semesters).length} 个已设置</span>`:''}</b><small>为实习、论文等学期调整负担</small></span><span class="settings-disclosure-arrow" aria-hidden="true">⌄</span></summary><div class="settings-disclosure-body"><p class="meta">只覆盖所选学期，其他学期沿用上方设置。所有学期的修改一起在底部保存。</p><form id="semester-workload"><label>选择学期<select name="semester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}" ${workloadSemester===i+1?'selected':''}>${e(semesterLabel(i+1,p))}</option>`).join('')}</select></label><div class="load-fields">${fields(E.bounds(p,workloadSemester),'')}</div><div class="inline-actions"><button class="quiet" type="button" data-reset-workload>恢复为统一设置</button></div></form><div class="workload-overrides">${Object.entries(p.workload.semesters).map(([n])=>`<p>第 ${n} 学期：学分 ${E.bounds(p,n).minECTS}–${E.bounds(p,n).maxECTS} ECTS，考试 ${E.bounds(p,n).minExams}–${E.bounds(p,n).maxExams} 次（估算）</p>`).join('')||''}</div></div></details>
 </section>
 `;}
function preferencesHTML(){
 const codes=mode==='passed'?p.items.filter(x=>x.status==='passed').map(x=>x.code):p.preferences[mode];
 return `<div class="preference-modes" role="tablist" aria-label="记录类型">${[['passed','已修课程'],['desired','想选'],['excluded','排除']].map(([key,label])=>`<button id="preference-tab-${key}" type="button" role="tab" aria-selected="${mode===key}" tabindex="${mode===key?0:-1}" aria-controls="preference-panel" data-preference-mode="${key}">${label}<span>${key==='passed'?p.items.filter(x=>x.status==='passed').length:p.preferences[key].length}</span></button>`).join('')}</div>
 <div id="preference-panel" role="tabpanel" aria-labelledby="preference-tab-${mode}"><p class="preference-mode-help">${mode==='passed'?'仅记录已获认可、可计入RCI硕士的已通过课程。':mode==='desired'?'自动方案会尝试包含这些课程；资料或资格未核实的课仍会被阻止。':'自动方案不会补入这些课程；已有已修记录保留。'}</p>
 <label class="preference-search-label" for="preference-search">搜索课程</label><input id="preference-search" type="search" value="${e(query)}" placeholder="输入课程名或代码，如 IN2064" maxlength="160" autocomplete="off">
 <div id="preference-results" class="preference-results" aria-live="polite"></div>
 <section class="preference-selections"><h3>${mode==='passed'?'已修通过':mode==='desired'?'已设为想选':'已排除'} <small>更改后自动保存</small></h3>${chips(codes,mode)}</section></div>`;
}
async function render(){
 const id=++renderId;p=await U.plan();if(id!==renderId)return;
 const detailState=[...box.querySelectorAll('details[id]')].map(x=>[x.id,x.open]);
 if(settingsDraft&&!settingsSaving&&JSON.stringify(settingsValues(p))!==settingsBase){
  if(!settingsDirty()){settingsDraft=settingsValues(p);settingsBase=JSON.stringify(settingsDraft);}
  else settingsError('设置已在其他页面修改。当前草稿已保留，请载入已保存设置后重新调整。',true);
 }
 const active=document.activeElement,focus=active?.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:active?.form?.id&&active.name?{form:active.form.id,name:active.name,value:active.value}:null;
 const calc=C.calculate(p,db.courses,true);
 document.getElementById('plan-context').innerHTML=`<button id="plan-open-settings" type="button" class="plan-context-button" data-open-settings aria-haspopup="dialog">${e(p.cohort==='unknown'?'选择入学时间':p.cohort==='older'?'其他入学时间':p.cohort)} · ${p.timeline.count} 个学期 <span class="context-edit">设置</span></button><span class="context-divider" aria-hidden="true"></span><button id="plan-open-passed" type="button" class="plan-context-button" data-open-preferences="passed" aria-haspopup="dialog">已修 ${calc.allocated} ECTS</button><button id="plan-open-preferences" type="button" class="plan-context-button" data-open-preferences="desired" aria-haspopup="dialog">选课偏好${p.preferences.desired.length+p.preferences.excluded.length?' · '+(p.preferences.desired.length+p.preferences.excluded.length):''}</button><span class="plan-save-state${U.persisted?'':' is-temporary'}">${U.persisted?'自动保存在此浏览器':'仅本页有效，请导出备份'}</span>`;
 document.getElementById('plan-add-course').dataset.pickSemester=String(desktopPlanning?.matches?1:p.preferences.startSemester);
 document.getElementById('plan-settings-content').innerHTML=settingsHTML();
 updateDefaultFeedback();updateSettingsState();
 document.getElementById('course-preferences-content').innerHTML=preferencesHTML();
 if(autoIntent&&settings.open&&!fixedSettingsNotice){const notice=document.getElementById('plan-settings-notice'),message=requiredSettings(settingsPlan());notice.textContent=message;notice.hidden=!message;}
 box.querySelector('[data-clear-area]').hidden=!p.items.length;
 for(const [key,isOpen] of detailState){const el=document.getElementById(key);if(el)el.open=isOpen;}
 search();
 if(focus){const el=focus.id?document.getElementById(focus.id):[...(document.getElementById(focus.form)?.elements||[])].find(x=>x.name===focus.name&&(x.type!=='checkbox'||x.value===focus.value));if(el?.focus){el.focus({preventScroll:true});if(focus.id&&el.type==='search'&&Number.isInteger(focus.start))el.setSelectionRange(focus.start,focus.end);}}
}
function search(){
 const docs=db.courses.map(c=>({id:c.module_code,code:c.module_code,title:C.courseName(c),summary:db.names[c.module_code]||'',aliases:[c.module_code,db.names[c.module_code]||''],body:c.section_2025,tasks:['study'],kind:'course',course:c}));
 const list=window.RCISearch.search(docs,query,db.synonyms||[]).slice(0,query?20:6).map(d=>d.course);
 document.getElementById('preference-results').innerHTML=list.map(c=>{const own=p.items.find(x=>x.code===c.module_code&&x.custom),shown=own?{...c,ects:own.ects,allowed_groups:[own.group]}:c;const already=mode==='passed'?p.items.some(x=>x.code===c.module_code&&x.status==='passed'):p.preferences[mode].includes(c.module_code);return `<div class="preference-result"><span><b>${e(C.courseName(c))}</b><small>${e(c.module_code)} · ${shown.ects} ECTS${db.names[c.module_code]?' · '+e(db.names[c.module_code]):''}</small>${own?'<small>保留原有自录认定；学分与归类需个人核对。</small>':c.recommendation_note?`<small>${e(c.recommendation_note)}</small>`:''}</span><button class="quiet" type="button" data-record="${e(c.module_code)}" ${already||mode==='passed'&&!Number.isFinite(Number(shown.ects))?'disabled':''}>${mode==='passed'&&!Number.isFinite(Number(shown.ects))?'学分待核实':already?'已记录':mode==='passed'?'记为已修':mode==='desired'?'想选 ＋':'排除 ＋'}</button></div>`;}).join('')||'<p class="meta">未找到。目录外课程可从「更多」中自行录入，认定需学校确认。</p>';
}
async function closeSettings(){
 if(settingsSaving||settingsClosing)return false;
 settingsClosing=true;
 try{
  if(settingsDirty()&&!await U.confirmAction('放弃未保存的设置？','本次修改还未生效，关闭后将保留原来的设置。','放弃修改'))return false;
  settings.close();return true;
 }finally{settingsClosing=false;}
}
async function openPlanDialog(target){
 for(const other of [settings,preferences,tools])if(other!==target&&other.open){if(other===settings){if(!await closeSettings())return false;}else other.close();}
 if(!target.open)target.showModal();return true;
}
function focusRequiredSettings(plan){
 const required=Object.keys(requiredSettingErrors(plan)).find(key=>autoIntent||plan.cohort!=='older'||key!=='plan-cohort');
 if(required){const field=document.getElementById(required);field.focus({preventScroll:true});field.scrollIntoView({block:'nearest'});}
}
async function openSettings(forAuto=false,message='',fixedNotice=false){
 if(!settingsDraft){settingsDraft=settingsValues(await U.plan());settingsBase=JSON.stringify(settingsDraft);settingsError();}
 autoIntent=forAuto;fixedSettingsNotice=fixedNotice;await render();
 const notice=document.getElementById('plan-settings-notice');notice.textContent=message;notice.hidden=!message;
 document.getElementById('plan-settings-title').textContent=forAuto?'调整规划条件':'计划设置';
 updateSettingsState();await openPlanDialog(settings);
 document.getElementById('plan-settings-content').scrollTop=0;
 if(forAuto)focusRequiredSettings(settingsPlan());
}
async function saveSettings(){
 if(settingsSaving||!settingsDraft)return false;
 const draftPlan=settingsPlan(),missing=requiredSettings(draftPlan);
 if(missing&&(autoIntent||draftPlan.cohort!=='older'||!draftPlan.conditionalConfirmed)){
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
 const basics={'plan-cohort':'cohort','controls-conditional-status':'conditional','plan-start-term':'start','plan-semester-count':'count'},form=el.form?.id;
 if(el.id in basics){
  if(el.id==='plan-cohort'){settingsDraft.cohort=el.value;if(C.cohorts.includes(el.value))settingsDraft.timeline.start=el.value.endsWith('夏季')?'summer':'winter';}
  if(el.id==='controls-conditional-status'){settingsDraft.conditional=el.value==='yes';settingsDraft.conditionalConfirmed=el.value!=='unknown';}
  if(el.id==='plan-start-term')settingsDraft.timeline.start=el.value;
  if(el.id==='plan-semester-count'){settingsDraft.timeline.count=Number(el.value);settingsDraft.preferences.startSemester=Math.min(settingsDraft.preferences.startSemester,Number(el.value));workloadSemester=Math.min(workloadSemester,Number(el.value));}
 }else if(form==='planning-preferences'){
  if(['minECTS','maxECTS','minExams','maxExams'].includes(el.name))settingsDraft.workload[el.name]=el.value===''?'':Number(el.value);
  if(el.name==='startSemester')settingsDraft.preferences.startSemester=Number(el.value);
  if(el.name==='language')settingsDraft.preferences.languages=['EN','DE'].filter(language=>language===el.value?el.checked:settingsDraft.preferences.languages.includes(language));
  if(['allowUnconfirmed','deadlineException'].includes(el.name))settingsDraft.preferences[el.name]=el.checked;
 }else if(form==='semester-workload'){
  if(el.name==='semester'){workloadSemester=Number(el.value);return true;}
  if(['minECTS','maxECTS','minExams','maxExams'].includes(el.name)){const bounds=E.bounds(settingsPlan(),workloadSemester);settingsDraft.workload.semesters[workloadSemester]=Object.fromEntries(['minECTS','maxECTS','minExams','maxExams'].map(key=>[key,key===el.name?(el.value===''?'':Number(el.value)):bounds[key]]));}
 }else return false;
 setDefaultFeedback();settingsError();updateSettingsState();return true;
}
box.addEventListener('input',event=>{editSettings(event.target);if(event.target.id==='preference-search'){query=event.target.value;search();}});
box.addEventListener('change',async event=>{if(editSettings(event.target))await render();});
box.addEventListener('submit',event=>{if(['planning-preferences','semester-workload'].includes(event.target.id))event.preventDefault();});
box.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;try{
  if(b.hasAttribute('data-open-settings'))await openSettings();
  if(b.hasAttribute('data-open-preferences')){mode=b.dataset.openPreferences;query='';await render();if(!await openPlanDialog(preferences))return;document.getElementById('preference-search').focus({preventScroll:true});}
  if(b.hasAttribute('data-preference-mode')){mode=b.dataset.preferenceMode;await render();document.getElementById('preference-tab-'+mode).focus({preventScroll:true});}
  if(b.hasAttribute('data-open-tools'))await openPlanDialog(tools);
  if(b.hasAttribute('data-close-plan-dialog')){const panel=b.closest('dialog');if(panel===settings)await closeSettings();else panel.close();}
  if(b.hasAttribute('data-reload-settings')){
   if(!settingsSaving&&(!settingsDirty()||await U.confirmAction('载入已保存设置？','当前未保存的调整会被替换，课程记录会保留。','载入设置'))){settingsDraft=null;await openSettings(autoIntent);}
  }
  if(b.hasAttribute('data-finish-settings')){
   if(!await saveSettings())return;
   const generateNext=autoIntent;settings.close();await render();if(generateNext)await generate();else U.toast('设置已保存。');
  }
  if(b.hasAttribute('data-open-custom')){tools.close();const own=document.getElementById('custom-options');own.open=true;own.querySelector('[name="code"]').focus();own.scrollIntoView({block:'center',behavior:'smooth'});}
  if(b.hasAttribute('data-clear')&&await U.clearPlan()&&U.persisted){tools.close();U.toast('计划已清空，可以重新开始。');}
  if(b.hasAttribute('data-record')){
   const code=b.dataset.record;
   await U.updatePlan(p=>{
    if(mode!=='passed')return {...p,preferences:{...p.preferences,[mode]:[...new Set([...p.preferences[mode],code])]}};
    const opposite=code==='IN2067'?'ED160028':code==='ED160028'?'IN2067':null;
    if(p.items.some(x=>x.code===opposite))throw new Error('Robotics 与 Roboterdynamik 二选一，请先核对已有课程。');
    return {...p,items:[...p.items.filter(x=>x.code!==code),{...(p.items.find(x=>x.code===code)||{code,semester:0}),status:'passed',locked:false}]};
   });U.toast('已记录；学分统计已更新。');
  }
  if(b.hasAttribute('data-forget'))await U.updatePlan(p=>b.dataset.kind==='passed'?{...p,items:p.items.map(x=>x.code===b.dataset.forget?{...x,status:'planned',locked:false,semester:desktopPlanning?.matches&&x.semester>0&&x.semester<=p.timeline.count?x.semester:desktopPlanning?.matches?1:0}:x)}:{...p,preferences:{...p.preferences,[b.dataset.kind]:p.preferences[b.dataset.kind].filter(c=>c!==b.dataset.forget)}});
  if(b.hasAttribute('data-reset-workload')&&settingsDraft&&!settingsSaving){delete settingsDraft.workload.semesters[workloadSemester];setDefaultFeedback();await render();}
  if(b.hasAttribute('data-use-default-conditions'))await applyDefaultConditions();
  if(b.hasAttribute('data-generate'))await generate();
 }catch(error){U.toast(error.message);}
});
box.addEventListener('keydown',async event=>{
 const tab=event.target.closest('[data-preference-mode]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();const modes=['passed','desired','excluded'],index=modes.indexOf(mode);
 mode=event.key==='Home'?modes[0]:event.key==='End'?modes[2]:modes[(index+(event.key==='ArrowRight'?1:2))%3];await render();document.getElementById('preference-tab-'+mode).focus({preventScroll:true});
});
for(const panel of [settings,preferences,tools])panel.addEventListener('click',event=>{if(event.target!==panel)return;const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){if(panel===settings)closeSettings();else panel.close();}});
settings.addEventListener('cancel',event=>{event.preventDefault();closeSettings();});
settings.addEventListener('close',()=>{settingsDraft=null;settingsBase='';settingsError();setDefaultFeedback();});
window.addEventListener('beforeunload',event=>{if(settingsDirty()){event.preventDefault();event.returnValue='';}});
function previewActions(ready=false,failed=false){
 const edit=dialog.querySelector('[data-edit-auto-settings]');
 edit.textContent='返回调整条件';edit.classList.toggle('secondary',!failed);
 dialog.querySelector('[data-apply-auto]').hidden=!ready;
}
function autoHeading(title,description){
 document.getElementById('auto-plan-title').textContent=title;
 document.getElementById('auto-plan-description').textContent=description;
}
function previewState(heading,content,loading=false){return `<section class="auto-preview-state${loading?' is-loading':''}"${loading?' role="status"':''}>${loading?'<span class="auto-preview-spinner" aria-hidden="true"></span>':''}<h3>${e(heading)}</h3>${content}</section>`;}
function previewHTML(r){
 const known=new Map(db.courses.map(c=>[c.module_code,c])),credits=x=>Number(x.custom?x.ects:known.get(x.code)?.ects??x.ects),schedule=C.schedule(r.plan,db.courses);
 const future=r.plan.items.filter(x=>x.status==='planned'),removed=r.removed||[];
 return `<section class="auto-preview-overview" aria-labelledby="auto-overview-title">
  <div class="settings-section-heading"><span class="settings-section-number" aria-hidden="true">01</span><div><h3 id="auto-overview-title">方案概览</h3></div><span class="auto-preview-draft">待采用</span></div>
  <div class="auto-preview-metrics"><div><span>规划学分</span><strong>${r.calculation.allocated}<small> / 120 ECTS</small></strong><p>已修 ${r.passed.allocated} ECTS · 待修 ${future.reduce((sum,x)=>sum+credits(x),0)} ECTS</p></div><div><span>预计完成</span><strong>第 ${r.finish} 学期</strong><p>${e(T.term(r.plan,r.finish).label)}</p></div><div><span>课程变动</span><strong>新增 ${r.added.length} 门</strong><p class="auto-preview-change-counts"><span>调整学期 ${r.moved.length} 门</span><span>移除 ${removed.length} 门</span></p></div></div>
  ${removed.length?`<p class="auto-preview-removals">移除已排除的选修：${removed.map(title).map(e).join('、')}。</p>`:''}
 </section>
 <section class="auto-preview-arrangement" aria-labelledby="auto-arrangement-title"><div class="auto-preview-section-heading"><span class="settings-section-number" aria-hidden="true">02</span><h3 id="auto-arrangement-title">学期安排</h3><span>仅展示待修课程</span></div>
 <div class="auto-preview-semesters">${schedule.semesters.filter(n=>n.number<=r.finish).map(n=>`<section class="auto-preview-semester" aria-labelledby="auto-semester-${n.number}"><header><div><h4 id="auto-semester-${n.number}">第 ${n.number} 学期</h4><p>${e(T.term(r.plan,n.number).label)}</p></div><span class="auto-semester-credits">${n.credits} <small>ECTS</small></span></header><p class="auto-semester-load">${n.items.length} 门课程 · 估算 ${n.items.length} 次考试</p><ul>${n.items.map(x=>`<li><div class="auto-preview-course"><b>${e(x.custom?x.name:title(x.code))}</b><div><span class="auto-course-code">${e(x.code)}</span>${x.group?`<span>计入 ${e(x.group)}</span>`:''}${r.added.includes(x.code)?'<span class="auto-course-change">新增</span>':r.moved.includes(x.code)?'<span class="auto-course-change">调整学期</span>':''}${x.locked?'<span class="auto-course-locked">固定学期</span>':''}</div></div><span class="auto-course-credits">${credits(x)} <small>ECTS</small></span></li>`).join('')||'<li class="auto-preview-empty">本学期没有待修课程</li>'}</ul></section>`).join('')}</div></section>
 ${r.warnings.length?`<details class="auto-preview-warnings" open><summary><span><b>采用前请确认</b><small>课程要求、开课与报名事项</small></span><span class="auto-warning-count">${r.warnings.length} 条提示 <span class="settings-disclosure-arrow" aria-hidden="true">⌄</span></span></summary><ul>${r.warnings.map(x=>`<li>${e(x)}</li>`).join('')}</ul></details>`:''}
 <div class="auto-preview-footnote"><p>实际开课、名额、课表和考试报名，请到 TUMonline 确认。每门课按 1 次考试估算，论文和研讨课也计入。</p><p>会尽量早点排完，但不保证是最快的方案。采用后可立即撤销。</p></div>`;
}
function remediationConflict(snapshot){
 const item=snapshot.items.find(x=>x.code==='ED140014'),desired=snapshot.preferences.desired.includes('ED140014');
 const places=[item?(item.status==='passed'?'已修记录':'已选课程'):'',desired?'“想选”列表':''].filter(Boolean).join('和');
 const records=(item?`<button type="button" class="button secondary" data-review-remediation="${item.status==='passed'?'passed':'planned'}">${item.status==='passed'?'查看已修记录':'查看已选课程'}</button>`:'')+(desired?'<button type="button" class="button secondary" data-review-remediation="desired">查看想选记录</button>':'');
 return `<p>${places}中有<b>控制理论（ED140014）</b>，但补修设置是<b>“不需要”</b>。</p><p>这里的“补修”指录取通知要求额外修读的课程。请按通知处理：</p><ul><li><b>通知要求补修：</b>点“返回调整条件”，选择“需要”，再生成方案。</li><li><b>通知没有这项要求：</b>${item?.status==='passed'?'这门课已记为已修，请先保留成绩，向 RCI 学业咨询核对归类。':'查看下面的课程记录，取消误加的课程及其“想选”记录，再生成方案。'}</li><li><b>还没核对：</b>先通过右上角关闭预览，继续手动安排，查清录取通知后再修改补修设置。</li></ul><div class="inline-actions">${records}</div><p class="meta"><a class="text-link" href="${U.base}/guides/conditional-control/" target="_blank" rel="noopener noreferrer">不确定是否需要补修？查看说明 ↗</a></p>`;
}
result.addEventListener('click',async event=>{
 const b=event.target.closest('[data-review-remediation]');if(!b)return;
 try{
  const current=await U.plan(),item=current.items.find(x=>x.code==='ED140014');
  dialog.close();
  if(b.dataset.reviewRemediation==='planned'&&item?.status==='planned'){
   const card=document.getElementById('plan-course-ED140014');
   if(card){card.open=true;card.querySelector('summary').focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:'smooth'});return;}
  }
  mode=b.dataset.reviewRemediation==='passed'?'passed':'desired';
  query='ED140014';await render();if(!await openPlanDialog(preferences))return;document.getElementById('preference-search').focus();
 }catch(error){U.toast(error.message);}
});
dialog.querySelector('[data-edit-auto-settings]').addEventListener('click',async()=>{
 const conflict=preview?.issue==='remediation-conflict';
 dialog.close();await openSettings(true,conflict?'请按录取通知确认补修要求。只有要求修读 ED140014 时，才选“需要”。':'',!!conflict);
 if(conflict)document.getElementById('controls-conditional-status').focus();
});
async function generate(){
 if(worker||preparing)return;
 preparing=true;
 const run=++generation;
 let snapshot;try{snapshot=await U.plan();}finally{preparing=false;}
 if(run!==generation)return;
 const missing=requiredSettings(snapshot);if(missing){await openSettings(true,missing);return;}
 original=snapshot;expected=JSON.stringify(original);preview=null;
 autoHeading('自动方案预览','先查看安排，采用后才会更新计划。');
 previewActions();
 result.innerHTML=previewState('正在检查课程和学分','<p>正在安排各学期，请稍候。原计划尚未改动。</p>',true);dialog.querySelector('[data-apply-auto]').hidden=true;dialog.showModal();result.scrollTop=0;
 if(typeof Worker==='undefined'){previewActions(false,true);result.innerHTML=previewState('这个浏览器暂时用不了自动规划','<p>请换一个较新的浏览器，或继续手动排课。原计划没有改动。</p>');return;}
 const activeWorker=new Worker(U.base+'/assets/planning-worker.js');worker=activeWorker;
 const finish=()=>{if(run!==generation)return false;clearTimeout(searchTimer);searchTimer=null;activeWorker.terminate();worker=null;return true;};
 searchTimer=setTimeout(()=>{if(!finish())return;previewActions(false,true);result.innerHTML=previewState('这次没能算出方案','<p>原计划没有改动。可以多安排几个学期，或减少固定学期的课程后再试。</p>');},25000);
 activeWorker.onerror=()=>{if(!finish())return;previewActions(false,true);result.innerHTML=previewState('暂时生成不了方案','<p>请刷新后再试。原计划没有改动。</p>');};
 activeWorker.onmessage=event=>{if(!finish())return;const r=event.data;preview=r;
  if(!r.ok){
   previewActions(false,true);
   if(r.issue==='remediation-conflict'){
    autoHeading('先核对补修要求','现有计划没有修改。');
    result.innerHTML=`<section class="auto-preview-state auto-preview-conflict">${remediationConflict(original)}</section>`;
   }else{
    autoHeading('还没找到合适的方案','原计划没有改动。');
    result.innerHTML=previewState('可以试着调整规划条件',`<ul>${r.reasons.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`);
   }
   return;
  }
  result.innerHTML=previewHTML(r);result.scrollTop=0;
  previewActions(true);
 };
 activeWorker.postMessage({plan:original,courses:db.courses,offerings:db.offerings||{}});
}
dialog.addEventListener('close',()=>{generation++;clearTimeout(searchTimer);searchTimer=null;worker?.terminate();worker=null;});
dialog.querySelector('[data-cancel-auto]').addEventListener('click',()=>dialog.close());
dialog.querySelector('[data-apply-auto]').addEventListener('click',async()=>{try{
 if(!preview?.ok)return;const next=preview.plan,before=original;
 await U.updatePlan(p=>{if(JSON.stringify(p)!==expected)throw new Error('计划刚刚有变化，请重新生成预览。');return next;});dialog.close();
 if(U.persisted)U.toast('已按这个方案更新课程安排。',{label:'撤销',run:()=>U.updatePlan(p=>{if(JSON.stringify(p)!==JSON.stringify(next))throw new Error('计划后来又改过，不能直接撤销。请手动调整，或从备份恢复。');return before;})});
 }catch(error){U.toast(error.message);}});
window.addEventListener('rci:planchange',()=>{render().catch(error=>U.toast(error.message));});
})();
