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
function title(code){const own=p.items.find(x=>x.code===code&&x.custom);if(own)return own.name;return db.names[code]||db.courses.find(c=>c.module_code===code)?.module_name_legal_2025||p.items.find(x=>x.code===code)?.name||code;}
function chips(codes,kind){return codes.length?codes.map(code=>`<span class="preference-chip">${e(title(code))} <small>${e(code)}</small><button class="quiet" type="button" data-forget="${e(code)}" data-kind="${kind}" aria-label="取消${kind==='passed'?'已修':kind==='desired'?'想选':'排除'} ${e(title(code))}">×</button></span>`).join(''):'<p class="meta">尚未添加</p>';}
function fields(value,prefix,keys=['minECTS','maxECTS','minExams','maxExams']){return [['minECTS','学分下限',120,.5],['maxECTS','学分上限',120,.5],['minExams','考核下限',50,1],['maxExams','考核上限',50,1]].filter(([key])=>keys.includes(key)).map(([key,label,max,step])=>`<label>${label}<input name="${prefix+key}" type="number" min="0" max="${max}" step="${step}" value="${value[key]}" required></label>`).join('');}
function settingsHTML(){return `
 <section id="plan-options" class="plan-basic-settings" aria-labelledby="plan-basics-title">
  <h3 id="plan-basics-title">基本设置</h3>
  <div class="plan-settings-grid">
   <label>入学批次<select id="plan-cohort">${[['unknown','请选择入学批次'],...C.cohorts.map(v=>[v,v+'入学']),['older','其他批次（需自行核对规则）']].map(([v,t])=>`<option value="${e(v)}" ${p.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select></label>
   <label>计划读几个学期<select id="plan-semester-count">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${p.timeline.count===i+1?'selected':''}>${i+1} 个学期</option>`).join('')}</select></label>
   <label>第1学期的季节<select id="plan-start-term"><option value="winter" ${p.timeline.start==='winter'?'selected':''}>冬季学期</option><option value="summer" ${p.timeline.start==='summer'?'selected':''}>夏季学期</option></select></label>
   <label>录取通知是否要求补修<select id="controls-conditional-status"><option value="unknown" ${!p.conditionalConfirmed?'selected':''}>尚未确认</option><option value="no" ${p.conditionalConfirmed&&!p.conditional?'selected':''}>已核对：不需要补修</option><option value="yes" ${p.conditionalConfirmed&&p.conditional?'selected':''}>已核对：需要补修</option></select></label>
  </div>
  <p class="meta">120 ECTS 分 ${p.timeline.count} 学期，平均 ${Number((120/p.timeline.count).toFixed(1))} ECTS／学期。${desktopPlanning?.matches?'缩短规划时，超出范围的课程会移到第 1 学期。':'缩短规划时，超出范围的课程会保留在「待分配」。'}</p>
 </section>
 <details id="planning-preference-settings"><summary>语言与学期负担</summary>
  <form id="planning-preferences">
   <fieldset><legend>接受的授课语言</legend>${['EN','DE'].map(l=>`<label class="check"><input type="checkbox" name="language" value="${l}" ${p.preferences.languages.includes(l)?'checked':''}>${l==='EN'?'英语':'德语'}</label>`).join('')}<p class="meta">目录双语课程的实际授课语言仍需核对。</p></fieldset>
   <label>从哪个学期开始安排未来课程<select name="startSemester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}" ${p.preferences.startSemester===i+1?'selected':''}>${e(T.term(p,i+1).label)}</option>`).join('')}</select></label>
   <div class="load-fields">${fields(p.workload,'',['maxECTS','maxExams'])}</div>
   <p class="meta">每学期的上限。考核数按每模块1项估算。</p>
   <details id="advanced-planning-limits"><summary>更多规划条件</summary><div class="load-fields">${fields(p.workload,'',['minECTS','minExams'])}</div>${[['allowUnconfirmed','允许按目录季节推算未来开课'],['deadlineException','只提示标准进度期限，仍尝试超出标准期限的方案']].map(([key,label])=>`<label class="check"><input name="${key}" type="checkbox" ${p.preferences[key]?'checked':''}>${label}</label>`).join('')}</details>
   <button class="button secondary" type="submit">保存规划条件</button>
  </form>
  <details id="semester-overrides"><summary>为某个学期单独设置负担</summary><form id="semester-workload"><label>学期<select name="semester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}">第 ${i+1} 学期</option>`).join('')}</select></label><div class="load-fields">${fields(E.bounds(p,1),'')}</div><div class="inline-actions"><button class="button secondary" type="submit">保存本学期设置</button><button class="quiet" type="button" data-reset-workload>恢复全局设置</button></div></form><div class="workload-overrides">${Object.entries(p.workload.semesters).map(([n])=>`<p>第 ${n} 学期：${E.bounds(p,n).minECTS}–${E.bounds(p,n).maxECTS} ECTS，${E.bounds(p,n).minExams}–${E.bounds(p,n).maxExams} 项考核</p>`).join('')||'<p class="meta">所有学期目前采用全局设置。</p>'}</div></details>
 </details>
 <details id="planning-rule-audit"><summary>毕业规则与数据范围</summary>
  <p>SS2024–SS2025使用2024 FPSO；WS2025/26起叠加2025-02-11修订。A–E 43、F 30、J至少6、G/H/I合计41 ECTS，且G/H/I每类至少5。若个人要求补修ED140014：K 5、G/H/I合计36，各类最低额不变；此前批次不能套用此减免。</p>
  <p>论文通常是最后一项考核，正常期限为正式出题起最多六个月；提前开题、延期或停算需按学校批准记录核对。第2学期末须通过A/B/C中至少一门；标准进度为第3／4／5／6学期末累计30／60／90／120 ECTS。补考、最终不通过和个人期限例外以学校记录为准。</p>
  <p>当前官方专业选修153门全部收录，114门可参与自动规划；J类429门全部收录，45门可参与自动规划。待核实、周期不明确、需导师或个人条件未确认的模块不会自动补入。知识准备随方案列出，采用前需核对。按目录季节推算不保证未来开课或名额。</p>
  <p>同一模块只计一次。本科已计入的限选／选修模块不得在硕士重新选入，其他成绩认定按学校决定。J语言课须核对个人资格：德语至少C1.2、硕士英语须C2，语言课合计最多6 ECTS；当前不自动补入语言课。研讨／实践模块只分配学分，不代表已选课题或获得名额。</p>
  <p>已修与固定学期保留；排除偏好会移除未固定选修，其余已选课程保留。搜索有计算预算，不保证全局最优、考试登记或毕业批准。实际课表请到TUMonline的Terminkalender查看。</p>
  <p class="meta">规则核对：${e(db.rules?.checkedOn||'2026-10-15')}；独立人工复核待完成。</p>
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
 document.getElementById('plan-context').innerHTML=`<button id="plan-open-settings" type="button" class="plan-context-button" data-open-settings aria-haspopup="dialog">${e(p.cohort==='unknown'?'确认入学批次':p.cohort==='older'?'其他入学批次':p.cohort)} · ${p.timeline.count} 个学期 <span class="context-edit">设置</span></button><span class="context-divider" aria-hidden="true"></span><button id="plan-open-passed" type="button" class="plan-context-button" data-open-preferences="passed" aria-haspopup="dialog">已修 ${calc.allocated} ECTS</button><button id="plan-open-preferences" type="button" class="plan-context-button" data-open-preferences="desired" aria-haspopup="dialog">选课偏好${p.preferences.desired.length+p.preferences.excluded.length?' · '+(p.preferences.desired.length+p.preferences.excluded.length):''}</button><button type="button" class="plan-context-button desktop-only" data-open-study aria-haspopup="dialog" aria-controls="plan-study-dialog">选课与学分说明</button><span class="plan-save-state${U.persisted?'':' is-temporary'}">${U.persisted?'自动保存在此浏览器':'仅本页有效，请导出备份'}</span>`;
 document.getElementById('plan-add-course').dataset.pickSemester=String(desktopPlanning?.matches?1:p.preferences.startSemester);
 document.getElementById('plan-settings-content').innerHTML=settingsHTML();
 document.getElementById('course-preferences-content').innerHTML=preferencesHTML();
 box.querySelector('[data-clear-area]').hidden=!p.items.length;
 for(const [key,isOpen] of detailState){const el=document.getElementById(key);if(el)el.open=isOpen;}
 for(const [formId,values] of drafts){const form=document.getElementById(formId);if(!form)continue;for(const saved of values){const el=[...form.elements].find(x=>x.name===saved.name&&(saved.type!=='checkbox'||x.value===saved.value));if(!el)continue;if(saved.type==='checkbox')el.checked=saved.checked;else if(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===saved.value))el.value=saved.value;}}
 search();
 if(focus){const el=focus.id?document.getElementById(focus.id):document.getElementById(focus.form)?.elements.namedItem(focus.name);if(el?.focus){el.focus({preventScroll:true});if(focus.id&&el.type==='search'&&Number.isInteger(focus.start))el.setSelectionRange(focus.start,focus.end);}}
}
function search(){
 const docs=db.courses.map(c=>({id:c.module_code,code:c.module_code,title:c.module_name_legal_2025,summary:db.names[c.module_code]||'',aliases:[c.module_code,db.names[c.module_code]||''],body:c.section_2025,tasks:['study'],kind:'course',course:c}));
 const list=window.RCISearch.search(docs,query,db.synonyms||[]).slice(0,query?20:6).map(d=>d.course);
 document.getElementById('preference-results').innerHTML=list.map(c=>{const own=p.items.find(x=>x.code===c.module_code&&x.custom),shown=own?{...c,ects:own.ects,allowed_groups:[own.group]}:c;const already=mode==='passed'?p.items.some(x=>x.code===c.module_code&&x.status==='passed'):p.preferences[mode].includes(c.module_code);return `<div class="preference-result"><span><b>${e(c.module_name_legal_2025)}</b><small>${e(c.module_code)} · ${shown.ects} ECTS${db.names[c.module_code]?' · '+e(db.names[c.module_code]):''}</small>${own?'<small>保留原有自录认定；学分与归类需个人核对。</small>':c.recommendation_note?`<small>${e(c.recommendation_note)}</small>`:''}</span><button class="quiet" type="button" data-record="${e(c.module_code)}" ${already||mode==='passed'&&!Number.isFinite(Number(shown.ects))?'disabled':''}>${mode==='passed'&&!Number.isFinite(Number(shown.ects))?'学分待核实':already?'已记录':mode==='passed'?'记为已修':mode==='desired'?'想选 ＋':'排除 ＋'}</button></div>`;}).join('')||'<p class="meta">未找到。目录外课程可从「更多」中自行录入，认定需学校确认。</p>';
}
function openPlanDialog(target){for(const other of [settings,preferences,tools])if(other!==target&&other.open)other.close();if(!target.open)target.showModal();}
function openSettings(forAuto=false,message=''){
 autoIntent=forAuto;
 const notice=document.getElementById('plan-settings-notice');notice.textContent=message;notice.hidden=!message;
 settings.querySelector('[data-finish-settings]').textContent=forAuto?'生成方案预览':'完成';
 openPlanDialog(settings);
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
 return `<p>${places}中有<b>控制理论（ED140014）</b>，但补修设置是<b>“不需要补修”</b>。</p><p>这里的“补修”指录取通知要求额外修读的课程。请按通知处理：</p><ul><li><b>通知要求补修：</b>点“核对补修设置”，选择“已核对：需要补修”，再生成方案。</li><li><b>通知没有这项要求：</b>${item?.status==='passed'?'这门课已记为已修，请先保留成绩，向 RCI 学业咨询核对归类。':'查看下面的课程记录，取消误加的课程及其“想选”记录，再生成方案。'}</li><li><b>还没核对：</b>先点“返回计划”继续手动安排，查清录取通知后再修改补修设置。</li></ul><div class="inline-actions">${records}</div><p class="meta"><a class="text-link" href="${U.base}/guides/conditional-control/" target="_blank" rel="noopener noreferrer">不确定是否需要补修？查看说明 ↗</a></p>`;
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
 dialog.close();openSettings(true,conflict?'请对照录取通知核对补修要求。只有通知要求修读 ED140014 时，才选择“需要补修”。未核对时可选“尚未确认”，关闭设置后先手动安排。':'调整后重新生成预览，现有计划保持不变。');
 if(conflict)document.getElementById('controls-conditional-status').focus();
});
async function generate(){
 if(worker||preparing)return;
 preparing=true;
 const run=++generation;
 let snapshot;try{snapshot=await U.plan();}finally{preparing=false;}
 if(run!==generation)return;
 if(!C.cohorts.includes(snapshot.cohort)||!snapshot.conditionalConfirmed||((snapshot.cohort.endsWith('夏季')?'summer':'winter')!==snapshot.timeline.start)){
  openSettings(true,'自动规划前，请确认入学批次、起始季节和录取通知中的补修要求。');return;
 }
 original=snapshot;expected=JSON.stringify(original);preview=null;
 autoHeading('自动方案预览','先查看安排，采用后才会更新计划。');
 dialog.querySelector('[data-edit-auto-settings]').textContent='调整条件';
 result.innerHTML='<p role="status">正在检查课程、学分与学期约束…</p>';dialog.querySelector('[data-apply-auto]').hidden=true;dialog.showModal();
 if(typeof Worker==='undefined'){result.innerHTML='<p>这个浏览器不支持后台规划。请使用较新的浏览器；现有手动计划仍可使用。</p>';return;}
 const activeWorker=new Worker(U.base+'/assets/planning-worker.js');worker=activeWorker;
 const finish=()=>{if(run!==generation)return false;clearTimeout(searchTimer);searchTimer=null;activeWorker.terminate();worker=null;return true;};
 searchTimer=setTimeout(()=>{if(!finish())return;result.innerHTML='<p>本次搜索超时，没有修改计划。可减少固定条件或增加规划学期后重试。</p>';},25000);
 activeWorker.onerror=()=>{if(!finish())return;result.innerHTML='<p>自动规划暂时无法运行；现有记录没有修改。请刷新后重试。</p>';};
 activeWorker.onmessage=event=>{if(!finish())return;const r=event.data;preview=r;
  if(!r.ok){
   if(desktopPlanning?.matches&&r.issue==='remediation-conflict'){
    autoHeading('先核对补修要求','现有计划没有修改。');
    result.innerHTML=remediationConflict(original);dialog.querySelector('[data-edit-auto-settings]').textContent='核对补修设置';
   }else{
    autoHeading('暂未生成可用方案','现有计划没有修改。');
    result.innerHTML=`${desktopPlanning?.matches?'':'<h3>暂未生成可用方案</h3>'}<ul>${r.reasons.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`;
   }
   return;
  }
  const s=C.schedule(r.plan,db.courses);
  result.innerHTML=`<p class="auto-result-total"><b>${r.calculation.allocated} / 120 ECTS</b> · 已修 ${r.passed.allocated} · 未来 ${r.plan.items.filter(x=>x.status==='planned').reduce((sum,x)=>sum+Number(x.custom?x.ects:db.courses.find(c=>c.module_code===x.code)?.ects??x.ects),0)} ECTS</p><p>安排至第 ${r.finish} 学期；新增 ${r.added.length} 门、移动 ${r.moved.length} 门、移除排除选修 ${(r.removed||[]).length} 门。固定课程与已修记录保留。${r.removed?.length?' 移除：'+r.removed.map(title).map(e).join('、')+'。':''}</p><div class="auto-preview-semesters">${s.semesters.filter(x=>x.number<=r.finish).map(n=>`<section><h3>${e(T.term(r.plan,n.number).label)} · ${n.credits} ECTS · ${n.items.length} 项考核</h3><ul>${n.items.map(x=>`<li>${e(title(x.code))} <small>${e(x.code)}${x.group?' · 计入 '+e(x.group):''}${x.locked?' · 固定':''}</small></li>`).join('')}</ul></section>`).join('')}</div>${r.warnings.length?`<div class="notice"><h3>采用前需要核对</h3><ul>${r.warnings.map(x=>`<li>${e(x)}</li>`).join('')}</ul></div>`:''}<p class="meta">此方案用于学分与学期规划。实际开课、名额、课表与考试登记请在个人 TUMonline 确认。</p><p class="meta">在当前目录与计算预算内优先找到较早完成的方案；未证明全局最优。确认会更新安排，可立即撤销。</p>`;
  dialog.querySelector('[data-apply-auto]').hidden=false;
 };
 activeWorker.postMessage({plan:original,courses:db.courses,offerings:db.offerings||{}});
}
dialog.addEventListener('close',()=>{generation++;clearTimeout(searchTimer);searchTimer=null;worker?.terminate();worker=null;});
dialog.querySelector('[data-cancel-auto]').addEventListener('click',()=>dialog.close());
dialog.querySelector('[data-apply-auto]').addEventListener('click',async()=>{try{
 if(!preview?.ok)return;const next=preview.plan,before=original;
 await U.updatePlan(p=>{if(JSON.stringify(p)!==expected)throw new Error('预览期间计划已更新，请重新生成，避免覆盖新记录。');return next;});dialog.close();
 if(U.persisted)U.toast('自动方案已应用到看板。',{label:'撤销',run:()=>U.updatePlan(p=>{if(JSON.stringify(p)!==JSON.stringify(next))throw new Error('计划已有后续修改，不能覆盖。请手动调整或恢复备份。');return before;})});
 }catch(error){U.toast(error.message);}});
window.addEventListener('rci:planchange',()=>{render().catch(error=>U.toast(error.message));});
})();
