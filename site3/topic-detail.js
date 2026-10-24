/* A topic is metadata of its existing module, including from a shared detail URL. */
(function(){
'use strict';
const U=window.RCIUI,C=window.RCI,box=document.getElementById('topic-detail');if(!box)return;
const code=box.dataset.topicModule,id=box.dataset.topicId,target=box.querySelector('#topic-detail-semester'),button=box.querySelector('[data-topic-pick]'),status=box.querySelector('[data-topic-detail-status]');
const raw=new URLSearchParams(location.search).get('semester'),media=window.matchMedia('(min-width: 961px)');
let chosen=raw===null?null:Number(raw),revision=0;
async function refresh(){
 const token=++revision;
 try{
  const p=await U.plan();if(token!==revision)return;
  const item=p.items.find(x=>x.code===code),topics=C.itemTopics(item),selected=topics.some(x=>x.id===id);
  if(chosen===null||!Number.isInteger(chosen)||chosen<0||chosen>p.timeline.count)chosen=p.preferences.startSemester;
  if(media.matches&&chosen===0)chosen=1;
  if(item){target.innerHTML=`<option value="${item.semester}">${C.esc(item.status==='passed'?(item.semester?'第 '+item.semester+' 学期已通过':'已通过 · 学期未记录'):item.semester?C.planSemesterLabel(p,item.semester):'待分配')}</option>`;target.value=String(item.semester);}
  else{target.innerHTML=Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}">${C.esc(C.planSemesterLabel(p,i+1))}</option>`).join('')+(media.matches?'':'<option value="0">先选课，稍后分配</option>');target.value=String(chosen);}
  target.disabled=!!item;button.disabled=selected;button.textContent=selected?'已在候选清单':'加入候选';
  status.textContent=selected?'此课题已作为候选记录。报名与匹配结果请以官方系统为准。':item?`本模块已有 ${topics.length} 个候选。加入后保留其他候选、原学期和学分。`:'与模块一起加入所选学期。可添加多个候选，报名和匹配结果以官方系统为准。';
 }catch(_){if(token!==revision)return;target.disabled=true;button.disabled=true;status.textContent='无法读取计划，请到“我的计划”检查或备份后重试。';}
}
target.addEventListener('change',()=>{chosen=Number(target.value);});
window.addEventListener('rci:planchange',refresh);media.addEventListener('change',refresh);refresh();
})();
