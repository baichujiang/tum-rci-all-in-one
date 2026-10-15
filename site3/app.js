/* Shared student interactions. Public links and answers also work without JS. */
(function(){
'use strict';
const C=window.RCI,esc=C.esc,base=document.querySelector('meta[name="rci-base"]').content;
const B=window.RCIBackup;
const $=s=>document.querySelector(s),full=p=>base+p;
let timer,dbPromise,sessionPlan=null,currentPlan=null,planPersisted=true;
let planQueue=Promise.resolve();
let recoveryBlocked=false,recoveryBefore=null,recoveryPromise=null,storageUnavailable=false;
let indexed;
try{indexed=typeof indexedDB==='undefined'?undefined:indexedDB;}catch(_){}
const localLock=window.RCILocalLock?.create({locks:typeof navigator==='undefined'?undefined:navigator.locks,indexedDB:indexed});
function pendingRecovery(){
 if(!B)return null;
 let raw;try{raw=localStorage.getItem(B.keys.journal);}catch(_){storageUnavailable=true;return null;}
 return B.pending({getItem:()=>raw});
}
if(B)try{const pending=pendingRecovery();if(pending){recoveryBlocked=true;recoveryBefore=pending.before;}}catch(_){recoveryBlocked=true;}
if(storageUnavailable)planPersisted=false;
async function withLocalLock(work){
 if(storageUnavailable)return work();
 try{
  if(!localLock)throw Object.assign(new Error(),{lockUnavailable:true});
  return await localLock.run(work);
 }catch(err){
  if(err.lockLost){storageUnavailable=true;planPersisted=false;favoritesPersisted=false;throw err;}
  if(!err.lockUnavailable)throw err;
  storageUnavailable=true;planPersisted=false;favoritesPersisted=false;
  toast('浏览器无法安全保存。本次修改仅在当前页面有效，请导出备份后刷新重试。');
  return work();
 }
}
let selectedSemester=Number(new URLSearchParams(location.search).get('semester'))||0;
if(!Number.isInteger(selectedSemester)||selectedSemester<0||selectedSemester>12)selectedSemester=0;
function toast(message,action){
 const el=$('#toast');clearTimeout(timer);el.replaceChildren();
 const label=document.createElement('span');label.textContent=message;el.append(label);
 if(action){
  const b=document.createElement(action.href?'a':'button');b.textContent=action.label;
  if(action.href)b.href=action.href;
  else{b.type='button';b.addEventListener('click',async()=>{clearTimeout(timer);el.replaceChildren();try{await action.run();}catch(err){toast(err.message);}});}
  el.append(b);
 }
 timer=setTimeout(()=>{if(!el.contains(document.activeElement))el.replaceChildren();},action?12000:6500);
}
function read(key,fallback){try{const before=recoveryBefore&&(key===B.keys.plan?'plan':key===B.keys.favorites?'favorites':null);return JSON.parse(before?recoveryBefore[before]:localStorage.getItem(key))??fallback;}catch(_){return fallback;}}
function record(key,fallback){
 let raw;try{raw=recoveryBefore?recoveryBefore[key===B.keys.plan?'plan':'favorites']:localStorage.getItem(key);}catch(_){storageUnavailable=true;if(key==='rci:v2:plan'&&currentPlan)return currentPlan;if(key==='rci:v2:saves')return [...saved];return read(key,fallback);}
 try{return raw===null?fallback:JSON.parse(raw);}catch(_){throw new Error('本地记录无法读取，请先导出原始记录。');}
}
function requireRecovered(){if(recoveryBlocked||pendingRecovery())throw new Error('本地记录尚未恢复，请刷新以恢复，或先导出原始记录。');}
function store(key,value,guard){try{requireRecovered();guard?.();}catch(err){if(err.lockLost)storageUnavailable=true;toast(err.message);return false;}try{if(storageUnavailable||!guard)throw new Error();localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){storageUnavailable=true;toast('浏览器不允许保存。本次修改仅在当前页面有效，请导出备份后刷新重试。');return false;}}
async function load(p){const r=await fetch(full(p));if(!r.ok)throw new Error('资料加载失败，请刷新重试');return r.json();}
const data=()=>dbPromise||(dbPromise=load('/assets/planner-data.json'));
const empty=()=>({version:2,cohort:'unknown',conditional:false,items:[]});
async function plan(){const d=await data();currentPlan=C.validatePlan(sessionPlan||record('rci:v2:plan',empty()),d.courses);return currentPlan;}
function updatePlan(change){
 const task=planQueue.catch(()=>{}).then(async()=>{
  const d=await data();
  const {p,before}=await withLocalLock(async guard=>{
   requireRecovered();
   if(planPersisted)sessionPlan=null;
   let before;try{before=localStorage.getItem('rci:v2:plan');}catch(_){}
   const p=await plan();guard?.();return {p,before};
  });
  const next=await change(p);
  if(!next)return p;
  return withLocalLock(guard=>{
   requireRecovered();
   if(before!==undefined&&localStorage.getItem('rci:v2:plan')!==before)throw new Error('计划已在其他页面更新，请重新操作，避免覆盖新记录。');
   sessionPlan=C.validatePlan(next,d.courses);planPersisted=store('rci:v2:plan',sessionPlan,guard);currentPlan=sessionPlan;
   window.dispatchEvent(new Event('rci:planchange'));return sessionPlan;
  });
 });
 planQueue=task;return task;
}
async function addCourse(code,semester=0,{moveExisting=false}={}){
 code=String(code).trim().toUpperCase();let result={kind:'cancelled'};
 await updatePlan(async p=>{
  const d=await data(),course=d.courses.find(c=>c.module_code===code);
  if(!course)throw new Error('没有找到这门课程，请刷新目录重试。');
  if(!Number.isInteger(semester)||semester<0||semester>p.timeline.count)throw new Error('目标学期已调整，请重新选择。');
  const previous=p.items.find(x=>x.code===code);
  if(previous&&(previous.status==='passed'||!moveExisting||previous.semester===semester)){result={kind:'unchanged',code,semester:previous.semester};return null;}
  const other=code==='IN2067'?'ED160028':code==='ED160028'?'IN2067':null;
  const replaced=p.items.find(x=>x.code===other);
  if(replaced?.status==='passed')throw new Error(`已修 ${other} 与这门课二选一，不能替换已修成绩。若记录有误，请先在已修列表取消该记录。`);
  const target=semester||(!previous&&replaced?.semester)||0;
  if(target&&!previous?.custom){
   const offer=window.RCICourseContext?window.RCICourseContext.offering(p,course,target,d.offerings||{}):C.offering(course,C.semesterSeason(p.timeline,target));
   if(offer.state==='conflict'&&!await confirmAction('目录季节与安排不符',`这门课在目录中仅${offer.label}开课，你正在安排到${C.semesterLabel(p.timeline,target)}。若已确认实际开课有变化，可以继续安排。`,'仍安排到这个学期'))return null;
  }
  if(replaced&&!await confirmAction('这两门课是二选一',`计划已有 ${d.names[other]||other}（${other}）。改选 ${d.names[code]||code} 后，会移除原课程，学分不会重复计入。`,'改选这门课'))return null;
  const applied=previous?{...previous,semester:target}:{code,status:'planned',semester:target};
  result={kind:previous?'moved':replaced?'replaced':'added',code,semester:target,previous:previous||null,replaced:replaced||null,applied};
  return {...p,items:[...p.items.filter(x=>x.code!==code&&x.code!==other),applied]};
 });
 return result;
}
async function undoCourse(change){
 return updatePlan(p=>{
  const item=p.items.find(x=>x.code===change.code);
  if(!item||item.semester!==change.semester||item.status!==change.applied.status||(item.locked??false)!==(change.applied.locked??false)||item.group!==change.applied.group||['custom','name','ects'].some(k=>item[k]!==change.applied[k]))throw new Error('这门课已有其他调整，请在学期卡片中修改。');
  const fit=x=>({...x,semester:x.status==='passed'||x.semester<=p.timeline.count?x.semester:0});
  const items=p.items.filter(x=>x.code!==change.code);
  if(change.previous)items.push(fit(change.previous));
  if(change.replaced)items.push(fit(change.replaced));
  return {...p,items};
 });
}
async function moveCourse(code,semester){
 code=String(code).trim().toUpperCase();let result={kind:'cancelled'};
 await updatePlan(async p=>{
  if(!Number.isInteger(semester)||semester<0||semester>p.timeline.count)throw new Error('目标学期已调整，请重新选择。');
  const previous=p.items.find(x=>x.code===code);
  if(!previous)throw new Error('这门课已不在计划中，请重新选择。');
  if(previous.status==='passed')throw new Error('这门课已修通过，不需要安排到未来学期。');
  if(previous.semester===semester){result={kind:'unchanged',code,semester};return null;}
  const d=await data(),course=d.courses.find(c=>c.module_code===code);
  if(semester&&course&&!previous.custom){
   const offer=window.RCICourseContext?window.RCICourseContext.offering(p,course,semester,d.offerings||{}):C.offering(course,C.semesterSeason(p.timeline,semester));
   if(offer.state==='conflict'&&!await confirmAction('目录季节与安排不符',`这门课在目录中仅${offer.label}开课，你正在安排到${C.semesterLabel(p.timeline,semester)}。若已确认实际开课有变化，可以继续安排。`,'仍安排到这个学期'))return null;
  }
  const applied={...previous,semester};
  result={kind:'moved',code,semester,previous,applied,replaced:null};
  return {...p,items:p.items.map(x=>x.code===code?applied:x)};
 });
 return result;
}
const savePlan=p=>updatePlan(()=>p);
async function clearPlan(){
 let cleared=false;
 await updatePlan(async()=>{
  if(!await confirmAction('清空这份计划？','课程、学期安排、入学批次和补修设置会一起清空。建议先导出备份。','清空计划'))return null;
  cleared=true;return empty();
 });
 return cleared;
}
function confirmAction(title,description,confirmLabel){
 const dialog=$('#action-dialog');
 if(!dialog?.showModal)return Promise.resolve(window.confirm(title+'\n'+description));
 if(dialog.open)return Promise.resolve(false);
 $('#dialog-title').textContent=title;$('#dialog-description').textContent=description;$('#dialog-confirm').textContent=confirmLabel;
 dialog.returnValue='cancel';dialog.showModal();
 return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
window.RCIUI={toast,read,store,data,plan,savePlan,clearPlan,updatePlan,empty,base,confirmAction,addCourse,moveCourse,undoCourse,get persisted(){return planPersisted;}};

const savedRaw=read('rci:v2:saves',[]);
let saved=new Set(Array.isArray(savedRaw)?savedRaw.filter(x=>typeof x==='string'):[]);
let favoritesPersisted=!storageUnavailable;
Object.defineProperty(window.RCIUI,'backupPersisted',{get:()=>planPersisted&&favoritesPersisted&&!storageUnavailable});
const favoriteFamilies=new Map();
for(const family of JSON.parse($('meta[name="rci-favorite-groups"]')?.content||'[]'))for(const key of family)favoriteFamilies.set(key,family);
const favoriteKeysFor=key=>[key,...(favoriteFamilies.get(key)||[]).filter(other=>other!==key)];
const countFavorites=values=>new Set(values.map(key=>favoriteFamilies.get(key)?.[0]||key)).size;
window.RCIUI.countFavorites=countFavorites;
function syncSaves(){
 document.querySelectorAll('[data-save]').forEach(b=>{
  const yes=favoriteKeysFor(b.dataset.save).some(key=>saved.has(key));b.setAttribute('aria-pressed',String(yes));
  if(b.dataset.saveStyle==='star'){
   const label=(yes?'取消收藏 ':'收藏 ')+b.dataset.saveName;b.setAttribute('aria-label',label);b.title=label;
  }else b.textContent=yes?'已收藏':'收藏';
 });
 document.querySelectorAll('[data-save-count]').forEach(el=>{el.textContent=countFavorites([...saved]);el.hidden=!saved.size;});
}
async function setSaved(keys,value){
 return withLocalLock(guard=>{
  requireRecovered();
  if(favoritesPersisted){
   let latest;try{latest=record('rci:v2:saves',[]);if(B)latest=B.favorites(latest);if(!Array.isArray(latest))throw new Error();}
   catch(_){throw new Error('本地收藏记录无法读取，请先导出原始记录。');}
   saved=new Set(latest.filter(x=>typeof x==='string'));
  }
  const previous=[...saved].filter(key=>keys.includes(key)),adding=value===undefined?!previous.length:value;
  const next=new Set(saved);
  for(const key of adding&&value===undefined?keys.slice(0,1):keys)adding?next.add(key):next.delete(key);
  if(next.size>2000)throw new Error('收藏最多支持 2000 条记录，请先取消部分收藏。当前记录未修改。');
  if(B)B.favorites([...next]);saved=next;
  const ok=store('rci:v2:saves',[...saved],guard);favoritesPersisted=ok;syncSaves();window.dispatchEvent(new Event('rci:saveschange'));return {ok,adding,previous};
 });
}
async function currentBackupState(){
 const d=await data();
 const p=planPersisted?C.validatePlan(record(B.keys.plan,empty()),d.courses):await plan();
 const f=favoritesPersisted?record(B.keys.favorites,[]):[...saved];
 const value=B.state({plan:p,favorites:f},d.courses);currentPlan=value.plan;saved=new Set(value.favorites);return value;
}
async function backupSnapshot(){
 await data();await planQueue.catch(()=>{});if(recoveryPromise)await recoveryPromise;
 return withLocalLock(async guard=>{
  requireRecovered();
  const value=await currentBackupState();guard?.();let raw=null;try{raw=B.capture(localStorage);}catch(_){}
  return {data:value,fingerprint:B.fingerprint(value),raw};
 });
}
function importBackup(incoming,mode,expected){
 const task=planQueue.catch(()=>{}).then(async()=>{
  if(recoveryPromise)await recoveryPromise;
  const d=await data();
  return withLocalLock(async guard=>{
   requireRecovered();
   if(storageUnavailable)throw new Error('浏览器无法持久保存导入。请先导出当前计划，再刷新页面重试。');
   const before=await currentBackupState();
   if(expected&&B.fingerprint(before)!==expected.fingerprint)throw new Error('当前数据已更新，请重新核对导入预览。');
   const next=B.prepare(before,incoming,mode,d.courses);
   guard?.();B.commit(localStorage,next,{expected:expected?.raw,beforeBackup:B.create(before,d.courses)});
   sessionPlan=next.plan;currentPlan=next.plan;planPersisted=true;favoritesPersisted=true;saved=new Set(next.favorites);
   syncSaves();window.dispatchEvent(new Event('rci:planchange'));window.dispatchEvent(new Event('rci:saveschange'));
   return next;
  });
 });planQueue=task;return task;
}
if(B)Object.assign(window.RCIUI,{backupSnapshot,importBackup,getBackupHistory:()=>B.history(localStorage),rawBackup:()=>({type:'tum-rci-raw-backup',version:1,createdAt:new Date().toISOString(),records:{...B.capture(localStorage),checklist:localStorage.getItem('rci:v2:checklist')},recovery:localStorage.getItem(B.keys.journal)})});
function syncAddButtons(){
 if(!currentPlan)return;
 const codes=new Set(currentPlan.items.map(x=>x.code));
 document.querySelectorAll('[data-add]').forEach(b=>{
  const yes=codes.has(b.dataset.add);const unknown=b.dataset.creditUnknown==='true';b.disabled=yes||unknown;b.setAttribute('aria-pressed',String(yes));b.textContent=unknown?'学分待核实':yes?'✓ 已加入':selectedSemester?`加入第 ${selectedSemester} 学期`:'加入计划';
 });
}
async function syncPlanWidgets(){
 try{
  const [p,d]=await Promise.all([plan(),data()]);currentPlan=p;const calc=C.calculate(p,d.courses);
  if(selectedSemester>p.timeline.count)selectedSemester=0;
  const target=$('#course-target-semester');
  if(target&&!previous?.custom){
   target.innerHTML='<option value="0">先选课，稍后分配</option>'+Array.from({length:p.timeline.count},(_,i)=>`<option value="${i+1}">${C.semesterLabel(p.timeline,i+1)}</option>`).join('');target.value=selectedSemester;
   $('#course-semester-context').hidden=false;
  }
  document.querySelectorAll('[data-plan-count]').forEach(el=>{el.textContent=p.items.length;el.hidden=el.classList.contains('plan-badge')&&!p.items.length;});
  document.querySelectorAll('[data-plan-credits]').forEach(el=>{el.textContent=calc.allocated;});
  const heading=$('[data-plan-heading]');
  if(heading){
   const has=p.items.length>0;heading.textContent=has?'继续你的学分计划':'从第一门课开始';
   $('[data-plan-description]').textContent=has?`已选 ${p.items.length} 门 · ${p.timeline.count} 学期规划 · 计入 ${calc.allocated} ECTS。回来继续安排。`:'先了解学分结构，再按冬夏学期安排课程。';
   $('[data-plan-cta]').textContent=has?'继续我的计划':'开始选课与规划';heading.closest('a').href=full(has?'/planner/':'/study/');
  }
  syncAddButtons();
 }catch(_){document.querySelectorAll('[data-plan-description]').forEach(el=>{el.textContent='已有计划暂时无法读取，请到计划页查看并备份。';});}
}
window.addEventListener('rci:planchange',syncPlanWidgets);

// A small website directory: direct links stay usable if enhancement fails.
if($('#portal-controls')){
 $('#portal-controls').hidden=false;
 const directory=$('#websites'),input=$('#portal-search'),cards=[...directory.querySelectorAll('[data-portal]')];
 const entries=cards.map(card=>({id:card.dataset.portal,kind:'resource',title:card.querySelector('h3').textContent,summary:card.querySelector('p').textContent,body:card.dataset.keywords.replace(/(?:[\w-]+\.)+[a-z]{2,}/gi,host=>host.replace(/\.[a-z]+$/i,'')),hosts:card.dataset.keywords.match(/(?:[\w-]+\.)+[a-z]{2,}/gi)||[],aliases:[],tasks:[]}));
 function filterPortals(){
  const q=window.RCISearch.normalize(input.value),matches=new Set(window.RCISearch.search(entries,input.value).map(d=>d.id));let count=0;
  if(q.length>3)for(const entry of entries)if(entry.hosts.some(host=>window.RCISearch.normalize(host).includes(q)))matches.add(entry.id);
  for(const card of cards){card.hidden=!matches.has(card.dataset.portal);if(!card.hidden)count++;}
  directory.querySelectorAll('[data-portal-module]').forEach(section=>{section.hidden=!section.querySelector('[data-portal]:not([hidden])');});
  $('#portal-empty').hidden=count>0;
  $('#portal-status').textContent=q?`找到 ${count} 个网站`:'点星标，网站会直接出现在上方「我的收藏」。';
 }
 input.addEventListener('input',filterPortals);
 $('[data-portal-reset]').addEventListener('click',()=>{input.value='';filterPortals();input.focus();});
}
function dest(d){return d.direct?C.safeURL(d.url):/^\/[a-zA-Z0-9/?#&=._%+-]*$/.test(d.url)?full(d.url)+(d.kind==='course'&&selectedSemester?'?semester='+selectedSemester:''):full('/search/');}
const groupNames=C.courseGroups;
const starIcon=$('.header-favorites svg').outerHTML;
const termLabel=t=>String(t||'').replace('WiSe/SoSe','冬季 / 夏季').replace('WiSe','冬季').replace('SoSe','夏季');
function favoriteKey(d){return [d.id,d.code,...(d.resource_ids||[])].find(key=>key&&saved.has(key));}
function resultCard(d,saveKey=favoriteKey(d)||d.id,asFavorite=false){
 const a=`href="${esc(dest(d))}"${d.direct?' target="_blank" rel="noopener noreferrer"':''}`;
 if(asFavorite)return `<article class="portal-card" data-favorite="${esc(saveKey)}"><a class="portal-link shortcut" ${a}><span class="portal-icon">${starIcon}</span><h3>${esc(d.title)}</h3><p>${esc(d.summary)}</p><div class="portal-meta"><span>${d.direct?'打开原始网站':'打开'+(d.kind==='course'?'课程详情':'收藏内容')}</span><span aria-hidden="true">${d.direct?'↗':'→'}</span></div></a><button class="portal-save" data-save="${esc(saveKey)}" data-save-style="star" data-save-name="${esc(d.title)}" aria-label="取消收藏 ${esc(d.title)}" aria-pressed="true">${starIcon}</button></article>`;
 if(d.kind==='course'&&!asFavorite)return `<article class="card course-choice"><div class="card-top"><span class="badge">${esc((d.groups||[d.group]).map(k=>groupNames[k]).join(' / '))}</span><span class="code">${esc(d.code)}</span></div><h3><a ${a}>${esc(d.title)}</a></h3><p class="english">${esc(d.chinese||'')}</p><div class="course-meta"><b>${esc(d.ects)} <small>ECTS</small></b><span>${esc(termLabel(d.term))} · 目录</span></div>${d.recommendation_note?`<p class="meta">${esc(d.recommendation_note)}</p>`:''}<div class="card-bottom"><button class="quiet" data-add="${esc(d.code)}" aria-pressed="false"${Number.isFinite(Number(d.ects))?'':' data-credit-unknown="true" disabled'}>${Number.isFinite(Number(d.ects))?'加入计划':'学分待核实'}</button></div></article>`;
 const kinds={guide:'问题解答',resource:'原始入口',topic:'历史课题',tool:'工具',course:'课程'},key=saveKey;
 return `<article class="card search-result"><div class="card-top"><span class="badge">${kinds[d.kind]}</span>${d.historical?'<span class="badge history">历史快照</span>':''}</div><h3><a ${a}>${esc(d.title)}</a></h3><p>${esc(d.summary)}</p><p class="meta">${esc(d.status)}${d.cohort?'<br>'+esc(d.cohort):''}</p><div class="card-bottom"><button class="quiet" data-save="${esc(key)}" aria-pressed="${saved.has(key)}">${saved.has(key)?'已收藏':'收藏'}</button></div></article>`;
}
const favoritesApp=$('#favorites-app');
if(favoritesApp){
 let index=null,failed=false;
 const cards=[...favoritesApp.querySelectorAll('[data-portal]')],shortcutIds=new Set(cards.map(card=>card.dataset.portal));
 function renderFavorites(){
  const total=countFavorites([...saved]);
  let websiteCount=0;
  for(const card of cards){card.hidden=!saved.has(card.dataset.portal);if(!card.hidden)websiteCount++;}
  const other=index?index.docs.flatMap(d=>{const key=[d.id,d.code,...(d.resource_ids||[])].find(k=>k&&!shortcutIds.has(k)&&saved.has(k));return key?[{doc:d,key}]:[];}):[];
  $('[data-favorites-section="websites"]').hidden=!websiteCount;
  $('[data-favorites-section="other"]').hidden=!other.length;
  $('#favorites-other').innerHTML=other.map(({doc,key})=>resultCard(doc,key,true)).join('');
  $('#favorites-loading').hidden=!!index||failed||!saved.size;
  $('#favorites-empty').hidden=!!saved.size&&(!index||websiteCount+other.length>0);
  $('#favorites-status').textContent=failed&&total>websiteCount?'其他收藏暂时无法读取，请刷新重试。':index&&total>websiteCount+other.length?'部分旧收藏未找到对应内容，已显示可用的入口。':'';
  syncSaves();syncAddButtons();
 }
 renderFavorites();
 load('/assets/search-index.json').then(d=>{index=d;renderFavorites();}).catch(()=>{failed=true;renderFavorites();});
 window.addEventListener('rci:saveschange',renderFavorites);
}
const app=$('#search-app');
if(app){
 let index,limit=18;
 const params=new URLSearchParams(location.search),q=$('#page-search'),kind=$('#kind-filter'),task=$('#task-filter'),sg=$('#group-filter'),term=$('#term-filter'),sf=$('#saved-filter');
 q.value=(params.get('q')||'').slice(0,160);kind.value=params.get('kind')||'';task.value=params.get('task')||'';sf.checked=params.get('saved')==='1';
 if(app.dataset.mode==='courses'){kind.value='course';kind.closest('label').hidden=true;task.value='';task.closest('label').hidden=true;q.placeholder='课程名或代码，如：机器学习、IN2067';sf.closest('label').hidden=true;sf.checked=false;}
 if(app.dataset.mode==='resources'){kind.value='resource';kind.closest('label').hidden=true;}
 if(sg)sg.value=params.get('group')||'';if(term)term.value=params.get('term')||'';
 function updateURL(){const p=new URLSearchParams();for(const [k,v] of [['q',q.value.trim()],['kind',kind.closest('label').hidden?'':kind.value],['task',task.value],['group',sg?.value],['term',term?.value],['saved',sf.checked?'1':''],['semester',selectedSemester?String(selectedSemester):'']])if(v)p.set(k,v);history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);}
 function render(){
  if(!index)return;let results=window.RCISearch.search(index.docs,q.value,index.synonyms,{kind:kind.value,task:task.value});
  if(sg?.value)results=results.filter(d=>sg.value==='core'?'ABCDE'.includes(d.group):sg.value==='professional'?'GHI'.includes(d.group):(d.groups||[d.group]).includes(sg.value));
  if(term?.value)results=results.filter(d=>d.term?.includes(term.value));if(sf.checked)results=results.filter(d=>favoriteKey(d));
  $('#result-count').textContent=`${q.value.trim()?'“'+q.value.trim()+'”：':''}找到 ${results.length} ${app.dataset.mode==='courses'?'门课程':'条内容'}${sf.checked?' · 仅收藏':''}`;
  const hasFilters=!!(q.value.trim()||(!kind.closest('label').hidden&&kind.value)||task.value||sg?.value||term?.value||sf.checked);
  $('#reset-filters').hidden=!hasFilters||!results.length;
  const el=$('#results');el.innerHTML=results.length?results.slice(0,limit).map(d=>resultCard(d)).join(''):`<div class="empty"><h2>${sf.checked?'没有匹配的收藏':'没有找到匹配的内容'}</h2><p>试试中文名、课程代码或官方名称，也可以清除筛选重新选择。</p><div class="actions"><button class="button secondary" data-reset-search>清除筛选</button><a class="text-link" href="${full('/study/')}">回到选课指南 →</a></div></div>`;
  $('#more-results').hidden=results.length<=limit;syncSaves();syncAddButtons();updateURL();
 }
 function reset(){q.value='';kind.value=app.dataset.mode==='courses'?'course':app.dataset.mode==='resources'?'resource':'';task.value='';if(sg)sg.value='';if(term)term.value='';sf.checked=false;limit=18;render();q.focus();}
 let debounce;q.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{limit=18;render();},120);});
 app.querySelector('form').addEventListener('submit',ev=>{ev.preventDefault();clearTimeout(debounce);limit=18;render();$('#result-count').focus();});
 [kind,task,sg,term,sf].filter(Boolean).forEach(el=>el.addEventListener('change',()=>{limit=18;render();}));
 $('#reset-filters').addEventListener('click',reset);app.addEventListener('click',ev=>{if(ev.target.closest('[data-reset-search]'))reset();});
 $('#more-results').addEventListener('click',()=>{
  const before=$('#results').children.length;limit+=18;render();
  $('#results').children[before]?.querySelector('h3 a,a,button')?.focus();
 });
 load('/assets/search-index.json').then(d=>{index=d;render();}).catch(err=>{$('#result-count').textContent=err.message+'。下方静态课程目录和链接仍可使用。';});
 window.addEventListener('rci:saveschange',render);
 const target=$('#course-target-semester');
 if(target)target.addEventListener('change',()=>{selectedSemester=Number(target.value);render();syncAddButtons();});
}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-save')){
  try{
  const inFavorites=!!b.closest('[data-favorites-surface]'),{ok,adding,previous}=await setSaved(favoriteKeysFor(b.dataset.save));
  if(ok&&(b.dataset.saveStyle==='star'||favoritesApp)){
   if(adding)toast('已加入我的收藏',{label:'查看收藏',href:full('/#bookmarks')});
   else toast('已取消收藏',{label:'撤销',run:async()=>{if((await setSaved(previous,true)).ok)toast('已恢复收藏');}});
  }
  if(inFavorites&&!adding){const next=[...favoritesApp.querySelectorAll('[data-save]')].find(el=>!el.closest('[hidden]'));(next||$('#portal-search')||$('#favorites-return')).focus();}
  }catch(err){toast(err.message);}
 }
 if(b.hasAttribute('data-share')){try{await navigator.clipboard.writeText(location.href);toast('已复制本页网址。');}catch(_){window.prompt('复制这个页面的网址：',location.href);}}
 if(b.hasAttribute('data-add')){
  b.disabled=true;
  try{
   const result=await addCourse(b.dataset.add,selectedSemester);
   if(result.kind!=='cancelled'&&result.kind!=='unchanged'&&planPersisted)toast(result.semester?`已加入第 ${result.semester} 学期，学分已更新。`:'已加入待分配，接下来安排到具体学期。',{label:'查看计划',href:full('/planner/')});
  }catch(err){toast(err.message);}finally{b.disabled=false;syncAddButtons();}
 }
});
window.addEventListener('storage',ev=>{
 if(B)try{if(B.pending(localStorage))return;}catch(_){return;}
 const imported=B&&ev.key===B.keys.journal&&ev.newValue===null;
 if(planPersisted&&!storageUnavailable&&(ev.key==='rci:v2:plan'||ev.key===null||imported)){sessionPlan=null;window.dispatchEvent(new Event('rci:planchange'));}
 if(favoritesPersisted&&!storageUnavailable&&(ev.key==='rci:v2:saves'||ev.key===null||imported)){const v=read('rci:v2:saves',[...saved]);saved=new Set(Array.isArray(v)?v:[]);syncSaves();window.dispatchEvent(new Event('rci:saveschange'));}
});
if(recoveryBlocked&&B){
 recoveryPromise=withLocalLock(guard=>{if(storageUnavailable)throw new Error('请先导出原始记录，再刷新重试。');guard?.();return B.recover(localStorage);}).then(()=>{
  recoveryBlocked=false;recoveryBefore=null;sessionPlan=null;const v=read('rci:v2:saves',[]);saved=new Set(Array.isArray(v)?v:[]);
  syncSaves();window.dispatchEvent(new Event('rci:planchange'));window.dispatchEvent(new Event('rci:saveschange'));
  toast('上次导入未完成，原有计划和收藏已恢复。');
 }).catch(()=>{toast('原始记录仍在恢复备份中，请先导出原始记录。');});
}
syncSaves();syncPlanWidgets();
// Preserve already shared routes on the same origin.
if(location.hash.startsWith('#/')){
 const [route,query='']=location.hash.slice(2).split('?'),[page,id]=route.split('/');
 const simple={home:'/',search:'/search/',courses:'/courses/',resources:'/resources/',planner:'/planner/',apply:'/tasks/apply/',guides:'/guides/',research:'/research/',topics:'/research/topics/',sources:'/sources/'};
 let next=simple[page];if(page==='course'&&/^[A-Z0-9]+$/i.test(id||''))next='/courses/'+id.toUpperCase()+'/';if(page==='article'&&/^[a-z-]+$/.test(id||''))next='/guides/'+id+'/';if(page==='guide'&&/^\d{2}$/.test(id||''))next='/archive/'+id+'/';if(page==='resource'&&/^R\d+$/.test(id||''))next='/resources/';
 if(next)location.replace(full(next)+(query?'?'+query:''));
}
const checklist=$('#application-checklist');
if(checklist)data().then(d=>{
 const key='rci:v2:checklist',raw=read(key,[]);let set=new Set(Array.isArray(raw)?raw:[]),checklistPersisted=!storageUnavailable;
 checklist.innerHTML=d.checklist.map((s,i)=>`<label class="checklist-item"><input type="checkbox" value="${i}" ${set.has(i)?'checked':''}><span>${esc(s)}</span></label>`).join('');
 const sync=()=>checklist.querySelectorAll('input').forEach(input=>{input.checked=set.has(Number(input.value));});
 function latest(){
  if(!checklistPersisted||storageUnavailable)return [...set];
  let value;try{const text=localStorage.getItem(key);value=text===null?[]:JSON.parse(text);}catch(_){throw new Error('本地核对清单无法读取，请先导出原始记录。');}
  if(!Array.isArray(value)||value.some(n=>!Number.isInteger(n)||n<0))throw new Error('本地核对清单格式无效，请先导出原始记录。');
  return value;
 }
 checklist.addEventListener('change',async ev=>{
  const n=Number(ev.target.value),checked=ev.target.checked;if(ev.target.type!=='checkbox'||!Number.isInteger(n)||n<0||n>=d.checklist.length)return;
  try{
   await withLocalLock(guard=>{
    requireRecovered();const next=new Set(latest());checked?next.add(n):next.delete(n);
    checklistPersisted=store(key,[...next],guard);set=next;sync();
    if(!checklistPersisted)toast('核对清单暂时不能保存，本次勾选仅在当前页面有效。');
   });
  }catch(err){ev.target.checked=!checked;toast(err.message);}
 });
 window.addEventListener('storage',ev=>{
  if(!checklistPersisted||storageUnavailable||ev.key!==key&&ev.key!==null)return;
  try{set=new Set(latest());sync();}catch(err){toast(err.message);}
 });
}).catch(()=>{checklist.textContent='核对清单未能加载，请按官方个人材料清单办理。';});
})();
