/* The student's own plan. Uses the existing validated rules and v2 storage format. */
(async function(){
'use strict';
const U=window.RCIUI,C=window.RCI,T=window.RCICourseContext,e=C.esc,box=document.getElementById('planner');if(!box)return;
let db,known,renderId=0,draggedCode=null,dragFrame=0,dragX=0,boardScrollOwner=null;
const domainNames=C.courseGroups,desktopPlanning=window.matchMedia?.('(min-width: 961px)');
try{db=await U.data();known=new Map(db.courses.map(c=>[c.module_code,c]));await render();}catch(err){box.innerHTML='<div class="empty"><h2>暂时无法读取计划</h2><p>'+e(err.message)+'。已有记录没有覆盖，请先备份再重试。</p><button class="button" type="button" data-backup-open>备份与恢复</button> <a class="button secondary" href="'+U.base+'/courses/">先浏览课程</a></div>';return;}
function progress(calc){
 if(!desktopPlanning?.matches)return calc.buckets.map(([name,value,target],i)=>`<div class="progress-row"><div><span>${e(name)}<small class="original-label">${e(C.creditOriginalNames[i])}</small></span><b>${Math.min(value,target)} / ${target}</b></div><progress max="${target}" value="${Math.min(value,target)}" aria-label="${e(name)} ${e(C.creditOriginalNames[i])} ${Math.min(value,target)} / ${target} ECTS"></progress></div>`).join('');
 const categories=[['core','必修'],['professional','专业选修'],['interdisciplinary','跨学科'],['thesis','论文'],['remediation','补修']];
 const bars=calc.buckets.map(([name,value,target],i)=>{
  const [category,label]=categories[i],current=Math.min(value,target),compact=target<=6,copy=`<span class="credit-segment-name">${label}</span><b>${current}<small>${compact?'/':' / '}${target}</small></b>`;
  return `<div class="credit-segment credit-category-${category}${compact?' credit-segment-compact':''}" data-credit-category="${category}" tabindex="0" role="group" aria-label="${e(name)}" title="${e(name)} · ${e(C.creditOriginalNames[i])}"><progress class="credit-distribution-progress credit-category-${category}" data-credit-category="${category}" data-credit-share="${target}" max="${target}" value="${current}" aria-label="${e(name)} ${e(C.creditOriginalNames[i])} ${current} / ${target} ECTS"></progress><span class="credit-segment-copy" aria-hidden="true">${copy}</span><span class="credit-segment-copy credit-segment-filled" aria-hidden="true">${copy}</span></div>`;
 }).join('');
 return `<div class="credit-distribution" role="group" aria-label="学分分布与规划进度">${bars}</div>`;
}
function gaps(calc,p){
 if(!p.items.length&&!desktopPlanning?.matches)return '<p>加入课程后，查看各类别还需要多少学分。</p>';
 const keys=['core','professional','J','F','K'];
 let links=(!p.conditionalConfirmed?'<p>个人补修条件未确认，暂不判断规则达成。</p>':'')+(p.conditional&&!C.amended(p.cohort)?'<p>此批次的入学附加考试需单独核对，不能套用 K 学分减免。</p>':'')+calc.buckets.map(([label,value,target],i)=>value<target?`<a class="gap-link" href="${U.base}/courses/?group=${keys[i]}"><span>${e(label)}还差 <b>${target-value}</b> ECTS</span><span aria-hidden="true">→</span></a>`:'').join('');
 for(const k of ['G','H','I'])if(calc.totals[k]<5)links+=`<a class="gap-link" href="${U.base}/courses/?group=${k}"><span>${domainNames[k]}领域还差 <b>${5-calc.totals[k]}</b> ECTS</span><span aria-hidden="true">→</span></a>`;
 if(!p.conditional&&calc.totals.K>0)links+='<p>控制理论未计入，请核对补修设置。</p>';
 return links||'<p>规划已覆盖本模型的学分要求。课程认定请在学校系统核对。</p>';
}
function semesterOptions(p,selected,course){
 return (desktopPlanning?.matches?'':`<option value="0" ${selected===0?'selected':''}>待分配</option>`)+Array.from({length:p.timeline.count},(_,i)=>{
  const n=i+1,season=C.semesterSeason(p.timeline,n),conflict=C.offering(course,season).state==='conflict';
  return `<option value="${n}" ${selected===n?'selected':''}>第 ${n} · ${season==='winter'?'冬季':'夏季'}${conflict?'（目录不符）':''}</option>`;
 }).join('');
}
function passedSemesterOptions(p,selected){
 return `<option value="0" ${selected===0?'selected':''}>通过学期未记录</option>`+Array.from({length:12},(_,i)=>{
  const n=i+1;
  return `<option value="${n}" ${selected===n?'selected':''}>${e(C.semesterLabel(p.timeline,n))}${n>p.timeline.count?'（规划范围外）':''}</option>`;
 }).join('');
}
function creditCategory(group){
 if(group&&'ABCDE'.includes(group))return 'core';
 if(group&&'GHI'.includes(group))return 'professional';
 return {J:'interdisciplinary',F:'thesis',K:'remediation'}[group];
}
function row(x,p){
 const c=x.custom?null:known.get(x.code),title=c?c.module_name_legal_2025:x.name,translation=c?db.names[x.code]||'':'',credits=c?c.ects:x.ects;
 const category=desktopPlanning?.matches?creditCategory(x.group||c?.section_2025[0]):null,categoryClass=category?' credit-category-'+category:'',categoryAttribute=category?` data-credit-category="${category}"`:'';
 if(desktopPlanning?.matches&&x.status==='passed')return `<details class="plan-row scheduled-row course-card is-passed${categoryClass}"${categoryAttribute} id="plan-course-${e(x.code)}" data-plan-course="${e(x.code)}" draggable="true"><summary class="course-card-summary" id="plan-course-toggle-${e(x.code)}" aria-label="${e(title)}，${e(credits)} ECTS，已通过，可调整通过学期"><span class="course-drag" aria-hidden="true">⠿</span><span class="course-card-title">${e(title)}</span><span class="course-card-credits">${e(credits)} <small>ECTS</small></span><span class="course-passed-state">✓ 已通过</span></summary><div class="course-card-actions">${translation?`<p class="course-card-translation">${e(translation)}</p>`:''}<p class="course-card-meta">${e(x.code)} · ${x.semester?`第 ${x.semester} 学期通过`:'通过学期未记录'}${x.custom?' · 自录认定':''}${c?`<a class="text-link" href="${U.base}/courses/${e(x.code)}/" target="_blank" rel="noopener noreferrer" aria-label="查看 ${e(title)} 课程详情（新标签页）">课程详情 ↗</a>`:''}</p><div class="row-controls"><label><span>通过学期</span><select data-semester="${e(x.code)}" aria-label="${e(title)} 通过学期">${passedSemesterOptions(p,x.semester)}</select></label></div><button class="quiet" type="button" data-unpass="${e(x.code)}">改为待修</button></div></details>`;
 const season=x.semester?C.semesterSeason(p.timeline,x.semester):null,offer=T?T.offering(p,c,x.semester,db.offerings||{}):C.offering(c,season),conflict=!!season&&offer.state==='conflict';
 return `<details class="plan-row scheduled-row course-card${conflict?' has-conflict':''}${categoryClass}"${categoryAttribute} id="plan-course-${e(x.code)}" data-plan-course="${e(x.code)}" draggable="true"><summary class="course-card-summary" id="plan-course-toggle-${e(x.code)}" aria-label="${e(title)}，${e(credits)} ECTS，调整学期${conflict?'，目录季节不符':''}"><span class="course-drag" aria-hidden="true">⠿</span><span class="course-card-title">${e(title)}</span><span class="course-card-credits">${e(credits)} <small>ECTS</small></span>${conflict?'<span class="course-card-alert">冬夏季节需核对</span>':''}</summary><div class="course-card-actions">${translation?`<p class="course-card-translation">${e(translation)}</p>`:''}<p class="course-card-meta">${e(x.code)} · ${e(offer.label)}${x.custom?' · 认定待确认':''}${c?`<a class="text-link" href="${U.base}/courses/${e(x.code)}/" target="_blank" rel="noopener noreferrer" aria-label="查看 ${e(title)} 课程详情（新标签页）">课程详情 ↗</a>`:''}</p><div class="row-controls">${c?.allowed_groups?.length>1?`<label>计入领域<select data-allocation="${e(x.code)}">${c.allowed_groups.map(k=>`<option value="${k}" ${(x.group||c.section_2025[0])===k?'selected':''}>${e(C.courseGroups[k])}</option>`).join('')}</select></label>`:''}<label><span>${x.semester?'移动到':'安排到'}</span><select data-semester="${e(x.code)}" aria-label="${e(title)} 安排学期">${semesterOptions(p,x.semester,c)}</select></label></div>${conflict?`<p class="season-warning">目录仅${e(offer.label)}开课，与当前${season==='winter'?'冬季':'夏季'}安排不符。请核对实际开课。</p>`:offer.state==='unknown'?'<p class="season-unknown">开课季节需另行确认。</p>':''}<label class="check"><input type="checkbox" data-lock="${e(x.code)}" ${x.locked?'checked':''} ${!x.semester?'disabled':''}>自动规划时固定此学期</label><button class="quiet" type="button" data-passed="${e(x.code)}">记为已修通过</button><button class="quiet remove-course" data-remove="${e(x.code)}" aria-label="移除 ${e(title)}">从计划移除</button></div></details>`;
}
function semesterHeading(semester,p){
 const limits=window.RCIPlanning.bounds(p,semester.number),over=semester.credits>limits.maxECTS||semester.items.length>limits.maxExams;
 const items=semester.visibleItems||semester.items,passedCredits=semester.passedCredits||0;
 return `<div class="semester-heading ${semester.season}${over?' over-workload':''}" data-drop-semester="${semester.number}"><div><span class="season-tag">${semester.season==='winter'?'冬季':'夏季'}</span><h3 id="semester-title-${semester.number}">第 ${semester.number} 学期</h3></div><div class="semester-total"><b>${semester.credits+passedCredits}</b><span>ECTS · ${items.length} 门</span>${items.length>semester.items.length?`<small class="semester-status-totals">已通过 ${passedCredits} · 待修 ${semester.credits} ECTS</small>`:''}<small class="workload-hint">${desktopPlanning?.matches?'待修上限':'上限'} ${limits.maxECTS} ECTS / ${limits.maxExams} 项考核${over?' · 已超出':''}</small></div></div>`;
}
function semesterCard(semester,p){
 const conflictCount=semester.conflicts.length,items=semester.visibleItems||semester.items;
 return `<section class="semester-card ${semester.season}" id="semester-${semester.number}" data-drop-semester="${semester.number}" aria-labelledby="semester-title-${semester.number}">${conflictCount?`<p class="semester-alert">${conflictCount} 门课程的目录季节与安排不符</p>`:''}<div class="semester-courses">${items.length?items.map(x=>row(x,p)).join(''):'<p class="semester-placeholder">还没有安排课程</p>'}</div><button type="button" class="semester-add text-link" data-pick-semester="${semester.number}" aria-haspopup="dialog" aria-label="为第 ${semester.number} 学期添加课程">＋ 添加课程</button></section>`;
}
function summary(calc,p){
 const passed=C.calculate(p,db.courses,true).allocated,passedCount=p.items.filter(x=>x.status==='passed').length;
 const counts=desktopPlanning?.matches?`<div class="plan-course-status" role="group" aria-label="课程数量"><span class="plan-course-status-pending">待修 <b>${p.items.length-passedCount}</b> 门</span><span class="plan-course-status-passed">已通过 <b>${passedCount}</b> 门</span></div>`:'';
 return `<section class="plan-progress" aria-labelledby="plan-summary-title"><div class="plan-progress-main"><div class="summary-overview"><h2 id="plan-summary-title">规划学分</h2><div class="summary-total"><b>${calc.allocated}</b><small>/ 120 ECTS</small></div><p class="summary-caption">已修 ${passed} ECTS</p></div><div class="summary-progress">${progress(calc)}${counts}</div></div>${desktopPlanning?.matches?'</section>':''}<details id="summary-gaps" class="summary-gaps"><summary>查看学分缺口与进度</summary><div class="domain-minimums">${['G','H','I'].map(k=>`<span class="${calc.totals[k]>=5?'met':''}">${domainNames[k]}<b>${calc.totals[k]} / 最低 5</b></span>`).join('')}</div><div class="gaps">${gaps(calc,p)}</div><div class="progression-status"><p>按本模型的分类上限预测学期末学分；超额选修不替代缺失必修。实际进度与期限以个人TUMonline学分账户为准。</p>${C.progression(p,db.courses).map(x=>`<span class="${x.met?'met':''}">第 ${x.semester} 学期：${x.semester===2?'A/B/C 至少一门':x.value+' / '+x.required+' ECTS'}${x.unknown?' · 历史时间待核对':x.met?' ✓':x.historical?' · 请核对历史记录':' · 尚未覆盖'}</span>`).join('')}</div><p class="summary-note">${calc.supported?'按所选批次的2024 FPSO／2025修订模拟，不等于学校认定。':p.cohort==='older'?'其他入学批次未包含在当前模型中，请核对学校原文。':'先在计划设置中确认入学批次，再核对结构是否适用。'}${calc.custom?' 含自行录入选修，实际认定待确认。':''}</p></details>${desktopPlanning?.matches?'':'</section>'}`;
}
function syncBoard(source){
 const progress=box.querySelector('.plan-progress'),header=document.querySelector?.('.header');
 box.style.setProperty('--planner-header-height',Math.ceil(header?.getBoundingClientRect().height||65)+'px');
 box.style.setProperty('--plan-progress-height',desktopPlanning?.matches&&progress?Math.ceil(progress.getBoundingClientRect().height)+'px':'0px');
 const head=box.querySelector('.board-head-scroll'),body=box.querySelector('.board-courses-scroll');if(!head||!body)return;
 if(source&&source!==boardScrollOwner)return;
 if(source){const other=source===head?body:head;if(Math.abs(other.scrollLeft-source.scrollLeft)>.5)other.scrollLeft=source.scrollLeft;}
 const max=Math.max(0,body.scrollWidth-body.clientWidth),left=body.scrollLeft;
 box.toggleAttribute('data-board-overflow',max>1);
 box.querySelector('[data-board-step="-1"]').disabled=left<=1;
 box.querySelector('[data-board-step="1"]').disabled=left>=max-1;
}
function clearDrag(){
 draggedCode=null;cancelAnimationFrame(dragFrame);
 box.querySelectorAll('.is-dragging,.drop-active').forEach(el=>el.classList.remove('is-dragging','drop-active'));
}
function autoScrollDrag(){
 const scroller=box.querySelector('.board-courses-scroll');if(!draggedCode||!scroller)return;
 const rect=scroller.getBoundingClientRect();
 if(dragX>=rect.left&&dragX<=rect.right){
  const delta=dragX<rect.left+40?-8:dragX>rect.right-40?8:0;
  if(delta){scroller.scrollLeft+=delta;syncBoard(scroller);}
 }
 dragFrame=requestAnimationFrame(autoScrollDrag);
}
async function moveCourse(code,semester){
 const wasEditing=document.getElementById('plan-course-'+code)?.open;
 const before=await U.plan(),editingPassed=desktopPlanning?.matches&&before.items.some(x=>x.code===code&&x.status==='passed');
 const change=await U.moveCourse(code,semester,{editPassedSemester:!!editingPassed});
 if(change.kind==='cancelled'){await render();return;}
 if(change.kind==='moved'||change.kind==='unchanged'){
  await render();
  const card=document.getElementById('plan-course-'+code);if(card){card.open=false;if(wasEditing)card.querySelector('summary').focus({preventScroll:true});}
  if(editingPassed)card?.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 if(change.kind!=='moved'||!U.persisted)return;
 const p=await U.plan(),destination=change.semester?C.semesterLabel(p.timeline,change.semester):editingPassed?'未记录':'待分配';
 U.toast(editingPassed?`通过学期已改为${destination}。`:`已移到${destination}。`,{label:'撤销',run:async()=>{await U.undoCourse(change);if(U.persisted)U.toast(editingPassed?'已恢复原来的通过学期。':'已恢复原来的学期安排。');}});
}
async function changeStatus(code,status){
 let before,after;
 await U.updatePlan(p=>{
  before=p.items.find(x=>x.code===code);if(!before||before.status===status)return null;
  after={...before,status,locked:false,semester:status==='passed'?before.semester:before.semester>0&&before.semester<=p.timeline.count?before.semester:1};
  return {...p,items:p.items.map(x=>x.code===code?after:x)};
 });
 if(!after||!U.persisted)return;
 await render();
 const card=document.getElementById('plan-course-'+code);if(card){card.open=false;card.querySelector('summary').focus({preventScroll:true});}
 U.toast(status==='passed'?'已标记通过，课程保留在计划中。':'已改为待修。',{label:'撤销',run:async()=>{
  await U.updatePlan(p=>{
   if(JSON.stringify(p.items.find(x=>x.code===code))!==JSON.stringify(after))throw new Error('课程已有后续修改，请手动调整状态。');
   if(before.status==='planned'&&before.semester>p.timeline.count)throw new Error('原学期已不在规划范围，请手动调整状态。');
   return {...p,items:p.items.map(x=>x.code===code?before:x)};
  });
  if(U.persisted)U.toast('已恢复原来的课程状态。');
 }});
}
async function render(){
 const id=++renderId,active=document.activeElement;
 const focusKey=active?.id?{id:active.id}:active?.dataset.semester?{semester:active.dataset.semester}:active?.closest('#custom-plan')&&active.name?{customField:active.name,start:active.selectionStart,end:active.selectionEnd}:null;
 const customDraft=[...box.querySelectorAll('#custom-plan [name]')].map(el=>[el.name,el.value]);
 const openDetails=[...box.querySelectorAll('details[open]')].map(el=>el.id);
 const summaryOpen=box.querySelector('#summary-gaps')?.open;
 const boardLeft=box.querySelector('.board-courses-scroll')?.scrollLeft||0;
 let p=await U.plan();if(id!==renderId)return;
 if(desktopPlanning?.matches&&p.items.some(x=>x.status==='planned'&&x.semester===0)){await U.assignUnscheduled();if(id!==renderId)return;p=await U.plan();if(id!==renderId)return;}
 const calc=C.calculate(p,db.courses),schedule=C.schedule(p,db.courses);
 const future=p.items.filter(x=>x.status==='planned'),assigned=future.length-schedule.unassigned.items.length;
 const passed=p.items.filter(x=>x.status==='passed');
 const semesters=desktopPlanning?.matches?schedule.semesters.map(n=>({...n,visibleItems:p.items.filter(x=>x.semester===n.number),passedCredits:passed.filter(x=>x.semester===n.number).reduce((sum,x)=>sum+Number(x.custom?x.ects:known.get(x.code)?.ects),0)})):schedule.semesters;
 const otherPassed=desktopPlanning?.matches?passed.filter(x=>!x.semester||x.semester>p.timeline.count):[];
 const history=otherPassed.length?`<section class="passed-history" aria-labelledby="passed-history-title"><h3 id="passed-history-title">其他已通过课程</h3><p class="meta">通过学期未记录，或在当前 ${p.timeline.count} 个学期之外。</p><div class="passed-history-grid">${otherPassed.map(x=>row(x,p)).join('')}</div></section>`:'';
 const unassigned=schedule.unassigned.items.length?`<details class="unassigned-courses" id="unassigned" data-drop-semester="0" aria-labelledby="unassigned-title"><summary class="unassigned-heading" id="unassigned-title">待分配 <span>${schedule.unassigned.items.length} 门 · ${schedule.unassigned.credits} ECTS</span><small>展开安排</small></summary><div class="unassigned-grid">${schedule.unassigned.items.map(x=>row(x,p)).join('')}</div></details>`:'';
 box.innerHTML=`${summary(calc,p)}<div class="planner-main"><div class="plan-tools semester-tools"><h2 id="semester-board-title">学期安排${desktopPlanning?.matches?'':` <span>${future.length?`${assigned} / ${future.length} 门未来课程已分配`:'按自己的节奏安排课程'}</span>`}</h2><div class="board-navigation" aria-label="查看其他学期"><button class="quiet" data-board-step="-1" aria-label="向左查看学期" aria-controls="semester-board-courses">←</button><button class="quiet" data-board-step="1" aria-label="向右查看学期" aria-controls="semester-board-courses">→</button></div></div>${unassigned}${desktopPlanning?.matches?'':`<p class="board-hint"><span class="board-drag-hint">${!p.items.length?'点「添加课程」开始，或试试自动规划。':'拖动课程，或点课程调整学期。'}</span><span class="board-swipe-hint">左右滑动查看其他学期。</span></p>`}<div class="semester-board"><div class="board-headers"><div class="board-head-scroll"><div class="semester-head-track">${semesters.map(n=>semesterHeading(n,p)).join('')}</div></div></div><div class="board-courses-scroll" id="semester-board-courses" tabindex="0" role="region" aria-labelledby="semester-board-title"><div class="semester-grid">${semesters.map(semester=>semesterCard(semester,p)).join('')}</div></div></div>${history}<details id="custom-options" class="supplement"><summary>课程不在目录里？添加自己的选修</summary><p>仅支持 G/H/I/J 选修，归类与学分由你填写，认定需要学校确认。</p><form id="custom-plan" class="custom-form"><label>模块代码<input name="code" maxlength="60" required></label><label>课程名称<input name="name" maxlength="160" required></label><label>ECTS<input name="ects" type="number" min="0.5" max="30" step="0.5" required></label><label>所属领域<select name="group">${['G','H','I','J'].map(k=>`<option value="${k}">${e(C.courseGroups[k])}</option>`).join('')}</select></label><button class="button" type="submit">加入计划</button></form></details></div>`;
 for(const bar of box.querySelectorAll('[data-credit-share]')){bar.parentElement.style.flexGrow=bar.dataset.creditShare;bar.parentElement.style.setProperty('--credit-filled',100*bar.value/bar.max+'%');}
 box.querySelector('.semester-board').style.setProperty('--semester-count',String(p.timeline.count));
 box.querySelector('#summary-gaps').open=summaryOpen??false;
 const scrollers=[box.querySelector('.board-head-scroll'),box.querySelector('.board-courses-scroll')];
 boardScrollOwner=scrollers[1];
 for(const scroller of scrollers){
  scroller.scrollLeft=boardLeft;
  for(const type of ['pointerdown','touchstart','wheel','focusin'])scroller.addEventListener(type,()=>{boardScrollOwner=scroller;},{passive:true});
  scroller.addEventListener('scroll',()=>syncBoard(scroller),{passive:true});
 }
 syncBoard();
 for(const detailId of openDetails){const el=document.getElementById(detailId);if(el)el.open=true;}
 const customForm=box.querySelector('#custom-plan');for(const [name,value] of customDraft){const field=customForm.elements.namedItem(name);if(field)field.value=value;}
 if(focusKey){const target=focusKey.id?document.getElementById(focusKey.id):focusKey.customField?customForm.elements.namedItem(focusKey.customField):box.querySelector(`[data-semester="${focusKey.semester}"]`);if(target){target.focus({preventScroll:true});if(focusKey.customField&&target.type==='text'&&Number.isInteger(focusKey.start))target.setSelectionRange(focusKey.start,focusKey.end);}}
}
window.addEventListener('rci:planchange',()=>render().catch(err=>U.toast(err.message)));
window.addEventListener('resize',()=>syncBoard());
desktopPlanning?.addEventListener('change',()=>render().catch(err=>U.toast(err.message)));
if(window.ResizeObserver)new ResizeObserver(()=>syncBoard()).observe(box);
box.addEventListener('dragstart',ev=>{
 const item=ev.target.closest('[data-plan-course]');
 if(!item||item.getAttribute('draggable')==='false'||ev.target.closest('a,button,select,input,label')){ev.preventDefault();return;}
 draggedCode=item.dataset.planCourse;dragX=ev.clientX;
 ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',draggedCode);
 item.classList.add('is-dragging');dragFrame=requestAnimationFrame(autoScrollDrag);
});
box.addEventListener('dragover',ev=>{
 if(!draggedCode)return;dragX=ev.clientX;
 const target=ev.target.closest('[data-drop-semester]');
 box.querySelectorAll('.drop-active').forEach(el=>el.classList.remove('drop-active'));
 if(!target)return;ev.preventDefault();ev.dataTransfer.dropEffect='move';
 box.querySelectorAll(`[data-drop-semester="${target.dataset.dropSemester}"]`).forEach(el=>el.classList.add('drop-active'));
});
box.addEventListener('dragleave',ev=>{
 const target=ev.target.closest('[data-drop-semester]');
 if(target&&!target.contains(ev.relatedTarget))box.querySelectorAll('.drop-active').forEach(el=>el.classList.remove('drop-active'));
});
box.addEventListener('dragend',clearDrag);
box.addEventListener('drop',async ev=>{
 const target=ev.target.closest('[data-drop-semester]');if(!draggedCode||!target)return;
 ev.preventDefault();const code=draggedCode,semester=Number(target.dataset.dropSemester);clearDrag();
 try{await moveCourse(code,semester);}catch(err){U.toast(err.message);await render();}
});
box.addEventListener('change',async ev=>{
 try{
  const el=ev.target;
  if(el.hasAttribute('data-allocation'))await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===el.dataset.allocation?{...x,group:el.value}:x)}));
  if(el.hasAttribute('data-lock'))await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===el.dataset.lock?{...x,locked:el.checked}:x)}));
  if(el.hasAttribute('data-semester')){
   await moveCourse(el.dataset.semester,Number(el.value));
  }

 }catch(err){U.toast(err instanceof SyntaxError?'文件内容不是有效的计划 JSON。当前计划未修改。':err.message);if(ev.target.hasAttribute('data-semester'))await render();}
});
box.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 try{
  if(b.hasAttribute('data-board-step')){
   const scroller=box.querySelector('.board-courses-scroll'),column=box.querySelector('.semester-heading');
   boardScrollOwner=scroller;
   scroller.scrollBy({left:Number(b.dataset.boardStep)*(column.getBoundingClientRect().width+14),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  if(b.hasAttribute('data-passed')){
   if(desktopPlanning?.matches)await changeStatus(b.dataset.passed,'passed');
   else await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===b.dataset.passed?{...x,status:'passed',locked:false}:x)}));
  }
  if(b.hasAttribute('data-unpass')&&desktopPlanning?.matches)await changeStatus(b.dataset.unpass,'planned');
  if(b.hasAttribute('data-remove')){
   let removed,related;
   await U.updatePlan(p=>{removed=p.items.find(x=>x.code===b.dataset.remove);related={desired:p.preferences.desired.includes(b.dataset.remove),excluded:p.preferences.excluded.includes(b.dataset.remove),events:p.timetable.events.filter(x=>x.code===b.dataset.remove)};if(!removed?.custom)return {...p,items:p.items.filter(x=>x.code!==b.dataset.remove)};return {...p,items:p.items.filter(x=>x.code!==b.dataset.remove),preferences:{...p.preferences,desired:p.preferences.desired.filter(code=>code!==b.dataset.remove),excluded:p.preferences.excluded.filter(code=>code!==b.dataset.remove)},timetable:{...p.timetable,events:p.timetable.events.filter(x=>x.code!==b.dataset.remove)}};});
   if(removed&&U.persisted)U.toast(related.desired?'已从看板移除；想选偏好仍在，自动规划会再次加入。':'已移除课程。',{label:'撤销',run:async()=>{await U.updatePlan(p=>p.items.some(x=>x.code===removed.code)?null:{...p,items:[...p.items,{...removed,semester:removed.semester<=p.timeline.count?removed.semester:0}],...(removed.custom?{preferences:{...p.preferences,desired:related.desired?[...p.preferences.desired,removed.code]:p.preferences.desired,excluded:related.excluded?[...p.preferences.excluded,removed.code]:p.preferences.excluded},timetable:{...p.timetable,events:[...p.timetable.events,...related.events.filter(x=>!p.timetable.events.some(y=>y.id===x.id))]}}:{})});if(U.persisted)U.toast('课程已恢复。');}});
  }

 }catch(err){U.toast(err.message);}
});
box.addEventListener('submit',async ev=>{
 if(ev.target.id!=='custom-plan')return;ev.preventDefault();
 try{
  const f=new FormData(ev.target),code=String(f.get('code')).trim().toUpperCase();
  if(known.has(code))throw new Error('此模块已在目录里，请从课程页添加');
  await U.updatePlan(p=>({...p,items:[...p.items,{code,name:String(f.get('name')),ects:Number(f.get('ects')),group:f.get('group'),status:'planned',custom:true,semester:desktopPlanning?.matches?1:0}]}));
  await render();box.querySelector('#custom-plan').reset();
  if(U.persisted)U.toast('选修已加入，实际认定请向学校确认。');
 }catch(err){U.toast(err.message);}
});
})();
