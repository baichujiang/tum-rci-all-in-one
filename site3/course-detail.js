/* Course detail actions share the guarded plan API with the directory and board. */
(function(root){
'use strict';
const node=typeof module==='object'&&module.exports,C=node?require('../assets/core'):root.RCI;
function action(course,item,semester){
 const credits=item?.custom?item.ects:course.ects;
 if(item?.status==='passed')return {disabled:true,label:'已修通过',message:'这门课已记为通过，不再安排到未来学期。'};
 if(!Number.isFinite(Number(credits))||Number(credits)<=0)return {disabled:true,label:'学分待核实',message:'学分确认前，暂不能加入计划。'};
 const destination=semester?`第 ${semester} 学期`:'待分配';
 if(item?.semester===semester)return {disabled:true,label:`已在${destination}`,message:`这门课已在${destination}。可选择其他学期调整安排。`};
 return {disabled:false,label:(item?'移到':'加入')+destination,message:item?`目前在${item.semester?'第 '+item.semester+' 学期':'待分配'}。选择学期后可以移动。`:'加入计划只做学期安排，不会向学校报名。'};
}
function backURL(from,base,origin){
 const fallback=base+'/courses/';
 if(!from||!from.startsWith('/')||from.startsWith('//')||/[\\\x00-\x1f]/.test(from))return fallback;
 try{const u=new URL(from,origin),hash=u.pathname===fallback&&/^#directory-course-[A-Z0-9][A-Z0-9._-]{0,59}$/.test(u.hash)?u.hash:'';return u.origin===origin&&[fallback,base+'/planner/'].includes(u.pathname)?u.pathname+u.search+hash:fallback;}catch(_){return fallback;}
}
if(node){module.exports={action,backURL};return;}
const box=document.getElementById('course-detail');if(!box)return;
const U=root.RCIUI,code=box.dataset.courseCode,target=box.querySelector('[data-detail-semester]'),button=box.querySelector('[data-course-detail-add]'),status=box.querySelector('#course-detail-status'),undo=box.querySelector('[data-detail-undo]'),back=box.querySelector('[data-detail-back]');
const related=box.querySelectorAll?.('[data-detail-related]')||[];
const media=root.matchMedia?.('(min-width: 961px)'),params=new URLSearchParams(location.search);
let course,plan,semester,ready=false,busy=false,revision=0,lastChange=null;
back.href=backURL(params.get('from'),U.base,location.origin);
if(back.href.includes('/planner/'))back.lastChild.textContent=' 返回我的计划';
function current(){return plan.items.find(x=>x.code===code);}
function render(message){
 if(!ready)return;
 const item=current(),s=action(course,item,semester);
 target.disabled=busy||item?.status==='passed';button.disabled=busy||s.disabled;button.textContent=busy?'正在保存…':s.label;
 status.textContent=message||s.message;
 for(const link of related){const u=new URL(link.href,location.origin);u.searchParams.set('semester',String(semester));if(params.has('from'))u.searchParams.set('from',backURL(params.get('from'),U.base,location.origin));link.href=u.pathname+u.search;}
 if(item?.custom&&!message)status.textContent+=' 同代码自录记录的名称、学分和分类会保留。';
 if(undo)undo.hidden=!lastChange;
}
async function refresh(){
 const token=++revision;
 try{
  const [data,next]=await Promise.all([U.data(),U.plan()]);if(token!==revision)return;
  course=data.courses.find(c=>c.module_code===code);if(!course)throw Error('没有找到课程数据，请刷新后重试。');plan=next;
  if(semester===undefined){const raw=params.get('semester'),n=raw===null?NaN:Number(raw);semester=Number.isInteger(n)&&n>=0&&n<=plan.timeline.count?n:(current()?.semester||0);}
  if(semester>plan.timeline.count||media?.matches&&semester===0)semester=media?.matches?1:0;
  target.innerHTML=(media?.matches?'':'<option value="0">先选课，稍后分配</option>')+Array.from({length:plan.timeline.count},(_,i)=>`<option value="${i+1}">${C.esc(C.semesterLabel(plan.timeline,i+1))}</option>`).join('');target.value=String(semester);
  ready=true;render();
 }catch(err){if(token!==revision)return;ready=false;target.disabled=true;button.disabled=true;status.textContent='无法读取已有计划。请到“我的计划”检查或备份后重试。';}
}
target.addEventListener('change',()=>{
 if(!ready||busy)return;
 const next=Number(target.value);if(!Number.isInteger(next)||next<0||next>plan.timeline.count)return;
 semester=next;const q=new URLSearchParams(location.search);q.set('semester',String(semester));history.replaceState(null,'',location.pathname+'?'+q+location.hash);render();
});
button.addEventListener('click',async()=>{
 if(!ready||busy||action(course,current(),semester).disabled)return;
 busy=true;render();let message;
 try{
  const change=await U.addCourse(code,semester,{moveExisting:true});
  if(!['cancelled','unchanged'].includes(change.kind)){lastChange=change;message=U.persisted===false?'本次修改仅在当前页面有效，请先导出备份。':`已${change.kind==='moved'?'移到':'加入'}${change.semester?'第 '+change.semester+' 学期':'待分配'}。`;}
 }catch(err){message=err.message;}
 finally{await refresh();busy=false;render(message);}
});
undo?.addEventListener('click',async()=>{
 if(!lastChange||busy)return;busy=true;render();let message;
 try{await U.undoCourse(lastChange);lastChange=null;message='已撤销这次调整。';}catch(err){message=err.message;}
 finally{await refresh();busy=false;render(message);}
});
root.addEventListener('rci:planchange',refresh);
media?.addEventListener('change',refresh);
refresh();
})(typeof globalThis!=='undefined'?globalThis:this);
