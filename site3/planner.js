/* The student's own plan. Uses the existing validated rules and v2 storage format. */
(async function(){
'use strict';
const U=window.RCIUI,C=window.RCI,e=C.esc,box=document.getElementById('planner');if(!box)return;
let db,summaryMode='planned',renderId=0;
const names={core:'必修课程',professional:'专业选修',J:'跨学科选修',F:'硕士论文',K:'控制理论补修'};
const groupOf=c=>'ABCDE'.includes(c)?'core':'GHI'.includes(c)?'professional':c;
const domainNames={G:'计算',H:'机械',I:'系统与控制'};
const planIcon='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5"/></svg>';
try{db=await U.data();await render();}catch(err){box.innerHTML='<div class="empty"><h2>暂时无法读取计划</h2><p>'+e(err.message)+'。已有记录没有覆盖，请先备份再重试。</p><a class="button secondary" href="'+U.base+'/courses/">先浏览课程</a></div>';return;}
const known=new Map(db.courses.map(c=>[c.module_code,c]));
function progress(calc){return calc.buckets.map(([name,value,target])=>`<div class="progress-row"><div><span>${e(name)}</span><b>${Math.min(value,target)} / ${target}</b></div><progress max="${target}" value="${Math.min(value,target)}" aria-label="${e(name)} ${Math.min(value,target)} / ${target} ECTS"></progress></div>`).join('');}
function gaps(calc,p){
 if(!p.items.length)return '<p>加入课程后，查看各类别还需要多少学分。</p>';
 const keys=['core','professional','J','F','K'];
 let links=calc.buckets.map(([label,value,target],i)=>value<target?`<a class="gap-link" href="${U.base}/courses/?group=${keys[i]}"><span>${e(label)}还差 <b>${target-value}</b> ECTS</span><span aria-hidden="true">→</span></a>`:'').join('');
 for(const k of ['G','H','I'])if(calc.totals[k]<5)links+=`<a class="gap-link" href="${U.base}/courses/?group=${k}"><span>${domainNames[k]}领域还差 <b>${5-calc.totals[k]}</b> ECTS</span><span aria-hidden="true">→</span></a>`;
 if(!p.conditional&&calc.totals.K>0)links+='<p>控制理论未计入，请核对补修设置。</p>';
 return links||'<p>已覆盖本模型的数值要求。实际通过和认定请在学校系统核对。</p>';
}
function row(x){
 const c=db.courses.find(c=>c.module_code===x.code),title=c?(db.names[x.code]||c.module_name_legal_2025):x.name;
 return `<div class="plan-row"><div><b>${c?`<a href="${U.base}/courses/${e(x.code)}/">${e(title)}</a>`:e(title)}</b><p class="meta">${e(x.code)} · ${e(c?c.ects:x.ects)} ECTS ${x.custom?'· 认定待确认':''}</p></div><label><span class="sr-only">${e(title)} 修读状态</span><select data-status="${e(x.code)}"><option value="planned" ${x.status==='planned'?'selected':''}>计划修读</option><option value="passed" ${x.status==='passed'?'selected':''}>自报已通过</option></select></label><button class="quiet remove-course" data-remove="${e(x.code)}" aria-label="移除 ${e(title)}">×</button></div>`;
}
async function render(){
 const id=++renderId,active=document.activeElement;
 const focusKey=active?.id?{id:active.id}:active?.dataset.status?{status:active.dataset.status}:null;
 const openDetails=[...box.querySelectorAll('details[open]')].map(el=>el.id);
 const p=await U.plan();if(id!==renderId)return;
 const calc=C.calculate(p,db.courses,summaryMode==='passed');
 const sections=Object.keys(names).map(key=>{
  const items=p.items.filter(x=>groupOf((db.courses.find(c=>c.module_code===x.code)?.section_2025[0])||x.group)===key);
  return items.length?`<div class="plan-group-label">${names[key]}<span>${items.length} 门</span></div>${items.map(row).join('')}`:'';
 }).join('');
 const importButton='<button class="button secondary" data-import>导入已有计划</button>';
 box.innerHTML=`<div class="planner-settings"><label>我的入学批次<select id="plan-cohort">${[['unknown','尚未确认'],...C.cohorts.map(v=>[v,v+'入学']),['older','其他批次（不判断达成）']].map(([v,t])=>`<option value="${e(v)}" ${p.cohort===v?'selected':''}>${e(t)}</option>`).join('')}</select></label><span class="save-state"><span class="save-dot"></span>${U.persisted?'保存在此浏览器':'仅本次页面有效，请导出备份'}</span></div><div class="planner-grid ${p.items.length?'':'is-empty'}"><div class="planner-main"><section class="panel">${p.items.length?`<div class="plan-tools"><h2>我的课程 · ${p.items.length}</h2><button class="quiet" data-export>导出</button><button class="quiet" data-import>导入</button><button class="quiet" data-clear>清空</button></div>${sections}<div class="actions"> <a class="button secondary" href="${U.base}/courses/">继续选课程 →</a></div>`:`<div class="planner-empty"><span class="empty-symbol">${planIcon}</span><h2>先选一门课，计划就开始了。</h2><p>把想修的课程加入计划，看看学分如何分布。已有计划也可以直接导入。</p><div class="actions"><a class="button" href="${U.base}/courses/">去选第一门课 →</a>${importButton}</div></div>`}<input id="plan-import" type="file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-label="导入学分计划 JSON 文件"></section><details id="plan-options" class="supplement"><summary>补修情况与规则说明</summary><p>按个人录取条件确认是否需要补修。开启补修后，专业选修目标从 41 调整为 36 ECTS。</p><label class="checklist-item"><input id="plan-conditional" type="checkbox" ${p.conditional?'checked':''}><span>我已核对：需要补修 ED140014 控制理论</span></label><p>课程及计算沿用 2025 修订快照，完整 PDF 与独立人工复核仍待完成。未确认或不支持的入学批次不作达成判断。实际开课、考试登记、课程认定和毕业资格以学校为准。</p><a href="${U.base}/study/#credits">查看学分结构与来源 →</a></details><details id="custom-options" class="supplement"><summary>课程不在目录里？添加自己的选修</summary><p>仅支持 G/H/I/J 选修，归类与学分由你填写，认定需要学校确认。</p><form id="custom-plan" class="custom-form"><label>模块代码<input name="code" maxlength="60" required></label><label>课程名称<input name="name" maxlength="160" required></label><label>ECTS<input name="ects" type="number" min="0.5" max="30" step="0.5" required></label><label>所属领域<select name="group"><option value="G">G · 计算</option><option value="H">H · 机械</option><option value="I">I · 系统与控制</option><option value="J">J · 跨学科</option></select></label><button class="button" type="submit">加入计划</button></form></details><p class="plan-rule-note">计划、收藏只在当前浏览器保存。换设备或清理浏览器前，请导出备份；个人计划请保存在自己的设备。</p></div><aside class="panel plan-summary" aria-label="学分进度"><div class="segmented summary-tabs" role="group" aria-label="进度显示范围"><button data-summary="planned" aria-pressed="${summaryMode==='planned'}">我的规划</button><button data-summary="passed" aria-pressed="${summaryMode==='passed'}">仅已通过</button></div><div class="summary-total"><b>${calc.allocated}</b><small>/ 120 ECTS</small></div><p class="summary-caption">${summaryMode==='passed'?'仅计入自行标记为已通过的课程':'规划计入 · 包括尚未通过的课程'}</p><div class="summary-progress">${progress(calc)}</div><div class="domain-minimums">${['G','H','I'].map(k=>`<span class="${calc.totals[k]>=5?'met':''}">${domainNames[k]}<b>${calc.totals[k]} / 最低 5</b></span>`).join('')}</div><details id="summary-gaps" class="summary-gaps" ${p.items.length&&window.matchMedia('(min-width: 721px)').matches?'open':''}><summary>${summaryMode==='passed'?'距离通过要求':'接下来还需要'}</summary><div class="gaps">${gaps(calc,p)}</div></details><p class="summary-note">${calc.supported?'按 2025 规则快照模拟，不等于学校认定。':'先确认入学批次，再核对上述结构是否适用。'}${calc.custom?' 含自行录入选修，实际认定待确认。':''}</p></aside></div>`;
 for(const detailId of openDetails){const el=document.getElementById(detailId);if(el)el.open=true;}
 if(focusKey){const target=focusKey.id?document.getElementById(focusKey.id):box.querySelector(`[data-status="${focusKey.status}"]`);if(target)target.focus({preventScroll:true});}
}
window.addEventListener('rci:planchange',()=>render().catch(err=>U.toast(err.message)));
box.addEventListener('change',async ev=>{
 try{
  const el=ev.target;
  if(el.id==='plan-cohort')await U.updatePlan(p=>({...p,cohort:el.value}));
  if(el.id==='plan-conditional')await U.updatePlan(p=>({...p,conditional:el.checked}));
  if(el.hasAttribute('data-status'))await U.updatePlan(p=>({...p,items:p.items.map(x=>x.code===el.dataset.status?{...x,status:el.value}:x)}));
  if(el.id==='plan-import'&&el.files[0]){
   const f=el.files[0];if(f.size>250000)throw new Error('文件太大，上限 250 KB');
   const incoming=C.validatePlan(JSON.parse(await f.text()),db.courses);
   let imported=false;
   await U.updatePlan(async p=>{
    if(p.items.length&&!await U.confirmAction('用导入的计划替换当前计划？','建议先导出当前计划。导入后会替换已有课程和批次设置。','导入并替换'))return null;
    imported=true;return incoming;
   });
   if(imported&&U.persisted)U.toast('计划已导入，学分已更新。');el.value='';
  }
 }catch(err){U.toast(err instanceof SyntaxError?'文件内容不是有效的计划 JSON。当前计划未修改。':err.message);}
});
box.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 try{
  if(b.hasAttribute('data-import'))document.getElementById('plan-import').click();
  if(b.hasAttribute('data-summary')){summaryMode=b.dataset.summary;await render();box.querySelector(`[data-summary="${summaryMode}"]`)?.focus({preventScroll:true});}
  if(b.hasAttribute('data-remove')){
   let removed;
   await U.updatePlan(p=>{removed=p.items.find(x=>x.code===b.dataset.remove);return {...p,items:p.items.filter(x=>x.code!==b.dataset.remove)};});
   if(removed&&U.persisted)U.toast('已移除课程。',{label:'撤销',run:async()=>{await U.updatePlan(p=>p.items.some(x=>x.code===removed.code)?null:{...p,items:[...p.items,removed]});if(U.persisted)U.toast('课程已恢复。');}});
  }
  if(b.hasAttribute('data-clear')&&await U.confirmAction('清空这份计划？','课程、入学批次和补修设置会一起清空。建议先导出备份。','清空计划')){await U.savePlan(U.empty());if(U.persisted)U.toast('计划已清空，可以重新开始。');}
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
