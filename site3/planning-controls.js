/* Plan actions and on-demand settings. Personal records stay browser-local. MIT. */
(async function(){
'use strict';
const desktopPlanning=window.matchMedia?.('(min-width: 961px)');
const U=window.RCIUI,C=window.RCI,T=window.RCICourseContext,E=window.RCIPlanning,e=C.esc,box=document.getElementById('planning-controls');if(!box)return;
let db,p,query='',mode='passed',worker=null,preparing=false,searchTimer=null,generation=0,preview=null,expected='',original=null,renderId=0,autoIntent=false;
const dialog=document.getElementById('auto-plan-dialog'),result=document.getElementById('auto-plan-result');
const settings=document.getElementById('plan-settings-dialog'),preferences=document.getElementById('course-preferences-dialog'),tools=document.getElementById('plan-tools-dialog');
const dirtyForms=new Set();
try{db=await U.data();await render();}catch(error){box.innerHTML=`<p class="notice">${e(error.message)}。现有计划没有修改。</p><button type="button" class="button secondary" data-backup-open>备份与恢复</button>`;return;}
function title(code){const own=p.items.find(x=>x.code===code&&x.custom);if(own)return own.name;return db.names[code]||C.courseName(db.courses.find(c=>c.module_code===code))||p.items.find(x=>x.code===code)?.name||code;}
function chips(codes,kind){return codes.length?codes.map(code=>`<span class="preference-chip">${e(title(code))} <small>${e(code)}</small><button class="quiet" type="button" data-forget="${e(code)}" data-kind="${kind}" aria-label="取消${kind==='passed'?'已修':kind==='desired'?'想选':'排除'} ${e(title(code))}">×</button></span>`).join(''):'<p class="meta">尚未添加</p>';}
function fields(value,prefix,keys=['minECTS','maxECTS','minExams','maxExams']){return [['minECTS','最少修多少学分（ECTS）',120,.5],['maxECTS','最多修多少学分（ECTS）',120,.5],['minExams','最少几次考试',50,1],['maxExams','最多几次考试',50,1]].filter(([key])=>keys.includes(key)).map(([key,label,max,step])=>`<label>${label}<input name="${prefix+key}" type="number" min="0" max="${max}" step="${step}" value="${value[key]}" required></label>`).join('');}
function semesterLabel(number){const term=T.term(p,number);return term.year===null?term.label:`第 ${number} 学期 · ${term.label}`;}
function settingsHTML(){return `
 <section id="plan-options" class="plan-basic-settings" aria-labelledby="plan-basics-title">
  <h3 id="plan-basics-title">学业信息 <small class="meta">自动保存</small></h3>
  <div class="plan-settings-grid">
   <label>入学时间<select id="plan-cohort">${[['unknown','请选择'],...C.cohorts.map(v=>[v,v]),['older','其他时间']].map(([v,t])=>`<option value="${e(v)}" ${p.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select></label>
   <label>一共读几个学期<select id="plan-semester-count">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${p.timeline.count===i+1?'selected':''}>${i+1} 个学期</option>`).join('')}</select></label>
   <label>第一学期<select id="plan-start-term"><option value="winter" ${p.timeline.start==='winter'?'selected':''}>冬季学期</option><option value="summer" ${p.timeline.start==='summer'?'selected':''}>夏季学期</option></select></label>
   <label>录取通知要求补修吗<select id="controls-conditional-status"><option value="unknown" ${!p.conditionalConfirmed?'selected':''}>还没确认</option><option value="no" ${p.conditionalConfirmed&&!p.conditional?'selected':''}>不需要</option><option value="yes" ${p.conditionalConfirmed&&p.conditional?'selected':''}>需要</option></select></label>
  </div>
  <p class="meta">共 120 ECTS，平均每学期 ${Number((120/p.timeline.count).toFixed(1))} ECTS。</p>
  ${p.cohort==='older'?'<p class="meta">这个入学时间暂不支持自动规划，可以继续手动排课。</p>':''}
 </section>
 <section id="planning-preference-settings" class="plan-load-settings" aria-labelledby="plan-load-title">
  <h3 id="plan-load-title">每学期怎么安排</h3>
  <form id="planning-preferences">
   <div class="load-fields">${fields(p.workload,'',['maxECTS','maxExams'])}</div>
   <p class="meta">每门课按 1 次考试估算，论文和研讨课也算。</p>
   <div class="plan-settings-grid plan-language-settings"><label>从第几学期开始排课<select name="startSemester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}" ${p.preferences.startSemester===i+1?'selected':''}>${e(semesterLabel(i+1))}</option>`).join('')}</select></label>
   <fieldset><legend>上课用什么语言</legend>${['EN','DE'].map(l=>`<label class="check"><input type="checkbox" name="language" value="${l}" ${p.preferences.languages.includes(l)?'checked':''}>${l==='EN'?'英语':'德语'}</label>`).join('')}</fieldset></div>
   <details id="advanced-planning-limits"><summary>其他排课要求</summary><div class="load-fields">${fields(p.workload,'',['minECTS','minExams'])}</div><p class="meta">填 0 表示不设最低要求。</p>
    <div class="planning-toggle-options">${[
     ['allowUnconfirmed','提前安排尚未公布开课的课程','例如某课通常在冬季开，可先排到明年冬季，之后再确认是否开课。'],
     ['deadlineException','没达到学校进度要求，也继续排课','例如某学期累计学分不足，仍继续排课并提醒你；不代表学校已批准延期。']
    ].map(([key,label,help])=>`<div class="planning-toggle-option"><label class="check"><input name="${key}" type="checkbox" aria-describedby="${key}-help" ${p.preferences[key]?'checked':''}>${label}</label><p id="${key}-help" class="meta">${help}</p></div>`).join('')}</div>
   </details>
  </form>
  <details id="semester-overrides"><summary>单独设置某个学期</summary><form id="semester-workload"><label>要调整哪个学期<select name="semester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}">${e(semesterLabel(i+1))}</option>`).join('')}</select></label><div class="load-fields">${fields(E.bounds(p,1),'')}</div><div class="inline-actions"><button class="button secondary" type="submit">保存这个学期</button><button class="quiet" type="button" data-reset-workload>使用上面的设置</button></div></form><div class="workload-overrides">${Object.entries(p.workload.semesters).map(([n])=>`<p>第 ${n} 学期：学分 ${E.bounds(p,n).minECTS}–${E.bounds(p,n).maxECTS} ECTS，考试 ${E.bounds(p,n).minExams}–${E.bounds(p,n).maxExams} 次（估算）</p>`).join('')||''}</div></details>
 </section>
 <button class="quiet plan-rules-link" type="button" data-open-planning-rules aria-haspopup="dialog">规划说明 <span aria-hidden="true">›</span></button>`;}
function rulesHTML(){return `
 <p class="plan-rules-intro">实际开课、名额和考试报名，请到 TUMonline 确认。</p>
 <ul class="plan-rules-highlights"><li>已经通过的课不会重新安排。</li><li>你固定了学期的课，不会被挪走。</li><li>先看预览，点击“采用这个方案”后才会改动计划。</li></ul>
 <details id="planning-credit-rules"><summary>毕业需要多少学分</summary><p>共 120 ECTS：</p><ul class="plan-rules-list"><li>必修课（A–E）：43 ECTS。</li><li>硕士论文（F）：30 ECTS。</li><li>专业选修（G/H/I）：共 41 ECTS，每类至少 5 ECTS。</li><li>跨学科课程（J）：至少 6 ECTS。</li></ul><p>2025/26 冬季及以后入学，且录取通知要求补修 ED140014 的同学：补修计 5 ECTS（K），专业选修改为 36 ECTS，G/H/I 每类仍至少 5 ECTS。更早入学的同学不适用这个调整。</p><p>一门课只能算一次。本科已经计过学分的限选或选修课，不能在硕士阶段重新选。其他课程能否认定，以学校答复为准。</p></details>
 <details id="planning-deadline-rules"><summary>每学期要达到什么进度</summary><ul class="plan-rules-list"><li>第 2 学期结束前：通过 A/B/C 中至少一门课。</li><li>第 3 学期结束前：累计通过至少 30 ECTS。</li><li>第 4 学期结束前：累计通过至少 60 ECTS。</li><li>第 5 学期结束前：累计通过至少 90 ECTS。</li><li>第 6 学期结束前：累计通过至少 120 ECTS。</li></ul><p>论文通常最后完成，从正式出题起最多六个月。提前开题、延期或暂停计时，都需要学校批准。</p><p>补考、考试不通过后的处理和个人截止日期，以学校记录为准。</p></details>
 <details id="planning-catalog-rules"><summary>自动排课时要注意什么</summary><ul class="plan-rules-list"><li>资料不全、开课时间不明，或还需确认导师和个人资格的课，需要自行核对后手动添加。</li><li>课程要求的知识基础会显示在预览里，请确认自己是否具备。</li><li>课程标有两种授课语言时，要再确认实际用哪种语言上课。</li><li>研讨课、实验课排进计划后，还需要自己选课题和申请名额。</li><li>设为“排除”的选修课，如果没有固定学期，会从方案里移除；其他已选课程保留。</li></ul><p>计入跨学科（J）的语言课合计最多 6 ECTS；德语至少 C1.2，硕士英语须 C2。目前不自动加入语言课，能否计入还需确认个人资格。</p><p>自动排课会尽量早点排完，但不保证是最快的方案。排进计划不等于报名成功，也不代表学校已经批准毕业。</p></details>
 <details id="planning-rule-audit"><summary>查看学校原文</summary>
  <p class="meta">2024 夏季至 2025 夏季入学使用 2024 版学分规则；2025/26 冬季起还适用 2025 年修订。资料核对：${e(db.rules?.checkedOn||'2026-10-15')}，仍待人工复查。</p>
  <div class="inline-actions">${(db.rules?.sources||[]).map(s=>`<a class="text-link" href="${e(C.safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${e(s.title)} ↗</a>`).join('')}</div>
 </details>`;}
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
 const drafts=[...box.querySelectorAll('form')].filter(f=>dirtyForms.has(f.id)).map(f=>[f.id,[...f.elements].filter(x=>x.name).map(x=>({name:x.name,value:x.value,checked:x.checked,type:x.type}))]);
 const active=document.activeElement,focus=active?.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:active?.form?.id&&active.name?{form:active.form.id,name:active.name,value:active.value}:null;
 const calc=C.calculate(p,db.courses,true);
 document.getElementById('plan-context').innerHTML=`<button id="plan-open-settings" type="button" class="plan-context-button" data-open-settings aria-haspopup="dialog">${e(p.cohort==='unknown'?'选择入学时间':p.cohort==='older'?'其他入学时间':p.cohort)} · ${p.timeline.count} 个学期 <span class="context-edit">设置</span></button><span class="context-divider" aria-hidden="true"></span><button id="plan-open-passed" type="button" class="plan-context-button" data-open-preferences="passed" aria-haspopup="dialog">已修 ${calc.allocated} ECTS</button><button id="plan-open-preferences" type="button" class="plan-context-button" data-open-preferences="desired" aria-haspopup="dialog">选课偏好${p.preferences.desired.length+p.preferences.excluded.length?' · '+(p.preferences.desired.length+p.preferences.excluded.length):''}</button><button type="button" class="plan-context-button desktop-only" data-open-study aria-haspopup="dialog" aria-controls="plan-study-dialog">选课与学分说明</button><span class="plan-save-state${U.persisted?'':' is-temporary'}">${U.persisted?'自动保存在此浏览器':'仅本页有效，请导出备份'}</span>`;
 document.getElementById('plan-add-course').dataset.pickSemester=String(desktopPlanning?.matches?1:p.preferences.startSemester);
 document.getElementById('plan-settings-content').innerHTML=settingsHTML();
 document.getElementById('planning-rules-content').innerHTML=rulesHTML();
 document.getElementById('course-preferences-content').innerHTML=preferencesHTML();
 box.querySelector('[data-clear-area]').hidden=!p.items.length;
 for(const [key,isOpen] of detailState){const el=document.getElementById(key);if(el)el.open=isOpen;}
 for(const [formId,values] of drafts){const form=document.getElementById(formId);if(!form)continue;for(const saved of values){const el=[...form.elements].find(x=>x.name===saved.name&&(saved.type!=='checkbox'||x.value===saved.value));if(!el)continue;if(saved.type==='checkbox')el.checked=saved.checked;else if(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===saved.value))el.value=saved.value;}}
 search();
 if(focus){const el=focus.id?document.getElementById(focus.id):document.getElementById(focus.form)?.elements.namedItem(focus.name);if(el?.focus){el.focus({preventScroll:true});if(focus.id&&el.type==='search'&&Number.isInteger(focus.start))el.setSelectionRange(focus.start,focus.end);}}
}
function search(){
 const docs=db.courses.map(c=>({id:c.module_code,code:c.module_code,title:C.courseName(c),summary:db.names[c.module_code]||'',aliases:[c.module_code,db.names[c.module_code]||''],body:c.section_2025,tasks:['study'],kind:'course',course:c}));
 const list=window.RCISearch.search(docs,query,db.synonyms||[]).slice(0,query?20:6).map(d=>d.course);
 document.getElementById('preference-results').innerHTML=list.map(c=>{const own=p.items.find(x=>x.code===c.module_code&&x.custom),shown=own?{...c,ects:own.ects,allowed_groups:[own.group]}:c;const already=mode==='passed'?p.items.some(x=>x.code===c.module_code&&x.status==='passed'):p.preferences[mode].includes(c.module_code);return `<div class="preference-result"><span><b>${e(C.courseName(c))}</b><small>${e(c.module_code)} · ${shown.ects} ECTS${db.names[c.module_code]?' · '+e(db.names[c.module_code]):''}</small>${own?'<small>保留原有自录认定；学分与归类需个人核对。</small>':c.recommendation_note?`<small>${e(c.recommendation_note)}</small>`:''}</span><button class="quiet" type="button" data-record="${e(c.module_code)}" ${already||mode==='passed'&&!Number.isFinite(Number(shown.ects))?'disabled':''}>${mode==='passed'&&!Number.isFinite(Number(shown.ects))?'学分待核实':already?'已记录':mode==='passed'?'记为已修':mode==='desired'?'想选 ＋':'排除 ＋'}</button></div>`;}).join('')||'<p class="meta">未找到。目录外课程可从「更多」中自行录入，认定需学校确认。</p>';
}
function openPlanDialog(target){for(const other of [settings,preferences,tools])if(other!==target&&other.open)other.close();if(!target.open)target.showModal();}
function openSettings(forAuto=false,message=''){
 autoIntent=forAuto;
 const notice=document.getElementById('plan-settings-notice');notice.textContent=message;notice.hidden=!message;
 document.getElementById('plan-settings-title').textContent=forAuto?'调整规划条件':'计划设置';
 settings.querySelector('[data-finish-settings]').textContent=forAuto?'保存并预览':'保存设置';
 openPlanDialog(settings);
 document.getElementById('plan-settings-content').scrollTop=0;
 if(forAuto){const required=!C.cohorts.includes(p.cohort)?'plan-cohort':!p.conditionalConfirmed?'controls-conditional-status':'plan-start-term';document.getElementById(required).focus({preventScroll:true});}
}
async function savePreferences(form){
 if(!form.reportValidity())return false;
 const f=new FormData(form),values=Object.fromEntries(['minECTS','maxECTS','minExams','maxExams'].map(k=>[k,Number(f.get(k))]));
 dirtyForms.delete(form.id);
 try{
  if(form.id==='planning-preferences')await U.updatePlan(p=>({...p,preferences:{...p.preferences,languages:f.getAll('language'),startSemester:Number(f.get('startSemester')),allowUnconfirmed:f.has('allowUnconfirmed'),deadlineException:f.has('deadlineException')},workload:{...p.workload,...values}}));
  if(form.id==='semester-workload')await U.updatePlan(p=>({...p,workload:{...p.workload,semesters:{...p.workload.semesters,[f.get('semester')]:values}}}));
  return true;
 }catch(error){dirtyForms.add(form.id);throw error;}
}
box.addEventListener('input',event=>{if(event.target.form)dirtyForms.add(event.target.form.id);if(event.target.id==='preference-search'){query=event.target.value;search();}});
box.addEventListener('change',async event=>{
 const el=event.target;if(el.form)dirtyForms.add(el.form.id);
 try{
  if(el.id==='controls-conditional-status')await U.updatePlan(p=>({...p,conditional:el.value==='yes',conditionalConfirmed:el.value!=='unknown'}));
  if(el.id==='plan-cohort')await U.updatePlan(p=>({...p,cohort:el.value,timeline:{...p.timeline,start:C.cohorts.includes(el.value)?el.value.endsWith('夏季')?'summer':'winter':p.timeline.start}}));
  if(el.id==='plan-start-term')await U.updatePlan(p=>({...p,timeline:{...p.timeline,start:el.value}}));
  if(el.id==='plan-semester-count'){
   const count=Number(el.value);
   await U.updatePlan(async p=>{
    const displaced=p.items.filter(x=>x.status==='planned'&&x.semester>count);
    if(displaced.length&&!await U.confirmAction(`改为 ${count} 个学期？`,`${displaced.length} 门课会移到${desktopPlanning?.matches?'第 1 学期':'「待分配」'}，课程和学分都会保留。`,'保留课程并调整')){await render();return null;}
    return {...p,timeline:{...p.timeline,count},preferences:{...p.preferences,startSemester:Math.min(count,p.preferences.startSemester)},items:p.items.map(x=>x.status==='planned'&&x.semester>count?{...x,semester:desktopPlanning?.matches?1:0}:x)};
   });
  }
  if(el.closest('#semester-workload')&&el.name==='semester'){const b=E.bounds(p,Number(el.value));for(const key of ['minECTS','maxECTS','minExams','maxExams'])el.form.elements[key].value=b[key];}
 }catch(error){U.toast(error.message);}
});
box.addEventListener('submit',async event=>{if(!['planning-preferences','semester-workload'].includes(event.target.id))return;event.preventDefault();try{if(await savePreferences(event.target))U.toast('规划条件已保存。');}catch(error){U.toast(error.message);}});
box.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;try{
  if(b.hasAttribute('data-open-settings'))openSettings();
  if(b.hasAttribute('data-open-preferences')){mode=b.dataset.openPreferences;query='';await render();openPlanDialog(preferences);document.getElementById('preference-search').focus({preventScroll:true});}
  if(b.hasAttribute('data-preference-mode')){mode=b.dataset.preferenceMode;await render();document.getElementById('preference-tab-'+mode).focus({preventScroll:true});}
  if(b.hasAttribute('data-open-tools'))openPlanDialog(tools);
  if(b.hasAttribute('data-open-planning-rules'))document.getElementById('planning-rules-dialog').showModal();
  if(b.hasAttribute('data-close-plan-dialog'))b.closest('dialog').close();
  if(b.hasAttribute('data-finish-settings')){
   for(const id of ['planning-preferences','semester-workload'])if(dirtyForms.has(id)&&!await savePreferences(document.getElementById(id)))return;
   const generateNext=autoIntent;settings.close();if(generateNext)await generate();
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
  if(b.hasAttribute('data-reset-workload')){const n=box.querySelector('#semester-workload [name="semester"]').value;dirtyForms.delete('semester-workload');await U.updatePlan(p=>{const semesters={...p.workload.semesters};delete semesters[n];return {...p,workload:{...p.workload,semesters}};});}
  if(b.hasAttribute('data-generate'))await generate();
 }catch(error){U.toast(error.message);}
});
box.addEventListener('keydown',async event=>{
 const tab=event.target.closest('[data-preference-mode]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();const modes=['passed','desired','excluded'],index=modes.indexOf(mode);
 mode=event.key==='Home'?modes[0]:event.key==='End'?modes[2]:modes[(index+(event.key==='ArrowRight'?1:2))%3];await render();document.getElementById('preference-tab-'+mode).focus({preventScroll:true});
});
for(const panel of [settings,preferences,tools])panel.addEventListener('click',event=>{if(event.target!==panel)return;const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)panel.close();});
function autoHeading(title,description){
 if(!desktopPlanning?.matches)return;
 document.getElementById('auto-plan-title').textContent=title;
 document.getElementById('auto-plan-description').textContent=description;
}
function remediationConflict(snapshot){
 const item=snapshot.items.find(x=>x.code==='ED140014'),desired=snapshot.preferences.desired.includes('ED140014');
 const places=[item?(item.status==='passed'?'已修记录':'已选课程'):'',desired?'“想选”列表':''].filter(Boolean).join('和');
 const records=(item?`<button type="button" class="button secondary" data-review-remediation="${item.status==='passed'?'passed':'planned'}">${item.status==='passed'?'查看已修记录':'查看已选课程'}</button>`:'')+(desired?'<button type="button" class="button secondary" data-review-remediation="desired">查看想选记录</button>':'');
 return `<p>${places}中有<b>控制理论（ED140014）</b>，但补修设置是<b>“不需要”</b>。</p><p>这里的“补修”指录取通知要求额外修读的课程。请按通知处理：</p><ul><li><b>通知要求补修：</b>点“核对补修设置”，选择“需要”，再生成方案。</li><li><b>通知没有这项要求：</b>${item?.status==='passed'?'这门课已记为已修，请先保留成绩，向 RCI 学业咨询核对归类。':'查看下面的课程记录，取消误加的课程及其“想选”记录，再生成方案。'}</li><li><b>还没核对：</b>先点“返回计划”继续手动安排，查清录取通知后再修改补修设置。</li></ul><div class="inline-actions">${records}</div><p class="meta"><a class="text-link" href="${U.base}/guides/conditional-control/" target="_blank" rel="noopener noreferrer">不确定是否需要补修？查看说明 ↗</a></p>`;
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
  query='ED140014';await render();openPlanDialog(preferences);document.getElementById('preference-search').focus();
 }catch(error){U.toast(error.message);}
});
dialog.querySelector('[data-edit-auto-settings]').addEventListener('click',()=>{
 const conflict=desktopPlanning?.matches&&preview?.issue==='remediation-conflict';
 dialog.close();openSettings(true,conflict?'请按录取通知确认补修要求。只有要求修读 ED140014 时，才选“需要”。':'');
 if(conflict)document.getElementById('controls-conditional-status').focus();
});
async function generate(){
 if(worker||preparing)return;
 preparing=true;
 const run=++generation;
 let snapshot;try{snapshot=await U.plan();}finally{preparing=false;}
 if(run!==generation)return;
 if(!C.cohorts.includes(snapshot.cohort)||!snapshot.conditionalConfirmed||((snapshot.cohort.endsWith('夏季')?'summer':'winter')!==snapshot.timeline.start)){
  openSettings(true,!C.cohorts.includes(snapshot.cohort)?'先选择入学时间，并确认录取通知里的补修要求。':!snapshot.conditionalConfirmed?'先确认录取通知里的补修要求。':'第一学期与入学时间不一致，请调整。');return;
 }
 original=snapshot;expected=JSON.stringify(original);preview=null;
 autoHeading('自动方案预览','先查看安排，采用后才会更新计划。');
 dialog.querySelector('[data-edit-auto-settings]').textContent='调整条件';
 result.innerHTML='<p role="status">正在检查课程和学分，安排各学期…</p>';dialog.querySelector('[data-apply-auto]').hidden=true;dialog.showModal();
 if(typeof Worker==='undefined'){result.innerHTML='<p>这个浏览器暂时用不了自动规划。请换一个较新的浏览器，或继续手动排课。</p>';return;}
 const activeWorker=new Worker(U.base+'/assets/planning-worker.js');worker=activeWorker;
 const finish=()=>{if(run!==generation)return false;clearTimeout(searchTimer);searchTimer=null;activeWorker.terminate();worker=null;return true;};
 searchTimer=setTimeout(()=>{if(!finish())return;result.innerHTML='<p>这次没能算出方案，原计划没有改动。可以多安排几个学期，或减少固定学期的课程后再试。</p>';},25000);
 activeWorker.onerror=()=>{if(!finish())return;result.innerHTML='<p>暂时生成不了方案，请刷新后再试。原计划没有改动。</p>';};
 activeWorker.onmessage=event=>{if(!finish())return;const r=event.data;preview=r;
  if(!r.ok){
   if(desktopPlanning?.matches&&r.issue==='remediation-conflict'){
    autoHeading('先核对补修要求','现有计划没有修改。');
    result.innerHTML=remediationConflict(original);dialog.querySelector('[data-edit-auto-settings]').textContent='核对补修设置';
   }else{
    autoHeading('还没找到合适的方案','原计划没有改动。');
    result.innerHTML=`${desktopPlanning?.matches?'':'<h3>还没找到合适的方案</h3>'}<ul>${r.reasons.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`;
   }
   return;
  }
  const s=C.schedule(r.plan,db.courses);
  result.innerHTML=`<p class="auto-result-total"><b>${r.calculation.allocated} / 120 ECTS</b> · 已修 ${r.passed.allocated} · 待修 ${r.plan.items.filter(x=>x.status==='planned').reduce((sum,x)=>sum+Number(x.custom?x.ects:db.courses.find(c=>c.module_code===x.code)?.ects??x.ects),0)} ECTS</p><p>预计第 ${r.finish} 学期完成。新增 ${r.added.length} 门课${r.moved.length?'，调整 '+r.moved.length+' 门课的学期':''}${r.removed?.length?'，移除 '+r.removed.length+' 门已排除的选修课':''}。${r.removed?.length?' 移除：'+r.removed.map(title).map(e).join('、')+'。':''}</p><div class="auto-preview-semesters">${s.semesters.filter(x=>x.number<=r.finish).map(n=>`<section><h3>${e(T.term(r.plan,n.number).label)} · ${n.credits} ECTS · ${n.items.length} 次考试（估算）</h3><ul>${n.items.map(x=>`<li>${e(title(x.code))} <small>${e(x.code)}${x.group?' · 计入 '+e(x.group):''}${x.locked?' · 固定':''}</small></li>`).join('')}</ul></section>`).join('')}</div>${r.warnings.length?`<div class="notice"><h3>用这个方案前，请先确认</h3><ul>${r.warnings.map(x=>`<li>${e(x)}</li>`).join('')}</ul></div>`:''}<p class="meta">实际开课、名额、课表和考试报名，请到 TUMonline 确认。</p><p class="meta">会尽量早点排完，但不保证是最快的方案。采用后可立即撤销。</p>`;
  dialog.querySelector('[data-apply-auto]').hidden=false;
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
