/* The student's own plan. Uses the existing validated rules and v2 storage format. */
(async function(){
'use strict';
const U=window.RCIUI,C=window.RCI,e=C.esc,box=document.getElementById('planner');if(!box)return;
let db,known,renderId=0;
const domainNames={G:'计算',H:'机械',I:'系统与控制'};
try{db=await U.data();known=new Map(db.courses.map(c=>[c.module_code,c]));await render();}catch(err){box.innerHTML='<div class="empty"><h2>暂时无法读取计划</h2><p>'+e(err.message)+'。已有记录没有覆盖，请先备份再重试。</p><a class="button secondary" href="'+U.base+'/courses/">先浏览课程</a></div>';return;}
function progress(calc){return calc.buckets.map(([name,value,target])=>`<div class="progress-row"><div><span>${e(name)}</span><b>${Math.min(value,target)} / ${target}</b></div><progress max="${target}" value="${Math.min(value,target)}" aria-label="${e(name)} ${Math.min(value,target)} / ${target} ECTS"></progress></div>`).join('');}
function gaps(calc,p){
 if(!p.items.length)return '<p>加入课程后，查看各类别还需要多少学分。</p>';
 const keys=['core','professional','J','F','K'];
 let links=calc.buckets.map(([label,value,target],i)=>value<target?`<a class="gap-link" href="${U.base}/courses/?group=${keys[i]}"><span>${e(label)}还差 <b>${target-value}</b> ECTS</span><span aria-hidden="true">→</span></a>`:'').join('');
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
 const c=known.get(x.code),title=c?(db.names[x.code]||c.module_name_legal_2025):x.name;
 const season=x.semester?C.semesterSeason(p.timeline,x.semester):null,offer=C.offering(c,season),conflict=!!season&&offer.state==='conflict';
 return `<div class="plan-row scheduled-row${conflict?' has-conflict':''}" data-plan-course="${e(x.code)}"><div class="row-course"><b>${c?`<a href="${U.base}/courses/${e(x.code)}/">${e(title)}</a>`:e(title)}</b><p class="meta">${e(x.code)} · ${e(c?c.ects:x.ects)} ECTS${x.custom?' · 认定待确认':''}</p><p class="offering-label">${e(offer.label)}${c?' · 目录':''}</p></div><button class="quiet remove-course" data-remove="${e(x.code)}" aria-label="移除 ${e(title)}">×</button><div class="row-controls"><label><span>${x.semester?'移动到':'安排到'}</span><select data-semester="${e(x.code)}" aria-label="${e(title)} 安排学期">${semesterOptions(p,x.semester,c)}</select></label></div>${conflict?`<p class="season-warning">目录仅${e(offer.label)}开课，与当前${season==='winter'?'冬季':'夏季'}安排不符。请核对实际开课。</p>`:offer.state==='unknown'?'<p class="season-unknown">开课季节需另行确认。</p>':''}</div>`;
}
function semesterCard(semester,p){
 const conflictCount=semester.conflicts.length;
 return `<section class="semester-card ${semester.season}" id="semester-${semester.number}" aria-labelledby="semester-title-${semester.number}"><div class="semester-heading"><div><span class="season-tag">${semester.season==='winter'?'冬季':'夏季'}</span><h3 id="semester-title-${semester.number}">第 ${semester.number} 学期</h3></div><div class="semester-total"><b>${semester.credits}</b><span>ECTS · ${semester.items.length} 门</span></div></div>${conflictCount?`<p class="semester-alert">${conflictCount} 门课程的目录季节与安排不符</p>`:''}<div class="semester-courses">${semester.items.length?semester.items.map(x=>row(x,p)).join(''):'<p class="semester-placeholder">还没有安排课程</p>'}</div><button type="button" class="semester-add text-link" data-pick-semester="${semester.number}" aria-haspopup="dialog" aria-label="为第 ${semester.number} 学期添加课程">＋ 添加课程</button></section>`;
}
async function render(){
 const id=++renderId,active=document.activeElement;
 const focusKey=active?.id?{id:active.id}:active?.dataset.semester?{semester:active.dataset.semester}:null;
 const openDetails=[...box.querySelectorAll('details[open]')].map(el=>el.id);
 const p=await U.plan();if(id!==renderId)return;
 const calc=C.calculate(p,db.courses),schedule=C.schedule(p,db.courses);
 const assigned=p.items.length-schedule.unassigned.items.length;
 const unassigned=schedule.unassigned.items.length?`<section class="unassigned-courses" id="unassigned" aria-labelledby="unassigned-title"><div class="unassigned-heading"><h3 id="unassigned-title">待分配 <span>${schedule.unassigned.items.length} 门 · ${schedule.unassigned.credits} ECTS</span></h3><p>选择每门课的学期，把它放到下面的安排里。</p></div><div class="unassigned-grid">${schedule.unassigned.items.map(x=>row(x,p)).join('')}</div></section>`:'';
 box.innerHTML=`<section class="timeline-settings" aria-labelledby="timeline-settings-title"><div class="timeline-title"><h2 id="timeline-settings-title">按你的节奏，分学期安排。</h2><div class="timeline-meta"><span class="save-state"><span class="save-dot"></span>${U.persisted?'保存在此浏览器':'仅本次页面有效，请导出备份'}</span><a class="text-link" href="${U.base}/feedback/?type=feature&from=/planner/">规划有建议？</a></div></div><div class="timeline-controls"><label>计划读几个学期<select id="plan-semester-count">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${p.timeline.count===i+1?'selected':''}>${i+1} 个学期</option>`).join('')}</select></label><label>第 1 学期从哪一季开始<select id="plan-start-term"><option value="winter" ${p.timeline.start==='winter'?'selected':''}>冬季学期</option><option value="summer" ${p.timeline.start==='summer'?'selected':''}>夏季学期</option></select></label><p class="timeline-average">120 ECTS 分 ${p.timeline.count} 学期，平均 <b>${Number((120/p.timeline.count).toFixed(1))} ECTS / 学期</b><small>只作分配参考，可以按自己的节奏调整。</small></p></div><p class="timeline-note">冬夏交替；季节提示沿用 2025 目录，当前是否开课请在 TUMonline 核对。</p></section><div class="planner-grid semester-planner"><div class="planner-main"><div class="plan-tools semester-tools"><h2>学期安排 <span>${assigned} / ${p.items.length} 门已分配</span></h2><button class="quiet" data-export>导出</button><button class="quiet" data-import>导入</button>${p.items.length?'<button class="quiet" data-clear>清空</button>':''}</div>${!p.items.length?'<p class="schedule-intro">点学期卡片上的「添加课程」，直接挑选并加入。</p>':''}${unassigned}<div class="semester-grid">${schedule.semesters.map(semester=>semesterCard(semester,p)).join('')}</div><a class="button secondary schedule-more" href="${U.base}/courses/">继续浏览课程目录 →</a><input id="plan-import" type="file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-label="导入学分计划 JSON 文件"><details id="plan-options" class="supplement"><summary>入学批次、补修与规则说明</summary><label class="cohort-setting">我的入学批次<select id="plan-cohort">${[['unknown','尚未确认'],...C.cohorts.map(v=>[v,v+'入学']),['older','其他批次（不判断达成）']].map(([v,t])=>`<option value="${e(v)}" ${p.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select></label><p>按个人录取条件确认是否需要补修。开启补修后，专业选修目标从 41 调整为 36 ECTS。</p><label class="checklist-item"><input id="plan-conditional" type="checkbox" ${p.conditional?'checked':''}><span>我已核对：需要补修 ED140014 控制理论</span></label><p>课程及计算沿用 2025 修订快照，完整 PDF 与独立人工复核仍待完成。未确认或不支持的入学批次不作达成判断。实际开课、考试登记、课程认定和毕业资格以学校为准。</p><a href="${U.base}/study/#credits">查看学分结构与来源 →</a></details><details id="custom-options" class="supplement"><summary>课程不在目录里？添加自己的选修</summary><p>仅支持 G/H/I/J 选修，归类与学分由你填写，认定需要学校确认。</p><form id="custom-plan" class="custom-form"><label>模块代码<input name="code" maxlength="60" required></label><label>课程名称<input name="name" maxlength="160" required></label><label>ECTS<input name="ects" type="number" min="0.5" max="30" step="0.5" required></label><label>所属领域<select name="group"><option value="G">G · 计算</option><option value="H">H · 机械</option><option value="I">I · 系统与控制</option><option value="J">J · 跨学科</option></select></label><button class="button" type="submit">加入计划</button></form></details><p class="plan-rule-note">计划、收藏只在当前浏览器保存。换设备或清理浏览器前，请导出备份；个人计划请保存在自己的设备。</p></div><aside class="panel plan-summary" aria-labelledby="plan-summary-title"><h2 id="plan-summary-title">规划学分</h2><div class="summary-total"><b>${calc.allocated}</b><small>/ 120 ECTS</small></div><p class="summary-caption">已选课程计入的学分</p><div class="summary-progress">${progress(calc)}</div><div class="domain-minimums">${['G','H','I'].map(k=>`<span class="${calc.totals[k]>=5?'met':''}">${domainNames[k]}<b>${calc.totals[k]} / 最低 5</b></span>`).join('')}</div><details id="summary-gaps" class="summary-gaps" ${p.items.length&&window.matchMedia('(min-width: 721px)').matches?'open':''}><summary>还需要安排</summary><div class="gaps">${gaps(calc,p)}</div></details><p class="summary-note">${calc.supported?'按 2025 规则快照模拟，不等于学校认定。':'先确认入学批次，再核对上述结构是否适用。'}${calc.custom?' 含自行录入选修，实际认定待确认。':''}</p></aside></div>`;
 for(const detailId of openDetails){const el=document.getElementById(detailId);if(el)el.open=true;}
 if(focusKey){const target=focusKey.id?document.getElementById(focusKey.id):box.querySelector(`[data-semester="${focusKey.semester}"]`);if(target)target.focus({preventScroll:true});}
}
window.addEventListener('rci:planchange',()=>render().catch(err=>U.toast(err.message)));
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
    return {...p,timeline:{...p.timeline,count},items:p.items.map(x=>x.semester>count?{...x,semester:0}:x)};
   });
  }
  if(el.hasAttribute('data-semester')){
   const semester=Number(el.value);
   await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===el.dataset.semester?{...x,semester}:x)}));
   const p=await U.plan();U.toast(semester?`已安排到${C.semesterLabel(p.timeline,semester)}。`:'已移回待分配，课程已保留。');
  }
  if(el.id==='plan-cohort')await U.updatePlan(p=>({...p,cohort:el.value}));
  if(el.id==='plan-conditional')await U.updatePlan(p=>({...p,conditional:el.checked}));
  if(el.id==='plan-import'&&el.files[0]){
   const f=el.files[0];if(f.size>250000)throw new Error('文件太大，上限 250 KB');
   const incoming=C.validatePlan(JSON.parse(await f.text()),db.courses);
   let imported=false;
   await U.updatePlan(async p=>{
    if(p.items.length&&!await U.confirmAction('用导入的计划替换当前计划？','建议先导出当前计划。导入后会替换已有课程、学期安排和批次设置。','导入并替换'))return null;
    imported=true;return incoming;
   });
   if(imported&&U.persisted)U.toast('计划已导入，课程与学期安排已更新。');el.value='';
  }
 }catch(err){U.toast(err instanceof SyntaxError?'文件内容不是有效的计划 JSON。当前计划未修改。':err.message);}
});
box.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 try{
  if(b.hasAttribute('data-import'))document.getElementById('plan-import').click();
  if(b.hasAttribute('data-remove')){
   let removed;
   await U.updatePlan(p=>{removed=p.items.find(x=>x.code===b.dataset.remove);return {...p,items:p.items.filter(x=>x.code!==b.dataset.remove)};});
   if(removed&&U.persisted)U.toast('已移除课程。',{label:'撤销',run:async()=>{await U.updatePlan(p=>p.items.some(x=>x.code===removed.code)?null:{...p,items:[...p.items,{...removed,semester:removed.semester<=p.timeline.count?removed.semester:0}]});if(U.persisted)U.toast('课程已恢复。');}});
  }
  if(b.hasAttribute('data-clear')&&await U.confirmAction('清空这份计划？','课程、学期安排、入学批次和补修设置会一起清空。建议先导出备份。','清空计划')){await U.savePlan(U.empty());if(U.persisted)U.toast('计划已清空，可以重新开始。');}
  if(b.hasAttribute('data-export')){
   const p=await U.plan(),u=URL.createObjectURL(new Blob([JSON.stringify({...p,exported_on:new Date().toISOString()},null,2)],{type:'application/json'})),a=document.createElement('a');
   a.href=u;a.download='rci-study-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);U.toast('计划已导出，请保存在自己的设备。');
  }
 }catch(err){U.toast(err.message);}
});
box.addEventListener('submit',async ev=>{
 if(ev.target.id!=='custom-plan')return;ev.preventDefault();
 try{
  const f=new FormData(ev.target),code=String(f.get('code')).trim().toUpperCase();
  if(known.has(code))throw new Error('此模块已在目录里，请从课程页添加');
  await U.updatePlan(p=>({...p,items:[...p.items,{code,name:String(f.get('name')),ects:Number(f.get('ects')),group:f.get('group'),status:'planned',custom:true}]}));
  if(U.persisted)U.toast('选修已加入，实际认定请向学校确认。');
 }catch(err){U.toast(err.message);}
});
})();
