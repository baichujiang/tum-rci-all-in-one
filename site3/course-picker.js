/* Pick multiple courses without leaving the student's semester plan. */
(function(root){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const C=node?require('../assets/core'):root.RCI,S=node?require('./search'):root.RCISearch;
const groups=C.courseGroups;
function choices(data,plan,semester,{query='',group='',otherTerms=false}={}){
 plan=C.validatePlan(plan,data.courses);
 if(!Number.isInteger(semester)||semester<1||semester>plan.timeline.count)throw new Error('请先选择有效的学期。');
 const season=C.semesterSeason(plan.timeline,semester),items=new Map(plan.items.map(x=>[x.code,x])),searching=!!S.normalize(query);
 const docs=data.courses.filter(c=>(!group||(group==='core'?'ABCDE'.includes(c.section_2025[0]):c.section_2025[0]===group))&&(otherTerms||searching||C.offering(c,season).state!=='conflict')).map(c=>({id:c.module_code,code:c.module_code,kind:'course',title:c.module_name_legal_2025,translation:data.names[c.module_code]||'',summary:c.module_name_legal_2025,body:groups[c.section_2025[0]],aliases:[c.module_code,c.module_name_legal_2025,data.names[c.module_code]||''],tasks:['study'],course:c,assignment:items.get(c.module_code)||null}));
 return S.search(docs,query,data.synonyms||[]);
}
if(node)module.exports={choices};else root.RCICoursePicker={choices};
if(typeof document==='undefined')return;
const U=root.RCIUI,e=C.esc,dialog=document.getElementById('course-picker');if(!dialog)return;
const $=s=>dialog.querySelector(s),query=$('#picker-query'),target=$('#picker-semester'),group=$('#picker-group'),other=$('#picker-other'),results=$('#picker-results');
let db,semester=1,renderId=0,lastChange=null,focusAfter=null;
const pending=new Set();
function notice(message,change){$('#picker-status').textContent=message;if(change!==undefined)lastChange=change;$('#picker-undo').hidden=!lastChange;}
async function render(){
 if(!dialog.open)return;
 const id=++renderId;db=db||await U.data();const p=await U.plan();if(id!==renderId||!dialog.open)return;
 if(semester>p.timeline.count){semester=0;notice('原目标学期已移除，请重新选择学期。',null);}
 target.innerHTML='<option value="0" disabled>请选择学期</option>'+Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}">${C.semesterLabel(p.timeline,i+1)}</option>`).join('');target.value=semester;
 $('#picker-title').textContent=semester?`为第 ${semester} 学期添加课程`:'添加课程';
 if(!semester){results.innerHTML='<p class="empty">先选择课程要放到哪个学期。</p>';$('#picker-results-count').textContent='';$('#picker-credits').textContent='尚未选择学期';return;}
 const season=C.semesterSeason(p.timeline,semester),list=choices(db,p,semester,{query:query.value,group:group.value,otherTerms:other.checked});
 const searching=!!S.normalize(query.value);other.closest('label').hidden=searching;
 $('#picker-hint').textContent=searching?'搜索覆盖全部目录季节；与本学期季节不符时会提醒。':other.checked?'显示所有目录季节；安排不符时会提醒。':`显示${season==='winter'?'冬季':'夏季'}、两季都有及季节待确认的课程。2025 目录，实际开课需核对。`;
 $('#picker-results-count').textContent=`${list.length} 门课程 · 点加入即可，随后继续选下一门`;
 results.innerHTML=list.length?list.map(d=>{
  const c=d.course,assigned=d.assignment,here=assigned?.semester===semester,busy=pending.has(d.code),offer=C.offering(c,season);
  const assignment=assigned?assigned.semester?`已在${C.semesterLabel(p.timeline,assigned.semester)}`:'已选 · 待分配':'';
  return `<article class="picker-course${here?' is-picked':''}"><div><p class="picker-course-meta">${e(groups[c.section_2025[0]])} · ${e(d.code)}</p><h3><a href="${U.base}/courses/${e(d.code)}/" target="_blank" rel="noopener noreferrer" aria-label="查看 ${e(d.title)} 说明（新标签页）">${e(d.title)}</a></h3><p class="picker-english">${e(d.translation)}</p><p class="picker-offering${offer.state==='conflict'?' conflict':''}">${e(offer.label)} · 目录${assignment?' <span>'+e(assignment)+'</span>':''}</p></div><div class="picker-course-action"><b>${e(c.ects)} <small>ECTS</small></b><button type="button" class="button ${here?'picked':'secondary'}" data-picker-add="${e(d.code)}" aria-label="${here?'已在本学期：':assigned?'将课程移到本学期：':'加入本学期：'}${e(d.title)}"${here||busy?' disabled':''}>${busy?'处理中…':here?'✓ 已加入':assigned?'移到这里':'＋ 加入'}</button></div></article>`;
 }).join(''):`<div class="picker-empty"><h3>没有找到对应课程</h3><p>试试课程代码，或清除领域筛选。</p><button type="button" class="button secondary" data-picker-reset>清除搜索与筛选</button></div>`;
 const bucket=C.schedule(p,db.courses).semesters[semester-1];$('#picker-credits').textContent=`本学期 ${bucket.credits} ECTS · ${bucket.items.length} 门`;
 $('#picker-save-state').textContent=U.persisted?'加入后自动保存':'仅当前页面有效，请导出备份';
 if(focusAfter){const buttons=[...results.querySelectorAll('[data-picker-add]')],index=buttons.findIndex(b=>b.dataset.pickerAdd===focusAfter);(buttons.slice(index+1).find(b=>!b.disabled)||buttons.find(b=>!b.disabled)||query).focus({preventScroll:true});focusAfter=null;}
}
const refresh=()=>render().catch(err=>notice(err.message,null));
document.addEventListener('click',async ev=>{
 const opener=ev.target.closest('[data-pick-semester]');if(!opener)return;
 if(!dialog.showModal){location.href=U.base+'/courses/?semester='+opener.dataset.pickSemester;return;}
 semester=Number(opener.dataset.pickSemester);query.value='';group.value='';other.checked=false;notice('',null);results.innerHTML='<p class="loading-state">正在读取课程…</p>';
 dialog.showModal();query.focus({preventScroll:true});await refresh();
});
dialog.addEventListener('close',()=>{
 const opener=document.querySelector(`[data-pick-semester="${semester}"]`)||document.querySelector('[data-pick-semester]');if(opener){opener.focus({preventScroll:true});opener.closest('.semester-card').scrollIntoView({block:'nearest'});}
});
dialog.addEventListener('click',async ev=>{
 const button=ev.target.closest('button');
 if(button?.hasAttribute('data-picker-close'))dialog.close();
 if(button?.hasAttribute('data-picker-reset')){query.value='';group.value='';other.checked=false;await refresh();query.focus();}
 if(button?.id==='picker-undo'&&lastChange){
  button.disabled=true;
  try{await U.undoCourse(lastChange);notice('已撤销，原来的安排已恢复。',null);await refresh();if(dialog.open)query.focus({preventScroll:true});}
  catch(err){notice(err.message,null);}finally{button.disabled=false;}
 }
 if(button?.hasAttribute('data-picker-add')){
  const code=button.dataset.pickerAdd;if(pending.has(code))return;pending.add(code);button.disabled=true;
  const hadFocus=document.activeElement===button;
  try{
   const change=await U.addCourse(code,semester,{moveExisting:true});
   if(!['cancelled','unchanged'].includes(change.kind))notice(`${db.names[code]||code}已${change.kind==='moved'?'移到':'加入'}第 ${change.semester} 学期。${U.persisted?'已保存，可以继续选课。':'仅当前页面有效。'}`,change);
   if(hadFocus)focusAfter=code;
  }catch(err){notice(err.message,null);}finally{pending.delete(code);await refresh();}
 }
 if(ev.target===dialog){const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)dialog.close();}
});
query.addEventListener('input',refresh);group.addEventListener('change',refresh);other.addEventListener('change',refresh);
target.addEventListener('change',()=>{semester=Number(target.value);other.checked=false;notice('',null);refresh();});
window.addEventListener('rci:planchange',refresh);
})(typeof globalThis!=='undefined'?globalThis:this);
