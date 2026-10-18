/* Run the catalogue's production filters, actions and widget synchronization. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../assets/core'),S=require('../site3/search'),D=require('../site3/course-directory');
const courses=require('../scripts/load-courses')(),names=require('../content/editorial.json').course_names_zh;
const data={courses,names,synonyms:require('../content/navigation.json').synonyms};
const source=fs.readFileSync(require.resolve('../site3/course-directory'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(resolve=>setImmediate(resolve));
const empty=()=>C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,items:[]},courses);
const defaults={query:'',group:'',term:'',language:'',selection:''};
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS',name);}
function element(){return {value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,handlers:{},dataset:{},attributes:{},children:[],setAttribute(key,value){this.attributes[key]=value;},getAttribute(key){return this.attributes[key];},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];},focus(){this.focused=true;},contains(){return false;},getBoundingClientRect(){return {top:200,bottom:240};}};}
async function harness(search='',desktop=false,options={}){
 let plan=options.plan||empty(),lastURL='',fail=false,rows=[],cache=options.saved?JSON.stringify(options.saved):null;
 const nodes={},calls=[],events={},frames=[],scrolls=[],location={search,pathname:'/courses/',hash:options.hash||''};
 const history={state:options.historyState||null,replaceState(state,_b,url){this.state=state;lastURL=url;const u=new URL(url,'http://localhost:8001');location.search=u.search;location.hash=u.hash;}};
 const env={scrollY:options.scrollY||0,innerHeight:900};
 for(const id of ['course-target-semester','page-search','group-filter','term-filter','directory-language','directory-selection','results','result-count','directory-undo','directory-status','directory-feedback','more-results','directory-subcategories','directory-active-filters','directory-filter-count','reset-filters','directory-target-credits','catalog-filter-options','directory-cohort'])nodes['#'+id]=element();
 nodes['[data-edit-academic-term]']=element();
 nodes['[data-academic-action]']=element();
 nodes['form']=element();nodes['[data-directory-clear-query]']=element();nodes['#catalog-filter-options'].querySelector=()=>element();
 let html='';Object.defineProperty(nodes['#results'],'innerHTML',{get:()=>html,set:value=>{
  html=value;rows=[...value.matchAll(/<article class="course-entry[^"]*" id="directory-course-([^"]+)">/g)].map((match,index)=>{
   const link={...element(),dataset:{directoryDetail:match[1]},href:'/courses/'+match[1]+'/'};
   return {id:'directory-course-'+match[1],code:match[1],link,getBoundingClientRect:()=>({top:(options.listTop||300)+index*180-env.scrollY,bottom:(options.listTop||300)+(index+1)*180-env.scrollY}),querySelector:()=>link};
  });nodes['#results'].children=rows;
 }});
 nodes['#results'].querySelectorAll=selector=>selector==='.course-entry'?rows:[];
 const box=element();box.querySelector=s=>nodes[s];
 const U={base:'',persisted:true,data:async()=>data,plan:async()=>copy(plan),addCourse:async(code,semester,options)=>{calls.push({code,semester,options});if(fail)throw new Error('保存失败');const previous=plan.items.find(x=>x.code===code);plan.items=plan.items.filter(x=>x.code!==code);plan.items.push({code,semester,status:'planned'});events['rci:planchange']?.();return {kind:previous?'moved':'added',code,semester,previous};},undoCourse:async change=>{plan.items=plan.items.filter(x=>x.code!==change.code);if(change.previous)plan.items.push(change.previous);events['rci:planchange']?.();}};
 U.editAcademicTerm=async()=>{calls.push({editAcademicTerm:true});if(!options.editCohort)return false;plan.cohort=options.editCohort;plan.timeline.start=plan.cohort.endsWith('夏季')?'summer':'winter';events['rci:planchange']?.();return true;};
 Object.assign(env,{matchMedia:()=>({matches:desktop,addEventListener(){}}),RCI:C,RCISearch:S,RCIUI:U,document:{getElementById:id=>id==='course-directory'?box:nodes['#'+id]||rows.find(row=>row.id===id),addEventListener(){},activeElement:null},location,history,sessionStorage:{getItem(){if(options.storageDenied)throw Error('Denied');return cache;},setItem(_key,value){if(options.storageDenied)throw Error('Denied');cache=value;}},requestAnimationFrame:fn=>frames.push(fn),scrollTo:({top})=>{env.scrollY=top;scrolls.push(top);},URLSearchParams,setTimeout,clearTimeout,addEventListener:(type,fn)=>events[type]=fn});
 vm.runInNewContext(source,env);
 await tick();
 const flush=()=>{for(const fn of frames.splice(0))fn();};if(!options.deferRestore)flush();
 const click=async(attrs,id)=>{const b={id,dataset:{},disabled:false,hasAttribute:key=>key in attrs};for(const [key,value] of Object.entries(attrs))b.dataset[key.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;await box.handlers.click({target:{closest:()=>b}});await tick();};
 return {nodes,calls,click,events,history,location,rows:()=>rows,saved:()=>cache&&JSON.parse(cache),flush,scrolls,scroll:top=>env.scrollY=top,y:()=>env.scrollY,open:async code=>{const row=rows.find(r=>r.code===code);assert(row,'Course is rendered');await box.handlers.click({target:{closest:selector=>selector==='[data-directory-detail]'?row.link:null}});return row.link.href;},plan:()=>copy(plan),url:()=>lastURL,setPlan:async p=>{plan=p;await events['rci:planchange']();await tick();},fail:()=>{fail=true;}};
}
(async()=>{
 await test('Local search accepts spaced codes, Chinese aliases and all cross-category memberships',()=>{
  assert.equal(D.filter(data,empty(),{...defaults,query:'IN 2060'})[0].code,'IN2060');
  for(const c of courses){
   const spaced=c.module_code.replace(/^(\D+)(\d)/,'$1 $2');
   assert.equal(D.filter(data,empty(),{...defaults,query:spaced})[0]?.code,c.module_code,spaced);
  }
  assert.equal(D.filter(data,empty(),{...defaults,query:'SZ 1102 intercultural'})[0]?.code,'SZ1102');
  assert.equal(D.filter(data,empty(),{...defaults,query:'SZ 1102 火锅xyz'}).length,0);
  assert(D.filter(data,empty(),{...defaults,query:'机器学习'}).some(c=>c.code==='IN2064'));
  for(const group of ['G','I'])assert(D.filter(data,empty(),{...defaults,group}).some(c=>c.code==='IN2060'));
  const winter=D.filter(data,empty(),{...defaults,term:'WiSe',language:'EN'});assert(winter.length);assert(winter.every(c=>c.term.includes('WiSe')&&c.language.split('/').includes('EN')));
 });
 await test('Saved custom recognition retains its name, credits, category and searchable identity',()=>{
  const p=empty();p.items=[{code:'IN2060',name:'旧的认定',ects:7.5,group:'H',status:'planned',semester:0,custom:true}];
  const row=D.filter(data,p,{...defaults,query:'旧的认定',group:'H',selection:'selected'})[0];
  assert.equal(row.title,'旧的认定');assert.equal(row.ects,7.5);assert.deepEqual(row.groups,['H']);assert.equal(D.filter(data,p,{...defaults,query:'IN2060',selection:'unselected'}).length,0);
 });
 await test('Course actions distinguish add, move, selected, passed and unknown credit states',()=>{
  const c={title:'Course',ects:6};assert.equal(D.button(c,null,1).state,'add');assert.equal(D.button(c,{semester:0},1).state,'move');assert(D.button(c,{semester:1},1).disabled);assert(D.button(c,{semester:5,status:'passed'},1).disabled);
  for(const ects of ['待核实','',null,0])assert(D.button({...c,ects},null,1).disabled);
  const row=D.view(courses.find(c=>c.automatic_recommendation_eligible===false),null,names);assert.equal(D.button(row,null,1).state,'add');assert(D.card(row,null,1).includes('暂不自动推荐'));
 });
 await test('Directory restores query, filters and explicit unassigned destination from URL',async()=>{
  const h=await harness('?q=IN+2060&group=I&term=WiSe&semester=0&selection=unselected');
  assert.equal(h.nodes['#course-target-semester'].value,'0');assert.equal(h.nodes['#page-search'].value,'IN 2060');assert(h.nodes['#results'].innerHTML.includes('directory-course-IN2060'));assert(h.url().includes('semester=0'));
  await h.click({'data-course-category':'professional'});assert.equal(h.nodes['#group-filter'].value,'professional');
  h.nodes['#reset-filters'].handlers.click();assert.equal(h.nodes['#page-search'].value,'');assert.equal(h.nodes['#term-filter'].value,'');assert(h.url().endsWith('semester=0'));
 });
 await test('Direct add, repeated add destination, move and undo use the guarded plan API',async()=>{
  const h=await harness('?q=IN2060&semester=1');await h.click({'data-directory-add':'IN2060'});
  assert.equal(h.calls[0].options.moveExisting,true);assert.equal(h.plan().items[0].semester,1);assert(h.nodes['#results'].innerHTML.includes('✓ 已加入'));assert.equal(h.nodes['#directory-undo'].hidden,false);
  h.nodes['#course-target-semester'].value='3';await h.nodes['#course-target-semester'].handlers.change();assert(h.nodes['#results'].innerHTML.includes('移到这里'));
  await h.click({'data-directory-add':'IN2060'});assert.equal(h.plan().items[0].semester,3);await h.click({},'directory-undo');assert.equal(h.plan().items[0].semester,1);assert.equal(h.nodes['#directory-undo'].hidden,true);
  const p=h.plan();p.timeline.count=2;await h.setPlan(p);assert.equal(h.nodes['#course-target-semester'].value,'0');assert(h.nodes['#directory-status'].textContent.includes('原目标学期已移除'));
 });
 await test('Failed add presents a reason without modifying saved records',async()=>{
  const h=await harness('?q=IN2060&semester=1');h.fail();await h.click({'data-directory-add':'IN2060'});assert.equal(h.plan().items.length,0);assert(h.nodes['#directory-status'].textContent.includes('保存失败'));assert.equal(h.nodes['#directory-undo'].hidden,true);
 });
 await test('Entry-time editing updates seasons while preserving the target, filters and selected courses on both layouts',async()=>{
  for(const desktop of [false,true]){
   const plan=empty();plan.items=[{code:'IN2064',status:'planned',semester:3}];
   const h=await harness('?q=IN2064&term=WiSe&semester=3',desktop,{plan,editCohort:'2027夏季'}),before=h.plan();
   assert.equal(h.nodes['#directory-cohort'].textContent,'2026/27 冬季');assert.equal(h.nodes['[data-edit-academic-term]'].getAttribute('aria-label'),'修改入学时间');
   await h.click({'data-edit-academic-term':''});
   assert.equal(h.calls[0].editAcademicTerm,true);assert.equal(h.plan().timeline.start,'summer');assert.deepEqual(h.plan().items,before.items);
   assert.equal(h.nodes['#directory-cohort'].textContent,'2027 夏季');assert(h.nodes['#course-target-semester'].innerHTML.includes('第 1 学期 · 夏季'));assert.equal(h.nodes['#course-target-semester'].value,'3');
   assert.equal(h.nodes['#page-search'].value,'IN2064');assert.equal(h.nodes['#term-filter'].value,'WiSe');assert(h.nodes['#directory-status'].textContent.includes('入学时间已更新'));
  }
  const cancelled=await harness('?semester=2'),before=cancelled.plan();await cancelled.click({'data-edit-academic-term':''});assert.deepEqual(cancelled.plan(),before);assert.equal(cancelled.nodes['#course-target-semester'].value,'2');
  const plan=empty();plan.cohort='unknown';const newcomer=await harness('',false,{plan});assert.equal(newcomer.nodes['[data-edit-academic-term]'].getAttribute('aria-label'),'设置入学时间');assert(newcomer.nodes['#course-target-semester'].innerHTML.includes('季节待确认'));
 });
 await test('Shared plan widgets update counts with a destination selector, preserving directory ownership',async()=>{
  const app=fs.readFileSync(require.resolve('../site3/app'),'utf8');
  const sync=app.slice(app.indexOf('async function syncPlanWidgets(){'),app.indexOf("window.addEventListener('rci:planchange',syncPlanWidgets)"));
  for(const owned of [false,true]){
   const p=empty();p.items=[{code:'IN2064',status:'planned',semester:1}];const badge={textContent:'0',classList:{contains:()=>true}},target={innerHTML:'owned',hasAttribute:()=>owned},context={hidden:true};
   const sandbox={C,desktopPlanning:{matches:false},currentPlan:null,selectedSemester:1,plan:async()=>p,data:async()=>data,$:s=>({'#course-target-semester':target,'#course-semester-context':context}[s]),document:{querySelectorAll:s=>s==='[data-plan-count]'?[badge]:[]},syncAddButtons(){}};
   vm.runInNewContext(sync+';this.run=syncPlanWidgets',sandbox);await sandbox.run();assert.equal(badge.textContent,1);assert.equal(badge.hidden,false);assert.equal(target.innerHTML==='owned',owned);if(!owned)assert.equal(context.hidden,false);
  }
 });
 await test('Desktop zero and removed destinations fall back to semester one without offering unassigned',async()=>{
  const h=await harness('?semester=0',true);
  assert.equal(h.nodes['#course-target-semester'].value,'1');assert(!h.nodes['#course-target-semester'].innerHTML.includes('value="0"'));
  await h.click({'data-directory-add':'IN2064'});assert.equal(h.calls[0].semester,1);
  h.nodes['#course-target-semester'].value='3';await h.nodes['#course-target-semester'].handlers.change();
  const p=h.plan();p.timeline.count=2;await h.setPlan(p);
  assert.equal(h.nodes['#course-target-semester'].value,'1');assert(h.nodes['#directory-status'].textContent.includes('第 1 学期'));
 });
 await test('Returning from details restores loaded courses, filters, destination and the clicked row at its previous viewport position',async()=>{
  const search='?group=professional&language=EN&semester=3',first=await harness(search);
  await first.click({},'more-results');assert.equal(first.rows().length,48);
  const code=first.rows()[32].code;first.scroll(300+32*180-150);
  const href=await first.open(code),from=new URL(href,'http://localhost:8001').searchParams.get('from');
  assert.equal(from,'/courses/'+search+'#directory-course-'+code);
  const saved=first.saved();assert.equal(saved.limit,48);assert.equal(saved.offset,150);assert.equal(first.calls.length,0);
  const returned=await harness(search,false,{hash:'#directory-course-'+code,saved,listTop:360});
  assert.equal(returned.rows().length,48);assert.equal(returned.rows().find(r=>r.code===code).getBoundingClientRect().top,150);
  assert(returned.rows().find(r=>r.code===code).link.focused);assert.equal(returned.location.hash,'');
  assert.equal(returned.nodes['#group-filter'].value,'professional');assert.equal(returned.nodes['#directory-language'].value,'EN');assert.equal(returned.nodes['#course-target-semester'].value,'3');assert.equal(returned.calls.length,0);
  const back=await harness(search,false,{historyState:first.history.state});assert.equal(back.rows().length,48);assert.equal(back.rows().find(r=>r.code===code).getBoundingClientRect().top,150);
  first.scroll(0);first.events.pageshow({persisted:true});await tick();first.flush();assert.equal(first.rows().find(r=>r.code===code).getBoundingClientRect().top,150);
 });
 await test('A course anchor still returns to a later result when session storage is unavailable',async()=>{
  const first=await harness('?semester=2');await first.click({},'more-results');const code=first.rows()[35].code;
  const h=await harness('?semester=2',false,{hash:'#directory-course-'+code,storageDenied:true});
  assert.equal(h.rows().length,48);assert.equal(h.rows().find(r=>r.code===code).getBoundingClientRect().top,90);assert.equal(h.nodes['#course-target-semester'].value,'2');assert.equal(h.calls.length,0);
 });
 await test('Invalid view snapshots and changed result sets cannot inject courses, overwrite a plan or interrupt manual scrolling',async()=>{
  const route='/courses/?semester=1',valid={version:1,route,limit:48,y:5000,code:'IN2064',offset:150};
  for(const change of [{route:'/admin/'},{limit:Infinity},{limit:100000},{y:-1},{offset:NaN},{code:'../admin'}])assert.equal(D.validView({...valid,...change},route),null);
  assert.equal(D.returnCode('#directory-course-../admin'),null);
  const stale=await harness('?semester=1',false,{saved:{...valid,route:'/courses/?q=old'}});assert.equal(stale.rows().length,24);assert.equal(stale.scrolls.length,0);
  const missing=await harness('?q=IN2060&semester=1',false,{hash:'#directory-course-IN2064',saved:{...valid,route:'/courses/?q=IN2060&semester=1'}});assert.equal(missing.rows().length,1);assert.equal(missing.rows()[0].code,'IN2060');assert.equal(missing.calls.length,0);
  const h=await harness('?semester=1',false,{historyState:{rciCourseDirectory:valid},deferRestore:true});h.scroll(400);h.events.wheel({});h.flush();assert.equal(h.y(),400);assert.equal(h.scrolls.length,0);
 });
 console.log(`${checks} course directory checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
