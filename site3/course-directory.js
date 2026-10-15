/* Fast course selection. Search stays local; mutations use the guarded plan API. MIT. */
(function(root){
'use strict';
const node=typeof module==='object'&&module.exports,C=node?require('../assets/core'):root.RCI,S=node?require('./search'):root.RCISearch,e=C.esc;
const terms=t=>String(t||'待核实').replace('WiSe/SoSe','冬／夏').replace('WiSe','冬季').replace('SoSe','夏季');
function view(c,item,names={}){
 const custom=!!item?.custom;
 return {code:c.module_code,title:custom?item.name:c.module_name_legal_2025,chinese:custom?'自录认定':names[c.module_code]||'',ects:custom?item.ects:c.ects,group:custom?item.group:c.section_2025[0],groups:custom?[item.group]:c.allowed_groups||[c.section_2025[0]],term:custom?'个人认定':c.current_term||c.term_legal_annex,language:c.current_language||c.language_legal_annex,note:custom?'保留原有自录名称、学分与归类；是否计入以学校认可为准。':c.recommendation_note||'',automatic:c.automatic_recommendation_eligible!==false,custom,aliases:[c.module_code,c.module_name_legal_2025,names[c.module_code]||'',...(custom?[item.name]:[])],body:(c.notes_cn||'')+' '+(c.type||'')};
}
function category(group=''){return 'GHI'.includes(group)&&group.length===1||group==='professional'?'professional':group==='core'||group.length===1&&'ABCDE'.includes(group)?'core':group==='J'?'J':'';}
function filter(data,plan,state){
 const selected=new Map(plan.items.map(x=>[x.code,x]));
 const docs=data.courses.map(c=>{const v=view(c,selected.get(c.module_code),data.names);return {...v,id:v.code,kind:'course',summary:v.chinese,body:v.body+' '+v.groups.map(k=>C.courseGroups[k]).join(' '),tasks:['study']};});
 const codes=new Set(docs.map(d=>S.normalize(d.code))),compact=S.normalize(state.query);
 const query=codes.has(compact)?compact:String(state.query||'').normalize('NFKC').replace(/\b([a-z]+)\s+(\d+)\b/gi,(text,prefix,digits)=>codes.has((prefix+digits).toLowerCase())?prefix+digits:text);
 return S.search(docs,query,data.synonyms||[]).filter(d=>(!state.group||(state.group==='core'?d.groups.some(k=>'ABCDE'.includes(k)):state.group==='professional'?d.groups.some(k=>'GHI'.includes(k)):d.groups.includes(state.group)))&&(!state.term||d.term.includes(state.term))&&(!state.language||String(d.language).split('/').includes(state.language))&&(!state.selection||(state.selection==='selected'?selected.has(d.code):!selected.has(d.code))));
}
function button(course,item,semester){
 const unknown=!Number.isFinite(Number(course.ects))||Number(course.ects)<=0;
 if(unknown)return {disabled:true,label:'学分待核实',description:'目录学分待核实，暂不能加入',state:'unknown'};
 if(item?.status==='passed')return {disabled:true,label:'✓ 已修',description:'已修通过，无需安排到未来学期',state:'passed'};
 if(item&&item.semester===semester)return {disabled:true,label:'✓ 已加入',description:semester?`已在第 ${semester} 学期`:'已在待分配',state:'selected'};
 return {disabled:false,label:item?'移到这里':'＋ 加入',description:`${item?'将':'把'} ${course.title} ${item?'移到':'加入'}${semester?'第 '+semester+' 学期':'待分配'}`,state:item?'move':'add'};
}
function card(course,item,semester,{base='',ready=true,busy=false}={}){
 const b=button(course,item,semester),assignment=item?.status==='passed'?'已修通过':item?item.semester?`已在第 ${item.semester} 学期`:'已选 · 待分配':'';
 const url=base+'/courses/'+encodeURIComponent(course.code)+'/?semester='+semester;
 const labels={A:'A 机器人',B:'B 认知',C:'C 智能系统',D:'D 研讨',E:'E 实践',F:'F 论文',G:'G 计算',H:'H 机械',I:'I 系统与控制',J:'J 跨学科',K:'K 补修'};
 return `<article class="course-entry${item?' is-selected':''}" id="directory-course-${e(course.code)}"><div class="course-entry-title"><div class="course-entry-codes"><span>${e(course.code)}</span><span>${e(course.groups.map(k=>labels[k]||k).join(' / '))}</span>${assignment?`<span class="course-assignment">${e(assignment)}</span>`:''}</div><h2><a href="${e(url)}">${e(course.title)}</a></h2>${course.chinese?`<p class="course-entry-translation">${e(course.chinese)}</p>`:''}${course.note&&(!course.automatic||course.custom)?`<details class="course-entry-note"><summary>${course.custom?'自录认定说明':'暂不自动推荐 · 查看原因'}</summary><p>${e(course.note)}</p></details>`:''}</div><div class="course-entry-facts"><b>${e(course.ects)} <small>ECTS</small></b><span>${e(terms(course.term))}${course.language?' · '+e(course.language):''}</span></div><button type="button" class="button ${b.state==='add'?'':'secondary'}" data-directory-add="${e(course.code)}" data-state="${b.state}" aria-label="${e(b.description)}"${b.disabled||!ready||busy?' disabled':''}>${busy?'处理中…':b.label}</button></article>`;
}
const api={view,category,filter,button,card};if(node){module.exports=api;return;}root.RCICourseDirectory=api;
const U=root.RCIUI,box=document.getElementById('course-directory');if(!box)return;
const $=selector=>box.querySelector(selector),params=new URLSearchParams(location.search),target=$('#course-target-semester'),query=$('#page-search'),group=$('#group-filter'),term=$('#term-filter'),language=$('#directory-language'),selection=$('#directory-selection'),results=$('#results'),count=$('#result-count'),undo=$('#directory-undo');
let db,plan,semester=null,limit=24,renderId=0,debounce=null,lastChange=null,focusAfter=null,message='';
const pending=new Set(),desktopMedia=root.matchMedia?.('(min-width: 961px)');
function updateDesktopLabels(){if(desktopMedia)for(const option of term.querySelectorAll('[data-desktop-label]')){option.dataset.originalLabel??=option.textContent;option.textContent=desktopMedia.matches?option.dataset.desktopLabel:option.dataset.originalLabel;}}
updateDesktopLabels();
desktopMedia?.addEventListener('change',()=>{updateDesktopLabels();render();});
query.value=(params.get('q')||'').slice(0,160);group.value=params.get('group')||'';term.value=params.get('term')||'';language.value=params.get('language')||'';selection.value=params.get('selection')||'';
if(params.has('semester')){const n=Number(params.get('semester'));semester=Number.isInteger(n)&&n>=0&&n<=12?n:0;}
function state(){return {query:query.value,group:group.value,term:term.value,language:language.value,selection:selection.value};}
function updateURL(){const values=state(),next=new URLSearchParams();for(const [key,value] of [['q',values.query.trim()],['group',values.group],['term',values.term],['language',values.language],['selection',values.selection],['semester',String(semester)]])if(value)next.set(key,value);history.replaceState(null,'',location.pathname+(next.size?'?'+next:'')+location.hash);}
function notice(text,change){message=text;if(change!==undefined)lastChange=change;$('#directory-status').textContent=message;$('#directory-feedback').hidden=!message;undo.hidden=!lastChange;}
function render(){
 if(!db||!plan)return;
 const chosen=new Map(plan.items.map(x=>[x.code,x])),list=filter(db,plan,state());
 count.textContent=`${query.value.trim()?'“'+query.value.trim()+'” · ':''}${list.length} 门课程${desktopMedia?.matches&&list.length>limit?' · 已显示 '+limit+' 门':''}`;
 results.innerHTML=list.length?list.slice(0,limit).map(c=>card(c,chosen.get(c.code),semester,{base:U.base,busy:pending.has(c.code)})).join(''):'<div class="catalog-empty"><h2>没有找到对应课程</h2><p>试试课程代码，或清除筛选。</p><button type="button" class="button secondary" data-directory-reset>清除搜索与筛选</button></div>';
 $('#more-results').hidden=list.length<=limit;
 $('[data-directory-clear-query]').hidden=!query.value;
 const active=category(group.value);
 for(const chip of box.querySelectorAll('[data-course-category]'))chip.setAttribute('aria-pressed',String(chip.dataset.courseCategory===(chip.closest('#directory-subcategories')?group.value:active)));
 $('#directory-subcategories').hidden=active!=='professional';
 const advanced=[['term',term,terms(term.value)],['language',language,language.value==='EN'?'英语':'德语'],['selection',selection,selection.value==='unselected'?'未加入计划':'已加入／已修']].filter(([,el])=>el.value);
 if(group.value&&group.value!==active&&!['G','H','I'].includes(group.value))advanced.unshift(['group',group,C.courseGroups[group.value]||group.value]);
 $('#directory-active-filters').hidden=!advanced.length;
 $('#directory-active-filters').innerHTML=advanced.map(([key,,label])=>`<button type="button" data-remove-directory-filter="${key}" aria-label="移除筛选：${e(label)}">${e(label)} <span aria-hidden="true">×</span></button>`).join('');
 $('#directory-filter-count').textContent=String(advanced.length);$('#directory-filter-count').hidden=!advanced.length;
 $('#reset-filters').hidden=!Object.values(state()).some(Boolean);
 updateURL();
 if(focusAfter){const buttons=[...results.querySelectorAll('[data-directory-add]')],index=buttons.findIndex(b=>b.dataset.directoryAdd===focusAfter),own=buttons[index];(own&&!own.disabled?own:own?.closest('article').querySelector('h2 a')||buttons.slice(index+1).find(b=>!b.disabled)||count).focus({preventScroll:true});focusAfter=null;}
}
async function refresh(){
 const id=++renderId;db=db||await U.data();const next=await U.plan();if(id!==renderId)return;plan=next;
 if(semester===null)semester=plan.preferences.startSemester;
 if(semester>plan.timeline.count){semester=0;notice('原目标学期已移除，已切换为待分配。',null);}
 target.innerHTML=Array.from({length:plan.timeline.count},(_,i)=>`<option value="${i+1}">${e(C.semesterLabel(plan.timeline,i+1))}</option>`).join('')+'<option value="0">先选课，稍后分配</option>';target.value=String(semester);target.disabled=false;
 const items=plan.items.filter(x=>x.status!=='passed'&&x.semester===semester),ects=items.reduce((n,item)=>n+Number(item.custom?item.ects:db.courses.find(c=>c.module_code===item.code)?.ects||0),0);
 $('#directory-target-credits').textContent=semester?`${ects} ECTS`:'待分配';
 render();
}
const update=()=>refresh().catch(error=>notice(error.message+'；现有记录没有修改。',null));
async function undoChange(change){await U.undoCourse(change);notice('已撤销，原来的安排已恢复。',null);await update();}
function reset(){query.value='';group.value='';term.value='';language.value='';selection.value='';limit=24;render();query.focus({preventScroll:true});}
query.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{limit=24;render();},100);});
box.querySelector('form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(debounce);limit=24;render();});
for(const input of [group,term,language,selection])input.addEventListener('change',()=>{limit=24;render();});
target.addEventListener('change',async()=>{semester=Number(target.value);await update();});
$('#reset-filters').addEventListener('click',reset);
box.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-course-category')){group.value=b.dataset.courseCategory;limit=24;render();return;}
 if(b.hasAttribute('data-directory-clear-query')){query.value='';clearTimeout(debounce);limit=24;render();query.focus({preventScroll:true});return;}
 if(b.hasAttribute('data-directory-reset')){reset();return;}
 if(b.hasAttribute('data-directory-close-filters')){$('#catalog-filter-options').open=false;$('#catalog-filter-options').querySelector('summary').focus({preventScroll:true});return;}
 if(b.hasAttribute('data-remove-directory-filter')){({group,term,language,selection})[b.dataset.removeDirectoryFilter].value='';limit=24;render();return;}
 if(b.id==='more-results'){const before=limit;limit+=24;render();results.children[before]?.querySelector('h2 a')?.focus({preventScroll:true});return;}
 if(b.id==='directory-undo'&&lastChange){
  b.disabled=true;try{await undoChange(lastChange);}catch(error){notice(error.message,null);}finally{b.disabled=false;}return;
 }
 if(!b.hasAttribute('data-directory-add'))return;
 const code=b.dataset.directoryAdd;if(pending.has(code))return;pending.add(code);b.disabled=true;
 const focused=document.activeElement===b,destination=semester;
 try{
  const change=await U.addCourse(code,destination,{moveExisting:true});
  if(!['cancelled','unchanged'].includes(change.kind)){
   notice(`${code} 已${change.kind==='moved'?'移到':'加入'}${change.semester?'第 '+change.semester+' 学期':'待分配'}${U.persisted?'':'（仅本页有效，请备份）'}。`,change);
   const rect=$('#directory-feedback').getBoundingClientRect();
   if(rect.top<64||rect.bottom>root.innerHeight)U.toast(message,{label:'撤销',run:()=>undoChange(change)});
  }
  if(focused)focusAfter=code;
 }catch(error){notice(error.message,null);}finally{pending.delete(code);await update();}
});
box.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#catalog-filter-options').open){$('#catalog-filter-options').open=false;$('#catalog-filter-options').querySelector('summary').focus({preventScroll:true});}});
document.addEventListener('click',event=>{const filters=$('#catalog-filter-options');if(filters.open&&!filters.contains(event.target))filters.open=false;});
root.addEventListener('rci:planchange',update);
update();
})(typeof globalThis!=='undefined'?globalThis:this);
