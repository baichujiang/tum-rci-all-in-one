/* The student's own plan. Uses the existing validated rules and v2 storage format. */
(async function(){
'use strict';
const U=window.RCIUI,C=window.RCI,T=window.RCITimetable,e=C.esc,box=document.getElementById('planner');if(!box)return;
let db,known,renderId=0,draggedCode=null,dragFrame=0,dragX=0,boardScrollOwner=null;
const domainNames=C.courseGroups;
try{db=await U.data();known=new Map(db.courses.map(c=>[c.module_code,c]));await render();}catch(err){box.innerHTML='<div class="empty"><h2>暂时无法读取计划</h2><p>'+e(err.message)+'。已有记录没有覆盖，请先备份再重试。</p><button class="button" type="button" data-backup-open>备份与恢复</button> <a class="button secondary" href="'+U.base+'/courses/">先浏览课程</a></div>';return;}
function progress(calc){return calc.buckets.map(([name,value,target],i)=>`<div class="progress-row"><div><span>${e(name)}<small class="original-label">${e(C.creditOriginalNames[i])}</small></span><b>${Math.min(value,target)} / ${target}</b></div><progress max="${target}" value="${Math.min(value,target)}" aria-label="${e(name)} ${e(C.creditOriginalNames[i])} ${Math.min(value,target)} / ${target} ECTS"></progress></div>`).join('');}
function gaps(calc,p){
 if(!p.items.length)return '<p>加入课程后，查看各类别还需要多少学分。</p>';
 const keys=['core','professional','J','F','K'];
 let links=(!p.conditionalConfirmed?'<p>个人补修条件未确认，暂不判断规则达成。</p>':'')+(p.conditional&&!C.amended(p.cohort)?'<p>此批次的入学附加考试需单独核对，不能套用 K 学分减免。</p>':'')+calc.buckets.map(([label,value,target],i)=>value<target?`<a class="gap-link" href="${U.base}/courses/?group=${keys[i]}"><span>${e(label)}还差 <b>${target-value}</b> ECTS</span><span aria-hidden="true">→</span></a>`:'').join('');
 for(const k of ['G','H','I'])if(calc.totals[k]<5)links+=`<a class="gap-link" href="${U.base}/courses/?group=${k}"><span>${domainNames[k]}领域还差 <b>${5-calc.totals[k]}</b> ECTS</span><span aria-hidden="true">→</span></a>`;
 if(!p.conditional&&calc.totals.K>0)links+='<p>控制理论未计入，请核对补修设置。</p>';
 return links||'<p>规划已覆盖本模型的学分要求。课程认定请在学校系统核对。</p>';
}
function semesterOptions(p,selected,course){
 return `<option value="0" ${selected===0?'selected':''}>待分配</option>`+Array.from({length:p.timeline.count},(_,i)=>{
  const n=i+1,season=C.semesterSeason(p.timeline,n),conflict=C.offering(course,season).state==='conflict';
  return `<option value="${n}" ${selected===n?'selected':''}>第 ${n} · ${season==='winter'?'冬季':'夏季'}${conflict?'（目录不符）':''}</option>`;
 }).join('');
}
function row(x,p){
 const c=known.get(x.code),title=c?c.module_name_legal_2025:x.name,translation=c?db.names[x.code]||'':'',credits=c?c.ects:x.ects;
 const season=x.semester?C.semesterSeason(p.timeline,x.semester):null,offer=T?T.offering(p,c,x.semester,db.details||{}):C.offering(c,season),conflict=!!season&&offer.state==='conflict';
 return `<details class="plan-row scheduled-row course-card${conflict?' has-conflict':''}" id="plan-course-${e(x.code)}" data-plan-course="${e(x.code)}" draggable="true"><summary class="course-card-summary" id="plan-course-toggle-${e(x.code)}" aria-label="${e(title)}，${e(credits)} ECTS，调整学期${conflict?'，目录季节不符':''}"><span class="course-drag" aria-hidden="true">⠿</span><span class="course-card-title">${e(title)}</span><span class="course-card-credits">${e(credits)} <small>ECTS</small></span>${conflict?'<span class="course-card-alert">冬夏季节需核对</span>':''}</summary><div class="course-card-actions">${translation?`<p class="course-card-translation">${e(translation)}</p>`:''}<p class="course-card-meta">${e(x.code)} · ${e(offer.label)}${x.custom?' · 认定待确认':''}${c?`<a class="text-link" href="${U.base}/courses/${e(x.code)}/" target="_blank" rel="noopener noreferrer" aria-label="查看 ${e(title)} 课程详情（新标签页）">课程详情 ↗</a>`:''}</p><div class="row-controls">${c?.allowed_groups?.length>1?`<label>计入领域<select data-allocation="${e(x.code)}">${c.allowed_groups.map(k=>`<option value="${k}" ${(x.group||c.section_2025[0])===k?'selected':''}>${e(C.courseGroups[k])}</option>`).join('')}</select></label>`:''}<label><span>${x.semester?'移动到':'安排到'}</span><select data-semester="${e(x.code)}" aria-label="${e(title)} 安排学期">${semesterOptions(p,x.semester,c)}</select></label></div>${conflict?`<p class="season-warning">目录仅${e(offer.label)}开课，与当前${season==='winter'?'冬季':'夏季'}安排不符。请核对实际开课。</p>`:offer.state==='unknown'?'<p class="season-unknown">开课季节需另行确认。</p>':''}<label class="check"><input type="checkbox" data-lock="${e(x.code)}" ${x.locked?'checked':''} ${!x.semester?'disabled':''}>自动规划时固定此学期</label><button class="quiet" type="button" data-passed="${e(x.code)}">记为已修通过</button><button class="quiet remove-course" data-remove="${e(x.code)}" aria-label="移除 ${e(title)}">从计划移除</button></div></details>`;
}
function semesterHeading(semester,p){
 const limits=window.RCIPlanning.bounds(p,semester.number),over=semester.credits>limits.maxECTS||semester.items.length>limits.maxExams;
 return `<div class="semester-heading ${semester.season}${over?' over-workload':''}" data-drop-semester="${semester.number}"><div><span class="season-tag">${semester.season==='winter'?'冬季':'夏季'}</span><h3 id="semester-title-${semester.number}">第 ${semester.number} 学期</h3></div><div class="semester-total"><b>${semester.credits}</b><span>ECTS · ${semester.items.length} 门</span><small class="workload-hint">上限 ${limits.maxECTS} ECTS / ${limits.maxExams} 项考核${over?' · 已超出':''}</small></div></div>`;
}
function semesterCard(semester,p){
 const conflictCount=semester.conflicts.length;
 return `<section class="semester-card ${semester.season}" id="semester-${semester.number}" data-drop-semester="${semester.number}" aria-labelledby="semester-title-${semester.number}">${conflictCount?`<p class="semester-alert">${conflictCount} 门课程的目录季节与安排不符</p>`:''}<div class="semester-courses">${semester.items.length?semester.items.map(x=>row(x,p)).join(''):'<p class="semester-placeholder">还没有安排课程</p>'}</div><button type="button" class="semester-add text-link" data-pick-semester="${semester.number}" aria-haspopup="dialog" aria-label="为第 ${semester.number} 学期添加课程">＋ 添加课程</button></section>`;
}
function summary(calc,p){
 return `<section class="panel plan-summary board-summary" aria-labelledby="plan-summary-title"><div class="summary-overview"><h2 id="plan-summary-title">规划学分</h2><div class="summary-total"><b>${calc.allocated}</b><small>/ 120 ECTS</small></div></div><div class="summary-progress">${progress(calc)}</div><div class="progression-status"><span>按计划预测学期末学分；实际期限只认已修成绩。</span>${C.progression(p,db.courses).map(x=>`<span class="${x.met?'met':''}">第 ${x.semester} 学期：${x.semester===2?'A/B/C 至少一门':x.value+' / '+x.required+' ECTS'}${x.unknown?' · 历史时间待核对':x.met?' ✓':x.historical?' · 请核对历史记录':' · 尚未覆盖'}</span>`).join('')}</div><p class="summary-caption">已修 ${C.calculate(p,db.courses,true).allocated} ECTS · 已选课程计入</p><details id="summary-gaps" class="summary-gaps"><summary>查看分类学分缺口</summary><div class="domain-minimums">${['G','H','I'].map(k=>`<span class="${calc.totals[k]>=5?'met':''}">${domainNames[k]}<b>${calc.totals[k]} / 最低 5</b></span>`).join('')}</div><div class="gaps">${gaps(calc,p)}</div><p class="summary-note">${calc.supported?'按所选批次的 2024 FPSO／2025 修订模拟，不等于学校认定。':p.cohort==='older'?'其他入学批次未包含在当前模型中，请核对学校原文。':'先确认入学批次，再核对上述结构是否适用。'}${calc.custom?' 含自行录入选修，实际认定待确认。':''}</p></details></section>`;
}
function syncBoard(source){
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
 const change=await U.moveCourse(code,semester);
 if(change.kind==='cancelled'){await render();return;}
 if(change.kind==='moved'||change.kind==='unchanged'){
  const card=document.getElementById('plan-course-'+code);if(card){card.open=false;if(wasEditing)card.querySelector('summary').focus({preventScroll:true});}
 }
 if(change.kind!=='moved'||!U.persisted)return;
 const p=await U.plan(),destination=semester?C.semesterLabel(p.timeline,semester):'待分配';
 U.toast(`已移到${destination}。`,{label:'撤销',run:async()=>{await U.undoCourse(change);if(U.persisted)U.toast('已恢复原来的学期安排。');}});
}
async function render(){
 const id=++renderId,active=document.activeElement;
 const focusKey=active?.id?{id:active.id}:active?.dataset.semester?{semester:active.dataset.semester}:active?.closest('#custom-plan')&&active.name?{customField:active.name,start:active.selectionStart,end:active.selectionEnd}:null;
 const customDraft=[...box.querySelectorAll('#custom-plan [name]')].map(el=>[el.name,el.value]);
 const openDetails=[...box.querySelectorAll('details[open]')].map(el=>el.id);
 const summaryOpen=box.querySelector('#summary-gaps')?.open;
 const boardLeft=box.querySelector('.board-courses-scroll')?.scrollLeft||0;
 const p=await U.plan();if(id!==renderId)return;
 const calc=C.calculate(p,db.courses),schedule=C.schedule(p,db.courses);
 const future=p.items.filter(x=>x.status==='planned'),assigned=future.length-schedule.unassigned.items.length;
 const unassigned=schedule.unassigned.items.length?`<section class="unassigned-courses" id="unassigned" data-drop-semester="0" aria-labelledby="unassigned-title"><div class="unassigned-heading"><h3 id="unassigned-title">待分配 <span>${schedule.unassigned.items.length} 门 · ${schedule.unassigned.credits} ECTS</span></h3><p>点课程选择学期，或拖入下方对应列。</p></div><div class="unassigned-grid">${schedule.unassigned.items.map(x=>row(x,p)).join('')}</div></section>`:'';
 box.innerHTML=`<div class="planner-overview"><section class="timeline-settings" aria-labelledby="timeline-settings-title"><div class="timeline-title"><h2 id="timeline-settings-title">学期设置</h2><div class="timeline-meta"><span class="save-state"><span class="save-dot"></span>${U.persisted?'保存在此浏览器':'仅本次页面有效，请导出备份'}</span><a class="text-link" href="${U.base}/feedback/?type=feature&from=/planner/">规划有建议？</a></div></div><div class="timeline-controls"><label>计划读几个学期<select id="plan-semester-count">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${p.timeline.count===i+1?'selected':''}>${i+1} 个学期</option>`).join('')}</select></label><label>第 1 学期从哪一季开始<select id="plan-start-term"><option value="winter" ${p.timeline.start==='winter'?'selected':''}>冬季学期</option><option value="summer" ${p.timeline.start==='summer'?'selected':''}>夏季学期</option></select></label><p class="timeline-average">120 ECTS 分 ${p.timeline.count} 学期，平均 <b>${Number((120/p.timeline.count).toFixed(1))} ECTS / 学期</b><small>只作分配参考，可以按自己的节奏调整。</small></p></div><p class="timeline-note">冬夏交替；优先采用对应学期的公开教学记录；其余按目录季节推算，未来开课与名额需核对。</p></section>${summary(calc,p)}</div><div class="planner-main"><div class="plan-tools semester-tools"><h2 id="semester-board-title">学期安排 <span>${assigned} / ${future.length} 门未来课程已分配</span></h2><div class="board-navigation" aria-label="查看其他学期"><button class="quiet" data-board-step="-1" aria-label="向左查看学期" aria-controls="semester-board-courses">←</button><button class="quiet" data-board-step="1" aria-label="向右查看学期" aria-controls="semester-board-courses">→</button></div><button type="button" class="quiet" data-backup-open>备份与迁移</button>${p.items.length?'<button class="quiet" data-clear>清空</button>':''}</div>${!p.items.length?'<p class="schedule-intro">点学期卡片上的「添加课程」，直接挑选并加入。</p>':''}${unassigned}<p class="board-hint"><span class="board-drag-hint">拖动课程，或点课程调整学期。</span><span class="board-swipe-hint">左右滑动查看学期，点课程调整安排。</span></p><div class="semester-board"><div class="board-headers"><div class="board-head-scroll"><div class="semester-head-track">${schedule.semesters.map(n=>semesterHeading(n,p)).join('')}</div></div></div><div class="board-courses-scroll" id="semester-board-courses" tabindex="0" role="region" aria-labelledby="semester-board-title"><div class="semester-grid">${schedule.semesters.map(semester=>semesterCard(semester,p)).join('')}</div></div></div><details id="plan-options" class="supplement"><summary>入学批次、补修与规则说明</summary><label class="cohort-setting">我的入学批次<select id="plan-cohort">${[['unknown','尚未确认'],...C.cohorts.map(v=>[v,v+'入学']),['older','其他批次（不判断达成）']].map(([v,t])=>`<option value="${e(v)}" ${p.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select></label><p>按个人录取条件确认是否需要补修。2025/26冬季起批次开启补修后，专业选修从41调整为36 ECTS；此前批次不能套用此减免。</p><label class="checklist-item"><input id="plan-conditional" type="checkbox" ${p.conditional?'checked':''}><span>我已核对：需要补修 ED140014 控制理论</span></label><p>2024 FPSO、2025 修订 PDF 与官方学习计划已于 2026-10-13 对照；独立人工复核待完成。未确认或不支持的入学批次不作达成判断。实际开课、考试登记、课程认定和毕业资格以学校为准。</p><a href="${U.base}/study/#credits">查看学分结构与来源 →</a></details><details id="custom-options" class="supplement"><summary>课程不在目录里？添加自己的选修</summary><p>仅支持 G/H/I/J 选修，归类与学分由你填写，认定需要学校确认。</p><form id="custom-plan" class="custom-form"><label>模块代码<input name="code" maxlength="60" required></label><label>课程名称<input name="name" maxlength="160" required></label><label>ECTS<input name="ects" type="number" min="0.5" max="30" step="0.5" required></label><label>所属领域<select name="group">${['G','H','I','J'].map(k=>`<option value="${k}">${e(C.courseGroups[k])}</option>`).join('')}</select></label><button class="button" type="submit">加入计划</button></form></details><p class="plan-rule-note">计划、收藏只在当前浏览器保存。换设备或清理浏览器前，请导出备份；个人计划请保存在自己的设备。</p></div>`;
 box.querySelector('.semester-board').style.setProperty('--semester-count',String(p.timeline.count));
 // Desktop helpers use the existing controls and never change the plan schema.
 const cohortLink=document.createElement('a');
 cohortLink.className='text-link desktop-only desktop-cohort';cohortLink.href='#plan-options';cohortLink.dataset.planRuleOpen='';
 cohortLink.textContent=p.cohort==='unknown'?'入学批次尚未确认 →':p.cohort==='older'?'其他入学批次 →':`入学批次：${p.cohort} →`;
 box.querySelector('.timeline-meta').prepend(cohortLink);
 const swipeHint=box.querySelector('.board-swipe-hint');
 swipeHint.innerHTML='<span class="desktop-only">左右滚动查看其他学期。</span><span class="desktop-legacy">'+e(swipeHint.textContent)+'</span>';
 box.querySelector('#summary-gaps').open=summaryOpen??window.matchMedia('(min-width: 961px)').matches;
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
if(window.ResizeObserver)new ResizeObserver(()=>syncBoard()).observe(box);
box.addEventListener('dragstart',ev=>{
 const item=ev.target.closest('[data-plan-course]');
 if(!item||ev.target.closest('a,button,select,input,label')){ev.preventDefault();return;}
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
  if(el.id==='plan-start-term'){
   await U.updatePlan(p=>({...p,timeline:{...p.timeline,start:el.value}}));
   U.toast('起始季节已更新，冬夏安排已重新检查。');
  }
  if(el.id==='plan-semester-count'){
   const count=Number(el.value);
   await U.updatePlan(async p=>{
    const displaced=p.items.filter(x=>x.semester>count);
    if(displaced.length&&!await U.confirmAction(`改为 ${count} 个学期？`,`${displaced.length} 门课原本安排在之后的学期，会移到「待分配」。课程和学分都会保留。`,'保留课程并调整')){await render();return null;}
    return {...p,timeline:{...p.timeline,count},preferences:{...p.preferences,startSemester:Math.min(count,p.preferences.startSemester)},items:p.items.map(x=>x.semester>count?{...x,semester:0}:x)};
   });
  }
  if(el.hasAttribute('data-allocation'))await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===el.dataset.allocation?{...x,group:el.value}:x)}));
  if(el.hasAttribute('data-lock'))await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===el.dataset.lock?{...x,locked:el.checked}:x)}));
  if(el.hasAttribute('data-semester')){
   await moveCourse(el.dataset.semester,Number(el.value));
  }
  if(el.id==='plan-cohort')await U.updatePlan(p=>({...p,cohort:el.value,timeline:{...p.timeline,start:C.cohorts.includes(el.value)?el.value.endsWith('夏季')?'summer':'winter':p.timeline.start}}));
  if(el.id==='plan-conditional')await U.updatePlan(p=>({...p,conditional:el.checked,conditionalConfirmed:true}));

 }catch(err){U.toast(err instanceof SyntaxError?'文件内容不是有效的计划 JSON。当前计划未修改。':err.message);if(ev.target.hasAttribute('data-semester'))await render();}
});
box.addEventListener('click',async ev=>{
 if(ev.target.closest('[data-plan-rule-open]'))document.getElementById('plan-options').open=true;
 const b=ev.target.closest('button');if(!b)return;
 try{
  if(b.hasAttribute('data-board-step')){
   const scroller=box.querySelector('.board-courses-scroll'),column=box.querySelector('.semester-heading');
   boardScrollOwner=scroller;
   scroller.scrollBy({left:Number(b.dataset.boardStep)*(column.getBoundingClientRect().width+14),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  if(b.hasAttribute('data-passed'))await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===b.dataset.passed?{...x,status:'passed',locked:false}:x)}));
  if(b.hasAttribute('data-remove')){
   let removed,related;
   await U.updatePlan(p=>{removed=p.items.find(x=>x.code===b.dataset.remove);related={desired:p.preferences.desired.includes(b.dataset.remove),excluded:p.preferences.excluded.includes(b.dataset.remove),events:p.timetable.events.filter(x=>x.code===b.dataset.remove)};if(!removed?.custom)return {...p,items:p.items.filter(x=>x.code!==b.dataset.remove)};return {...p,items:p.items.filter(x=>x.code!==b.dataset.remove),preferences:{...p.preferences,desired:p.preferences.desired.filter(code=>code!==b.dataset.remove),excluded:p.preferences.excluded.filter(code=>code!==b.dataset.remove)},timetable:{...p.timetable,events:p.timetable.events.filter(x=>x.code!==b.dataset.remove)}};});
   if(removed&&U.persisted)U.toast(related.desired?'已从看板移除；想选偏好仍在，自动规划会再次加入。':'已移除课程。',{label:'撤销',run:async()=>{await U.updatePlan(p=>p.items.some(x=>x.code===removed.code)?null:{...p,items:[...p.items,{...removed,semester:removed.semester<=p.timeline.count?removed.semester:0}],...(removed.custom?{preferences:{...p.preferences,desired:related.desired?[...p.preferences.desired,removed.code]:p.preferences.desired,excluded:related.excluded?[...p.preferences.excluded,removed.code]:p.preferences.excluded},timetable:{...p.timetable,events:[...p.timetable.events,...related.events.filter(x=>!p.timetable.events.some(y=>y.id===x.id))]}}:{})});if(U.persisted)U.toast('课程已恢复。');}});
  }
  if(b.hasAttribute('data-clear')&&await U.clearPlan()&&U.persisted)U.toast('计划已清空，可以重新开始。');

 }catch(err){U.toast(err.message);}
});
box.addEventListener('submit',async ev=>{
 if(ev.target.id!=='custom-plan')return;ev.preventDefault();
 try{
  const f=new FormData(ev.target),code=String(f.get('code')).trim().toUpperCase();
  if(known.has(code))throw new Error('此模块已在目录里，请从课程页添加');
  await U.updatePlan(p=>({...p,items:[...p.items,{code,name:String(f.get('name')),ects:Number(f.get('ects')),group:f.get('group'),status:'planned',custom:true}]}));
  await render();box.querySelector('#custom-plan').reset();
  if(U.persisted)U.toast('选修已加入，实际认定请向学校确认。');
 }catch(err){U.toast(err.message);}
});
})();
