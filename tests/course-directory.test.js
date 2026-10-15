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
function element(){return {value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,handlers:{},dataset:{},children:[],addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];},focus(){this.focused=true;},contains(){return false;},getBoundingClientRect(){return {top:200,bottom:240};}};}
async function harness(search=''){
 let plan=empty(),lastURL='',fail=false;
 const nodes={},calls=[],events={};
 for(const id of ['course-target-semester','page-search','group-filter','term-filter','directory-language','directory-selection','results','result-count','directory-undo','directory-status','directory-feedback','more-results','directory-subcategories','directory-active-filters','directory-filter-count','reset-filters','directory-target-credits','catalog-filter-options'])nodes['#'+id]=element();
 nodes['form']=element();nodes['[data-directory-clear-query]']=element();nodes['#catalog-filter-options'].querySelector=()=>element();
 const box=element();box.querySelector=s=>nodes[s];
 const U={base:'',persisted:true,data:async()=>data,plan:async()=>copy(plan),addCourse:async(code,semester,options)=>{calls.push({code,semester,options});if(fail)throw new Error('保存失败');const previous=plan.items.find(x=>x.code===code);plan.items=plan.items.filter(x=>x.code!==code);plan.items.push({code,semester,status:'planned'});events['rci:planchange']?.();return {kind:previous?'moved':'added',code,semester,previous};},undoCourse:async change=>{plan.items=plan.items.filter(x=>x.code!==change.code);if(change.previous)plan.items.push(change.previous);events['rci:planchange']?.();}};
 vm.runInNewContext(source,{RCI:C,RCISearch:S,RCIUI:U,document:{getElementById:()=>box,addEventListener(){},activeElement:null},location:{search,pathname:'/courses/',hash:''},history:{replaceState(_a,_b,url){lastURL=url;}},URLSearchParams,setTimeout,clearTimeout,addEventListener:(type,fn)=>events[type]=fn});
 await tick();
 const click=async(attrs,id)=>{const b={id,dataset:{},disabled:false,hasAttribute:key=>key in attrs};for(const [key,value] of Object.entries(attrs))b.dataset[key.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;await box.handlers.click({target:{closest:()=>b}});await tick();};
 return {nodes,calls,click,plan:()=>copy(plan),url:()=>lastURL,setPlan:async p=>{plan=p;await events['rci:planchange']();await tick();},fail:()=>{fail=true;}};
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
 await test('Shared plan widgets update counts with a destination selector, preserving directory ownership',async()=>{
  const app=fs.readFileSync(require.resolve('../site3/app'),'utf8');
  const sync=app.slice(app.indexOf('async function syncPlanWidgets(){'),app.indexOf("window.addEventListener('rci:planchange',syncPlanWidgets)"));
  for(const owned of [false,true]){
   const p=empty();p.items=[{code:'IN2064',status:'planned',semester:1}];const badge={textContent:'0',classList:{contains:()=>true}},target={innerHTML:'owned',hasAttribute:()=>owned},context={hidden:true};
   const sandbox={C,currentPlan:null,selectedSemester:1,plan:async()=>p,data:async()=>data,$:s=>({'#course-target-semester':target,'#course-semester-context':context}[s]),document:{querySelectorAll:s=>s==='[data-plan-count]'?[badge]:[]},syncAddButtons(){}};
   vm.runInNewContext(sync+';this.run=syncPlanWidgets',sandbox);await sandbox.run();assert.equal(badge.textContent,1);assert.equal(badge.hidden,false);assert.equal(target.innerHTML==='owned',owned);if(!owned)assert.equal(context.hidden,false);
  }
 });
 console.log(`${checks} course directory checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
