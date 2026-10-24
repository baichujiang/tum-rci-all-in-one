/* One topic field and picker for the directory, module details and semester board. */
(function(root){
'use strict';
const node=typeof module==='object'&&module.exports,C=node?require('../assets/core'):root.RCI,S=node?require('./search'):root.RCISearch,e=C.esc;
const supported=code=>['IN2106','IN2107'].includes(code);
function displayTitle(title){
 return String(title||'').replace(/\s*\([A-Z]{2,}\d+[\d._]*(?:\s*,\s*[A-Z]{2,}\d+[\d._]*)*\)\s*$/,'').replace(/^(?:Master[-\s]*)?(?:Seminar|Practical(?:\s+Course)?|Praktikum)\b[\s:–—-]*/i,'').trim()||String(title||'');
}
function filter(entries,code,query='',term=''){
 const docs=entries.filter(x=>x.module===code&&(!term||x.term===term)).map(x=>({...x,kind:'course',summary:C.topicTermLabel(x.term),aliases:[x.module],body:''}));
 return S.search(docs,query,[]);
}
function field(code,topics=[],{semester=0,ready=true,target=''}={}){
 if(!supported(code))return '';
 const list=topics||[],names=list.map(x=>displayTitle(x.title));
 return `<span class="course-topic-field" data-topic-field="${code}"><span class="course-topic-copy"><span class="course-topic-label">候选课题${list.length?' · '+list.length+' 个':''}</span><span class="course-topic-value${list.length?'':' is-empty'}"${list.length?` title="${e(names.join('；'))}"`:''}>${list.length?e(names.slice(0,2).join('；')+(list.length>2?' 等 '+list.length+' 个候选':'')):'尚未添加，可多选'}</span></span><button type="button" class="course-topic-open" data-course-topic-open="${code}" data-topic-semester="${semester}"${target?` data-topic-target="${e(target)}"`:''} aria-haspopup="dialog" aria-controls="course-topic-dialog" aria-label="${list.length?'管理':'添加'} ${code==='IN2106'?'Praktikum':'Seminar'} 候选课题"${ready?'':' disabled'}>${list.length?'管理课题':'添加课题'}</button></span>`;
}
function saveState(previous,draftIds){
 const before=C.itemTopics(previous).map(x=>x.id).sort(),after=[...draftIds].sort();
 const changed=JSON.stringify(before)!==JSON.stringify(after);
 return {disabled:!changed||(!previous&&!after.length),clear:!!before.length&&!after.length};
}
function detailURL(topic,base=''){return `${base}/courses/${topic.module}/topics/${encodeURIComponent(topic.id)}/`;}
const api={supported,displayTitle,filter,field,saveState,detailURL};
if(node){module.exports=api;return;}root.RCICourseTopics=api;
const U=root.RCIUI;
let opening=false,session=null,busy=false,dialog=null,controls=null,staticRevision=0;
function setError(message){controls.error.textContent=message;controls.error.hidden=!message;}
function destination(p,semester){return semester?C.planSemesterLabel(p,semester):'待分配';}
function focusOpener(){
 const s=session;if(!s)return;
 const target=s.opener?.isConnected?s.opener:document.querySelector(`[data-course-topic-open="${s.code}"]`);
 if(target&&!target.disabled)target.focus({preventScroll:true});
 else document.getElementById('main')?.focus({preventScroll:true});
}
function ensureDialog(){
 if(dialog)return;
 dialog=document.createElement('dialog');dialog.id='course-topic-dialog';dialog.className='course-topic-dialog';dialog.setAttribute('aria-labelledby','topic-picker-title');dialog.setAttribute('aria-describedby','topic-picker-context');
 dialog.innerHTML=`<form class="topic-picker-form"><header class="topic-picker-heading"><div><h2 id="topic-picker-title"></h2><p id="topic-picker-context"></p></div><button type="button" class="topic-picker-close icon-button" data-topic-cancel aria-label="关闭选题窗口">×</button></header><div class="topic-picker-tools"><label class="topic-picker-search">搜索课题<input type="search" data-topic-search placeholder="输入课题名称或关键词" maxlength="160" autocomplete="off"></label><label class="topic-picker-term" data-topic-term-label hidden>来源学期<select data-topic-term></select></label><div class="topic-picker-source"><span data-topic-source-term></span><details><summary>来源说明</summary><p data-topic-source-note></p><a class="text-link" data-topic-source-link target="_blank" rel="noopener noreferrer">查看官方名单与申请说明 ↗</a></details></div><div class="topic-picker-management"><p class="topic-picker-count" data-topic-count></p><button type="button" class="topic-picker-selected-only" data-topic-selected-only aria-pressed="false">只看已选</button></div></div><div class="topic-picker-results"><fieldset class="topic-picker-choices"><legend class="sr-only">勾选候选课题，可多选</legend><div data-topic-results></div></fieldset><p class="topic-picker-empty" data-topic-empty hidden></p></div><footer class="topic-picker-footer"><div class="topic-picker-selection"><span data-topic-selected-count role="status" aria-live="polite"></span><button type="button" class="topic-picker-clear" data-topic-clear>清空勾选</button></div><p class="topic-picker-error" data-topic-error role="alert" hidden></p><div class="topic-picker-footer-row"><p>候选不代表报名或匹配成功，模块学分只计一次。</p><div class="topic-picker-buttons"><button type="button" class="button secondary" data-topic-cancel>取消</button><button type="submit" class="button" data-topic-save disabled>保存候选</button></div></div></footer></form>`;
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector);
 controls={form:$('form'),title:$('#topic-picker-title'),context:$('#topic-picker-context'),query:$('[data-topic-search]'),term:$('[data-topic-term]'),termLabel:$('[data-topic-term-label]'),sourceTerm:$('[data-topic-source-term]'),sourceNote:$('[data-topic-source-note]'),sourceLink:$('[data-topic-source-link]'),count:$('[data-topic-count]'),selectedOnly:$('[data-topic-selected-only]'),selectedCount:$('[data-topic-selected-count]'),results:$('[data-topic-results]'),empty:$('[data-topic-empty]'),clear:$('[data-topic-clear]'),error:$('[data-topic-error]'),save:$('[data-topic-save]')};
 controls.query.addEventListener('input',renderResults);
 controls.query.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
 controls.term.addEventListener('change',renderResults);
 controls.selectedOnly.addEventListener('click',()=>{if(busy)return;session.onlySelected=!session.onlySelected;renderResults();});
 controls.clear.addEventListener('click',()=>{if(busy)return;session.draftIds.clear();setError('');renderResults();});
 dialog.addEventListener('change',event=>{
  if(event.target.name!=='course-topic-choice'||busy)return;
  if(event.target.checked)session.draftIds.add(event.target.value);else session.draftIds.delete(event.target.value);
  setError('');if(session.onlySelected)renderResults();else renderSave();
 });
 for(const button of dialog.querySelectorAll('[data-topic-cancel]'))button.addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 dialog.addEventListener('close',()=>{focusOpener();session=null;});
 controls.form.addEventListener('submit',save);
}
function renderSave(){
 const s=session,state=saveState(s.previous,s.draftIds);
 controls.save.disabled=busy||state.disabled;
 controls.save.textContent=busy?'正在保存…':state.clear?'清空候选':s.previous?'保存候选':`加入${s.semester?'第 '+s.semester+' 学期':'待分配'}`;
 controls.selectedCount.textContent=`已选 ${s.draftIds.size} 个候选 · 可多选`;
 controls.clear.disabled=busy||!s.draftIds.size;
}
function renderResults(){
 if(!session)return;
 const s=session,previousIds=new Set(C.itemTopics(s.previous).map(x=>x.id)),currentIds=new Set(s.data.courseTopics.entries.map(x=>x.id));
 let matches=filter(s.entries,s.code,controls.query.value,controls.termLabel.hidden?'':controls.term.value);
 if(s.onlySelected)matches=matches.filter(topic=>s.draftIds.has(topic.id));
 const priority=topic=>topic.id===s.initialTopicId?2:previousIds.has(topic.id)?1:0;
 matches.sort((a,b)=>priority(b)-priority(a));
 controls.results.innerHTML=matches.map(topic=>`<div class="topic-picker-choice-row"><label class="topic-picker-choice"><input type="checkbox" name="course-topic-choice" value="${e(topic.id)}"${s.draftIds.has(topic.id)?' checked':''}${busy?' disabled':''}><span class="topic-picker-choice-name" title="${e(topic.title)}">${e(displayTitle(topic.title))}${!currentIds.has(topic.id)||!controls.termLabel.hidden?`<small class="topic-picker-choice-meta">${e(C.topicTermLabel(topic.term))}${currentIds.has(topic.id)?'':' · 本期名单未收录'}</small>`:''}</span>${previousIds.has(topic.id)?'<span class="topic-picker-current">已在清单</span>':''}</label>${s.data.courseTopics.detailPages?.includes(topic.id)?`<a class="topic-picker-detail-link" href="${e(detailURL(topic,U.base)+'?semester='+s.semester)}" target="_blank" rel="noopener noreferrer" aria-label="查看 ${e(displayTitle(topic.title))} 的课题详情（新标签页）">详情 ↗</a>`:''}</div>`).join('');
 controls.count.textContent=`${matches.length} 个课题`;
 controls.selectedOnly.setAttribute('aria-pressed',String(s.onlySelected));
 controls.empty.hidden=matches.length>0;
 controls.empty.textContent=s.onlySelected?'当前筛选下没有已选候选。关闭“只看已选”或调整搜索后继续添加。':'没有匹配的课题。换个关键词试试，或在来源说明中查看官方名单。';
 renderSave();
}
async function open(code,{semester=0,opener=null,initialTopicId=null}={}){
 if(!supported(code)||opening||dialog?.open)return;
 opening=true;
 try{
  const [data,p]=await Promise.all([U.data(),U.plan()]),course=data.courses.find(x=>x.module_code===code);
  if(!course||!data.courseTopics?.entries)throw new Error('课题目录暂不可用，请刷新后重试。');
  const previous=p.items.find(x=>x.code===code)||null;
  if(initialTopicId&&!data.courseTopics.entries.some(x=>x.id===initialTopicId&&x.module===code))throw new Error('课题不属于这个模块，请重新打开详情页。');
  if(!previous&&root.matchMedia?.('(min-width: 961px)').matches&&semester===0)semester=1;
  if(!previous&&(!Number.isInteger(semester)||semester<0||semester>p.timeline.count))throw new Error('目标学期已调整，请重新选择。');
  ensureDialog();
  const previousTopics=C.itemTopics(previous),entries=[...data.courseTopics.entries,...previousTopics.filter(x=>!data.courseTopics.entries.some(t=>t.id===x.id)).map(x=>({...x,module:code}))],draftIds=new Set(previousTopics.map(x=>x.id));
  if(initialTopicId)draftIds.add(initialTopicId);
  session={code,data,entries,plan:p,previous,semester:previous?previous.semester:semester,draftIds,initialTopicId,opener,onlySelected:false};busy=false;
  controls.title.textContent=`${code==='IN2106'?'Praktikum':'Seminar'} 候选课题`;
  const place=previous?.status==='passed'?(previous.semester?`第 ${previous.semester} 学期已通过`:'已通过 · 通过学期未记录'):`${previous?'已在':'将加入'}${destination(p,session.semester)}`;
  controls.context.textContent=`${code} · ${place} · ${previous?.custom?previous.ects:course.ects} ECTS`;
  const terms=[...new Set(entries.filter(x=>x.module===code).map(x=>x.term))].sort().reverse();
  controls.termLabel.hidden=terms.length<2;
  controls.term.innerHTML='<option value="">全部来源学期</option>'+terms.map(term=>`<option value="${term}">${e(C.topicTermLabel(term))}</option>`).join('');
  controls.term.value='';
  controls.sourceTerm.textContent=(terms.length===1?C.topicTermLabel(terms[0])+' · ':'')+'官方余位名单';
  controls.sourceNote.textContent=`${data.courseTopics.checkedOn} 核对；这是部分课题名单，不代表完整开课目录或实时余位。其他学期是否开课、具体要求与名额请向教学团队确认。`;
  controls.sourceLink.href=data.courseTopics.sourceURL;
  controls.query.value='';setError('');renderResults();
  dialog.querySelector('details').open=false;
  dialog.showModal();controls.query.focus();
 }catch(err){session=null;U.toast(err.message);}
 finally{opening=false;}
}
async function save(event){
 event.preventDefault();
 if(!session||busy||saveState(session.previous,session.draftIds).disabled)return;
 const s=session;busy=true;setError('');setBusy(true);renderSave();
 try{
  const change=await U.setCourseTopics(s.code,[...s.draftIds],{semester:s.semester,expectedTopics:C.itemTopics(s.previous),expectedExists:!!s.previous,expectedItem:s.previous});
  if(change.kind==='cancelled')return;
  const latest=await U.plan();
  await refreshStatic();
  if(U.persisted===false){
   s.previous=latest.items.find(x=>x.code===s.code)||null;
   setError('本次选题仅在当前页面有效，未保存到浏览器。请先导出计划备份。');
   return;
  }
  dialog.close();
  if(change.kind==='unchanged')return;
  const message=!s.draftIds.size?'已清空候选，模块和学期安排保留。':change.kind==='added'?`${s.draftIds.size} 个候选与模块已加入${destination(latest,change.semester)}。`:`已保存 ${s.draftIds.size} 个候选课题。`;
  U.toast(message,{label:'撤销',run:async()=>{await U.undoCourse(change);if(U.persisted!==false)U.toast('已撤销选题调整。');}});
 }catch(err){setError(err.message);}
 finally{busy=false;setBusy(false);if(session)renderSave();}
}
function setBusy(value){
 controls.query.disabled=value;controls.term.disabled=value;controls.selectedOnly.disabled=value;controls.clear.disabled=value;
 for(const control of dialog.querySelectorAll('[data-topic-cancel],.topic-picker-choice input'))control.disabled=value;
}
async function refreshStatic(){
 const holders=[...document.querySelectorAll('[data-topic-static]')];if(!holders.length)return;
 const token=++staticRevision;
 try{
  const p=await U.plan();if(token!==staticRevision)return;
  for(const holder of holders){const code=holder.dataset.topicStatic;holder.innerHTML=field(code,C.itemTopics(p.items.find(x=>x.code===code)),{ready:true,target:'detail-semester'});}
 }catch(_){for(const holder of holders)holder.querySelector('button').disabled=true;}
}
api.open=open;
document.addEventListener('click',event=>{
 const opener=event.target.closest('[data-course-topic-open]');if(!opener||opener.disabled)return;
 event.preventDefault();
 const target=opener.dataset.topicTarget?document.getElementById(opener.dataset.topicTarget):null;
 open(opener.dataset.courseTopicOpen,{semester:Number(target?.value??opener.dataset.topicSemester??0),opener,initialTopicId:opener.dataset.topicPick||null});
});
root.addEventListener('rci:planchange',refreshStatic);
refreshStatic();
})(typeof globalThis!=='undefined'?globalThis:this);
