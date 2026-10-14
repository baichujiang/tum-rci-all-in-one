/* Passed courses, preferences and reviewable automatic plans. Local-only. MIT. */
(async function(){
'use strict';
const U=window.RCIUI,C=window.RCI,T=window.RCICourseContext,E=window.RCIPlanning,e=C.esc,box=document.getElementById('planning-controls');if(!box)return;
let db,p,query='',mode='passed',worker=null,preparing=false,searchTimer=null,generation=0,preview=null,expected='',original=null,renderId=0;
const dialog=document.getElementById('auto-plan-dialog'),result=document.getElementById('auto-plan-result');
try{db=await U.data();await render();}catch(error){box.innerHTML=`<p class="notice">${e(error.message)}。现有计划没有修改。</p>`;return;}
function title(code){return db.names[code]||db.courses.find(c=>c.module_code===code)?.module_name_legal_2025||p.items.find(x=>x.code===code)?.name||code;}
function chips(codes,kind){return codes.length?codes.map(code=>`<span class="preference-chip">${e(title(code))} <small>${e(code)}</small><button class="quiet" type="button" data-forget="${e(code)}" data-kind="${kind}" aria-label="取消${kind==='passed'?'已修':kind==='desired'?'想选':'排除'} ${e(title(code))}">×</button></span>`).join(''):'<p class="meta">尚未添加</p>';}
function fields(value,prefix){return [['minECTS','学分下限',120,.5],['maxECTS','学分上限',120,.5],['minExams','考核下限',50,1],['maxExams','考核上限',50,1]].map(([key,label,max,step])=>`<label>${label}<input name="${prefix+key}" type="number" min="0" max="${max}" step="${step}" value="${value[key]}" required></label>`).join('');}
async function render(){
 const id=++renderId;p=await U.plan();if(id!==renderId)return;
 const detailState=[...box.querySelectorAll('details[id]')].map(x=>[x.id,x.open]),calc=C.calculate(p,db.courses,true);
 box.innerHTML=`<section class="planning-workflow panel" aria-labelledby="planning-workflow-title"><div class="planning-heading"><div><p class="eyebrow">先录入已修，再安排未来</p><h2 id="planning-workflow-title">完成你的毕业路线</h2><p>已修 <b>${calc.allocated} ECTS</b> · ${p.preferences.desired.length} 门想选 · ${p.preferences.excluded.length} 门排除</p></div><div class="inline-actions"><button type="button" class="button" data-generate>生成自动方案</button><a class="button secondary" href="https://campus.tum.de/" target="_blank" rel="noopener noreferrer">在 TUMonline 查看课表 ↗</a></div></div><p class="meta official-timetable-help">登录 TUMonline 后打开「Terminkalender」。实际上课日期、练习分组和临时变更在那里确认。</p><div class="admission-settings"><a class="text-link" href="#plan-options">入学批次：${e(p.cohort==='unknown'?'请先确认':p.cohort)} ↓</a><label>个人录取补修要求<select id="controls-conditional-status"><option value="unknown" ${!p.conditionalConfirmed?'selected':''}>尚未确认</option><option value="no" ${p.conditionalConfirmed&&!p.conditional?'selected':''}>已核对：没有补修要求</option><option value="yes" ${p.conditionalConfirmed&&p.conditional?'selected':''}>已核对：有补修要求</option></select></label></div><p class="meta">当前课程库是已核验子集，未完整覆盖官方目录；自动推荐仅在这个子集内搜索。先修、语言课资格、具体课题、名额与个人认定需另行核对。</p><p class="meta">保留已修与固定学期；按排除偏好移除未固定选修，其余已选课保留。补齐学分后尽早完成。方案先预览，确认后才更新看板。</p><details id="personal-preferences" open><summary>1 · 已修课程与想选／排除</summary><div class="preference-search"><label>我要记录<select id="preference-mode"><option value="passed" ${mode==='passed'?'selected':''}>已修通过</option><option value="desired" ${mode==='desired'?'selected':''}>想选的课程</option><option value="excluded" ${mode==='excluded'?'selected':''}>不想选的课程</option></select></label><label>搜索课程<input id="preference-search" type="search" value="${e(query)}" placeholder="中文、英文或模块代码" maxlength="160" autocomplete="off"></label></div><div id="preference-results" class="preference-results" aria-live="polite"></div><div class="preference-selections"><div><h3>已修通过 <small>仅录入可计入此硕士的成绩；本科已计入的课应排除，不能重复作为已修</small></h3>${chips(p.items.filter(x=>x.status==='passed').map(x=>x.code),'passed')}</div><div><h3>想选 <small>自动方案必须包含</small></h3>${chips(p.preferences.desired,'desired')}</div><div><h3>排除 <small>不会自动推荐</small></h3>${chips(p.preferences.excluded,'excluded')}</div></div></details><details id="planning-preference-settings"><summary>2 · 语言与学期负担</summary><form id="planning-preferences"><fieldset><legend>授课语言</legend>${['EN','DE'].map(l=>`<label class="check"><input type="checkbox" name="language" value="${l}" ${p.preferences.languages.includes(l)?'checked':''}>${l==='EN'?'英语':'德语'}</label>`).join('')}<p class="meta">目录 DE/EN 表示可能使用两种语言；实际班次仍须核对。</p></fieldset><label>从第几个学期开始规划<select name="startSemester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}" ${p.preferences.startSemester===i+1?'selected':''}>第 ${i+1} 学期 · ${e(T.term(p,i+1).label)}</option>`).join('')}</select></label><div class="load-fields">${fields(p.workload,'')}</div><p class="meta">考核数按每个模块 1 项估算，含研讨、实践和论文；实际考核组成请看模块说明。</p>${[['allowUnconfirmed','允许按目录季节推算未来开课'],['deadlineException','我已有学校批准的延期／期限调整（规划仅提示标准期限）']].map(([key,label])=>`<label class="check"><input name="${key}" type="checkbox" ${p.preferences[key]?'checked':''}>${label}</label>`).join('')}<button class="button secondary" type="submit">保存规划条件</button></form><details id="semester-overrides"><summary>单个学期采用不同负担</summary><form id="semester-workload"><label>学期<select name="semester">${Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}">第 ${i+1} 学期</option>`).join('')}</select></label><div class="load-fields">${fields(p.workload,'')}</div><button class="button secondary" type="submit">保存本学期覆盖</button><button class="quiet" type="button" data-reset-workload>恢复全局负担</button></form><div class="workload-overrides">${Object.entries(p.workload.semesters).map(([n,v])=>`<p>第 ${n} 学期：${E.bounds(p,n).minECTS}–${E.bounds(p,n).maxECTS} ECTS，${E.bounds(p,n).minExams}–${E.bounds(p,n).maxExams} 项考核</p>`).join('')||'<p class="meta">所有学期目前采用全局设置。</p>'}</div></details></details><details id="planning-rule-audit"><summary>已核对的规则与规划边界 · 2026-10-14</summary><p>SS2024–SS2025 使用2024 FPSO；WS2025/26起叠加2025-02-11修订。A–E 43、F 30、J 6、G/H/I 合计 41 ECTS，且每类至少 5。若个人要求补修 ED140014：K 5、G/H/I 合计 36，各类最低额不变。</p><p>论文通常是最后一项考核；自动规划优先把其他课程放在论文之前；若同学期，须自行保证论文通常是最后一项考核。提前开始需申请批准。第 2 学期末须通过 A/B/C 中至少一门。标准进度要求：第 3／4／5／6 学期末累计通过 30／60／90／120 ECTS。休学、认可和期限例外需按个人记录核对。</p><p>公开课程树会扩展附件选修清单。同一模块只计一次，本科已计入的课程不能重复用于硕士。J语言课须核对个人资格：德语至少C1.2、英语硕士语言课需C2，语言课总计至多6ECTS；自动推荐不包含语言课。课程目录尚未完整覆盖；研讨／实践模块只分配学分，不代表选定实际课题。自动规划不保证名额、考试登记或毕业批准；搜索达到上限会明确说明。</p><div class="inline-actions">${(db.rules?.sources||[]).map(s=>`<a class="text-link" href="${e(C.safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${e(s.title)} ↗</a>`).join('')}</div></details></section>`;
 for(const [key,isOpen] of detailState){const el=document.getElementById(key);if(el)el.open=isOpen;}search();
}
function search(){
 const docs=db.courses.map(c=>({id:c.module_code,code:c.module_code,title:c.module_name_legal_2025,summary:db.names[c.module_code]||'',aliases:[c.module_code,db.names[c.module_code]||''],body:c.section_2025,tasks:['study'],kind:'course',course:c}));
 const list=window.RCISearch.search(docs,query,db.synonyms||[]).slice(0,query?20:6).map(d=>d.course);
 document.getElementById('preference-results').innerHTML=list.map(c=>{const already=mode==='passed'?p.items.some(x=>x.code===c.module_code&&x.status==='passed'):p.preferences[mode].includes(c.module_code);return `<div class="preference-result"><span><b>${e(title(c.module_code))}</b><small>${e(c.module_code)} · ${c.ects} ECTS · ${e(C.courseGroups[c.section_2025[0]])}</small></span><button class="quiet" type="button" data-record="${e(c.module_code)}" ${already?'disabled':''}>${already?'已记录':mode==='passed'?'记为已修':mode==='desired'?'想选 ＋':'排除 ＋'}</button></div>`;}).join('')||'<p class="meta">未找到。目录外课程可在下方手动录入，认定需学校确认。</p>';
}
box.addEventListener('input',event=>{if(event.target.id==='preference-search'){query=event.target.value;search();}});
box.addEventListener('change',async event=>{if(event.target.id==='controls-conditional-status'){try{await U.updatePlan(p=>({...p,conditional:event.target.value==='yes',conditionalConfirmed:event.target.value!=='unknown'}));}catch(error){U.toast(error.message);}return;}if(event.target.id==='preference-mode'){mode=event.target.value;search();}if(event.target.closest('#semester-workload')&&event.target.name==='semester'){const b=E.bounds(p,Number(event.target.value));for(const key of ['minECTS','maxECTS','minExams','maxExams'])event.target.form.elements[key].value=b[key];}});
box.addEventListener('submit',async event=>{
 event.preventDefault();try{
  const f=new FormData(event.target),values=Object.fromEntries(['minECTS','maxECTS','minExams','maxExams'].map(k=>[k,Number(f.get(k))]));
  if(event.target.id==='planning-preferences')await U.updatePlan(p=>({...p,preferences:{...p.preferences,languages:f.getAll('language'),startSemester:Number(f.get('startSemester')),allowUnconfirmed:f.has('allowUnconfirmed'),deadlineException:f.has('deadlineException')},workload:{...p.workload,...values}}));
  if(event.target.id==='semester-workload')await U.updatePlan(p=>({...p,workload:{...p.workload,semesters:{...p.workload.semesters,[f.get('semester')]:values}}}));
  U.toast('规划条件已保存。');
 }catch(error){U.toast(error.message);}
});
box.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;try{
  if(b.hasAttribute('data-record')){
   const code=b.dataset.record;
   await U.updatePlan(p=>{
    if(mode!=='passed')return {...p,preferences:{...p.preferences,[mode]:[...new Set([...p.preferences[mode],code])]}};
    const opposite=code==='IN2067'?'ED160028':code==='ED160028'?'IN2067':null;
    if(p.items.some(x=>x.code===opposite))throw new Error('Robotics 与 Roboterdynamik 二选一，请先核对已有课程。');
    return {...p,items:[...p.items.filter(x=>x.code!==code),{...(p.items.find(x=>x.code===code)||{code,semester:0}),status:'passed',locked:false}]};
   });U.toast('已记录；学分统计已更新。');
  }
  if(b.hasAttribute('data-forget'))await U.updatePlan(p=>b.dataset.kind==='passed'?{...p,items:p.items.map(x=>x.code===b.dataset.forget?{...x,status:'planned',locked:false,semester:0}:x)}:{...p,preferences:{...p.preferences,[b.dataset.kind]:p.preferences[b.dataset.kind].filter(c=>c!==b.dataset.forget)}});
  if(b.hasAttribute('data-reset-workload')){const n=box.querySelector('#semester-workload [name="semester"]').value;await U.updatePlan(p=>{const semesters={...p.workload.semesters};delete semesters[n];return {...p,workload:{...p.workload,semesters}};});}
  if(b.hasAttribute('data-generate'))await generate();
 }catch(error){U.toast(error.message);}
});
async function generate(){
 if(worker||preparing)return;
 preparing=true;
 const run=++generation;
 let snapshot;try{snapshot=await U.plan();}finally{preparing=false;}
 if(run!==generation)return;
 original=snapshot;expected=JSON.stringify(original);preview=null;
 result.innerHTML='<p role="status">正在检查课程、学分与学期约束…</p>';dialog.querySelector('[data-apply-auto]').hidden=true;dialog.showModal();
 if(typeof Worker==='undefined'){result.innerHTML='<p>这个浏览器不支持后台规划。请使用较新的浏览器；现有手动计划仍可使用。</p>';return;}
 const activeWorker=new Worker(U.base+'/assets/planning-worker.js');worker=activeWorker;
 const finish=()=>{if(run!==generation)return false;clearTimeout(searchTimer);searchTimer=null;activeWorker.terminate();worker=null;return true;};
 searchTimer=setTimeout(()=>{if(!finish())return;result.innerHTML='<p>本次搜索超时，没有修改计划。可减少固定条件或增加规划学期后重试。</p>';},25000);
 activeWorker.onerror=()=>{if(!finish())return;result.innerHTML='<p>自动规划暂时无法运行；现有记录没有修改。请刷新后重试。</p>';};
 activeWorker.onmessage=event=>{if(!finish())return;const r=event.data;preview=r;
  if(!r.ok){result.innerHTML=`<h3>暂未生成可用方案</h3><ul>${r.reasons.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`;return;}
  const s=C.schedule(r.plan,db.courses);
  result.innerHTML=`<p class="auto-result-total"><b>${r.calculation.allocated} / 120 ECTS</b> · 已修 ${r.passed.allocated} · 未来 ${r.plan.items.filter(x=>x.status==='planned').reduce((sum,x)=>sum+Number(db.courses.find(c=>c.module_code===x.code)?.ects??x.ects),0)} ECTS</p><p>安排至第 ${r.finish} 学期；新增 ${r.added.length} 门、移动 ${r.moved.length} 门、移除排除选修 ${(r.removed||[]).length} 门。固定课程与已修记录保留。${r.removed?.length?' 移除：'+r.removed.map(title).map(e).join('、')+'。':''}</p><div class="auto-preview-semesters">${s.semesters.filter(x=>x.number<=r.finish).map(n=>`<section><h3>${e(T.term(r.plan,n.number).label)} · ${n.credits} ECTS · ${n.items.length} 项考核</h3><ul>${n.items.map(x=>`<li>${e(title(x.code))} <small>${e(x.code)}${x.group?' · 计入 '+e(x.group):''}${x.locked?' · 固定':''}</small></li>`).join('')}</ul></section>`).join('')}</div>${r.warnings.length?`<div class="notice"><h3>采用前需要核对</h3><ul>${r.warnings.map(x=>`<li>${e(x)}</li>`).join('')}</ul></div>`:''}<p class="meta">此方案用于学分与学期规划。实际开课、名额、课表与考试登记请在个人 TUMonline 确认。</p><p class="meta">在当前目录与计算预算内优先找到较早完成的方案；未证明全局最优。确认会更新安排，可立即撤销。</p>`;
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
