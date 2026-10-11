/* Student-facing progressive enhancement. Public content remains readable without JS. MIT. */
(function(){
'use strict';
const C=window.RCI,esc=C.esc,base=document.querySelector('meta[name="rci-base"]').content;
const $=s=>document.querySelector(s),full=p=>base+p;
let timer,dbPromise,idxPromise;
function toast(message){const el=$('#toast');el.textContent=message;clearTimeout(timer);timer=setTimeout(()=>{el.textContent='';},6500);}
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch(_){return fallback;}}
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){toast('浏览器不允许保存。请导出计划备份；本次页面修改不会持久保存。');return false;}}
async function load(p){const r=await fetch(full(p));if(!r.ok)throw new Error('资料加载失败，请刷新重试');return r.json();}
const data=()=>dbPromise||(dbPromise=load('/assets/planner-data.json'));
const empty=()=>({version:2,cohort:'unknown',conditional:false,items:[]});
let sessionPlan=null;
async function plan(){const d=await data();return C.validatePlan(sessionPlan||read('rci:v2:plan',empty()),d.courses);}
async function savePlan(p){const d=await data();sessionPlan=C.validatePlan(p,d.courses);store('rci:v2:plan',sessionPlan);window.dispatchEvent(new Event('rci:planchange'));return sessionPlan;}
window.RCIUI={toast,read,store,data,plan,savePlan,empty,base};
const savedRaw=read('rci:v2:saves',[]);let saved=new Set(Array.isArray(savedRaw)?savedRaw.filter(x=>typeof x==='string'):[]);
function syncSaves(){document.querySelectorAll('[data-save]').forEach(b=>{const yes=saved.has(b.dataset.save);b.textContent=yes?'已收藏':'收藏';b.setAttribute('aria-pressed',String(yes));});}
function dest(d){return d.direct?C.safeURL(d.url):/^\/[a-zA-Z0-9/?#&=._%+-]*$/.test(d.url)?full(d.url):full('/search/');}
function resultCard(d){
 const kinds={guide:'问题解答',course:'课程',resource:'原始入口',topic:'历史课题',tool:'工具'};
 const a=`href="${esc(dest(d))}"${d.direct?' target="_blank" rel="noopener noreferrer"':''}`;
 const key=d.code||d.id;
 return `<article class="card search-result"><div class="card-top"><span class="badge">${kinds[d.kind]}</span>${d.code?`<span class="code">${esc(d.code)}</span>`:''}${d.historical?'<span class="badge history">历史快照</span>':''}</div><h3><a ${a}>${esc(d.title)}</a></h3><p>${esc(d.summary)}</p><p class="meta">${esc(d.status)}${d.cohort?'<br>'+esc(d.cohort):''}</p><div class="card-bottom"><a class="text-link" ${a}>${d.direct?'打开原始入口 ↗':'查看'+(d.kind==='guide'?'答案':'详情')+' →'}</a><div>${d.kind==='course'?`<button class="quiet" data-add="${esc(d.code)}">加入计划</button>`:''}<button class="quiet" data-save="${esc(key)}" aria-pressed="${saved.has(key)}">${saved.has(key)?'已收藏':'收藏'}</button></div></div></article>`;
}
const app=$('#search-app');let refreshSearch=null;
if(app){
 let index,limit=18;
 const params=new URLSearchParams(location.search),q=$('#page-search'),kind=$('#kind-filter'),task=$('#task-filter'),sg=$('#group-filter'),term=$('#term-filter'),sf=$('#saved-filter');
 q.value=(params.get('q')||'').slice(0,160);kind.value=params.get('kind')||'';task.value=params.get('task')||'';sf.checked=params.get('saved')==='1';
 if(app.dataset.mode==='courses'){kind.value='course';kind.closest('label').hidden=true;task.value='';task.closest('label').hidden=true;}
 if(app.dataset.mode==='resources'){kind.value='resource';kind.closest('label').hidden=true;}
 if(sg)sg.value=params.get('group')||'';if(term)term.value=params.get('term')||'';
 function updateURL(){const p=new URLSearchParams();for(const [k,v] of [['q',q.value.trim()],['kind',kind.closest('label').hidden?'':kind.value],['task',task.value],['group',sg?.value],['term',term?.value],['saved',sf.checked?'1':'']])if(v)p.set(k,v);history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);}
 function render(){
  if(!index)return;let results=window.RCISearch.search(index.docs,q.value,index.synonyms,{kind:kind.value,task:task.value});
  if(sg?.value)results=results.filter(d=>d.group===sg.value);if(term?.value)results=results.filter(d=>d.term?.includes(term.value));if(sf.checked)results=results.filter(d=>saved.has(d.code||d.id));
  $('#result-count').textContent=`${q.value.trim()?'“'+q.value.trim()+'”：':''}找到 ${results.length} 条内容${sf.checked?' · 仅收藏':''}`;
  const el=$('#results');el.innerHTML=results.length?results.slice(0,limit).map(resultCard).join(''):`<div class="empty"><h2>${sf.checked?'没有匹配的收藏':'没有收录完全匹配的内容'}</h2><p>试试课程代码、中文或官方名称，也可以清除筛选。这里不会临时编造答案。</p><div class="actions"><a class="button secondary" href="${full('/')}">按任务重新查找</a><a class="text-link" href="https://www.cit.tum.de/en/cit/studies/degree-programs/master-robotics-cognition-intelligence/" target="_blank" rel="noopener noreferrer">到 RCI 官方页核对 ↗</a></div></div>`;
  $('#more-results').hidden=results.length<=limit;syncSaves();updateURL();
 }
 refreshSearch=render;
 let debounce; q.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{limit=18;render();},120);});
 app.querySelector('form').addEventListener('submit',ev=>{ev.preventDefault();clearTimeout(debounce);limit=18;render();$('#result-count').focus();});
 [kind,task,sg,term,sf].filter(Boolean).forEach(el=>el.addEventListener('change',()=>{limit=18;render();}));
 $('#reset-filters').addEventListener('click',()=>{q.value='';kind.value=app.dataset.mode==='courses'?'course':app.dataset.mode==='resources'?'resource':'';task.value='';if(sg)sg.value='';if(term)term.value='';sf.checked=false;limit=18;render();q.focus();});
 $('#more-results').addEventListener('click',()=>{limit+=18;render();});
 load('/assets/search-index.json').then(d=>{index=d;render();}).catch(err=>{$('#result-count').textContent=err.message+'。下方静态目录和首页链接仍可使用。';});
 window.addEventListener('rci:saveschange',render);
}
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-save')){const k=b.dataset.save;saved.has(k)?saved.delete(k):saved.add(k);store('rci:v2:saves',[...saved]);syncSaves();window.dispatchEvent(new Event('rci:saveschange'));}
 if(b.hasAttribute('data-share')){try{await navigator.clipboard.writeText(location.href);toast('已复制本页网址，可以直接发到群里。');}catch(_){window.prompt('复制这个页面的网址：',location.href);}}
 if(b.hasAttribute('data-add')){try{const p=await plan(),code=b.dataset.add;if(p.items.some(x=>x.code===code)){toast('这门课已经在计划中。');return;}await savePlan({...p,items:[...p.items,{code,status:'planned'}]});toast('已加入本地计划；没有向学校报名。');b.textContent='已加入计划';}catch(err){toast(err.message);}}
});
syncSaves();
// Preserve old shared hash routes on the same origin. Never redirect to an external URL.
if(location.hash.startsWith('#/')){
 const [route,query='']=location.hash.slice(2).split('?'),[page,id]=route.split('/');
 const simple={home:'/',search:'/search/',courses:'/courses/',resources:'/resources/',planner:'/planner/',apply:'/tasks/apply/',guides:'/guides/',research:'/research/',topics:'/research/topics/',sources:'/sources/'};
 let next=simple[page];if(page==='course'&&/^[A-Z0-9]+$/i.test(id||''))next='/courses/'+id+'/';if(page==='article'&&/^[a-z-]+$/.test(id||''))next='/guides/'+id+'/';if(page==='guide'&&/^\d{2}$/.test(id||''))next='/archive/'+id+'/';if(page==='resource'&&/^R\d+$/.test(id||''))next='/resources/';
 if(next)location.replace(full(next)+(query?'?'+query:''));
}
const checklist=$('#application-checklist');if(checklist)data().then(d=>{let set=new Set(read('rci:v2:checklist',[]));checklist.innerHTML=d.checklist.map((s,i)=>`<label class="checklist-item"><input type="checkbox" value="${i}" ${set.has(i)?'checked':''}><span>${esc(s)}</span></label>`).join('');checklist.addEventListener('change',ev=>{const n=Number(ev.target.value);ev.target.checked?set.add(n):set.delete(n);store('rci:v2:checklist',[...set]);});}).catch(()=>{checklist.textContent='核对清单未能加载，请按官方个人材料清单办理。';});
})();
