/* Run the production board and status actions against validated local records. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../assets/core'),T=require('../assets/course-context'),E=require('../assets/planning-engine');
const courses=require('../scripts/load-courses')(),names=require('../content/editorial.json').course_names_zh;
const source=fs.readFileSync(require.resolve('../site3/planner'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(resolve=>setImmediate(resolve));
const draft=items=>C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,timeline:{count:4,start:'winter'},items},courses);
function element(){const classes=new Set(),properties={};let html='',htmlWrites=0;return {get innerHTML(){return html;},set innerHTML(value){html=value;htmlWrites++;},htmlWrites:()=>htmlWrites,open:false,handlers:{},style:{setProperty(key,value){properties[key]=value;},getPropertyValue:key=>properties[key]},classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},contains:name=>classes.has(name)},scrollLeft:0,scrollTop:0,getBoundingClientRect(){return {top:0,height:0};},scrollWidth:600,clientWidth:600,elements:{namedItem(){}},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];},focus(){},toggleAttribute(){}};}
async function harness(initial,desktop=true){
 let plan=copy(initial),writes=0,reads=0,planGate=null;const events={},nodes={},toasts=[],moves=[],reorders=[],acceptedDropEvents=[],box=element(),creditDialog=element(),creditContent=element();
 creditDialog.showModal=()=>{creditDialog.open=true;};creditDialog.close=()=>{creditDialog.open=false;};const milestones=element();milestones.getBoundingClientRect=()=>({top:300});creditDialog.querySelector=()=>null;milestones.scrollIntoView=()=>assert.fail('Opening details must not scroll the underlying page');creditContent.querySelector=key=>key==='#credit-check-milestones'?milestones:null;
 for(const key of ['.semester-board','.board-head-scroll','.board-courses-scroll','[data-board-step="-1"]','[data-board-step="1"]','#summary-gaps','#custom-plan'])nodes[key]=element();
 const courseNodes=new Map(),semesterLists=new Map();
 const semesterCards=semester=>C.semesterItems(plan,semester,desktop).map((item,index)=>{
  if(!courseNodes.has(item.code)){const node=element();node.dataset={planCourse:item.code,planSemester:String(semester)};node.getAttribute=()=> 'true';courseNodes.set(item.code,node);}
  const node=courseNodes.get(item.code);node.getBoundingClientRect=()=>({top:100+index*110,bottom:200+index*110,height:100});return node;
 });
 const semesterList=semester=>{if(!semesterLists.has(semester)){const list=element();list.getBoundingClientRect=()=>({top:100});list.querySelectorAll=()=>semesterCards(semester);semesterLists.set(semester,list);}return semesterLists.get(semester);};
 box.querySelector=key=>{const match=key.match(/^#semester-(\d+) \.semester-courses$/);return match?semesterList(Number(match[1])):nodes[key];};
 box.querySelectorAll=selector=>[...semesterLists.values(),...courseNodes.values()].filter(node=>selector.split(',').some(name=>node.classList.contains(name.slice(1))));
 const U={base:'',persisted:true,data:async()=>({courses,names}),plan:async()=>{reads++;const snapshot=copy(plan);if(planGate)await planGate;return snapshot;},updatePlan:async fn=>{const next=await fn(copy(plan));if(next){plan=C.validatePlan(next,courses);writes++;events['rci:planchange']?.();}return copy(plan);},toast:(message,action)=>toasts.push({message,action})};
 U.assignUnscheduled=()=>U.updatePlan(p=>C.hasAcademicTerm(p)&&p.items.some(x=>x.status==='planned'&&x.semester===0)?{...p,items:p.items.map(x=>x.status==='planned'&&x.semester===0?{...x,semester:1}:x)}:null);
 const media={matches:desktop,addEventListener(type,fn){this[type]=fn;}};
 U.moveCourse=async(code,semester,options)=>{moves.push(copy({code,semester,options}));return {kind:'unchanged',code,semester};};
 U.reorderCourse=async(code,semester,options)=>{reorders.push(copy({code,semester,options}));return {kind:'unchanged'};};
 vm.runInNewContext(source,{window:{matchMedia:()=>media,RCIUI:U,RCI:C,RCICourseContext:T,RCIPlanning:E,addEventListener:(key,fn)=>events[key]=fn},document:{activeElement:null,getElementById:id=>({'planner':box,'credit-check-dialog':creditDialog,'credit-check-content':creditContent}[id])},cancelAnimationFrame(){},requestAnimationFrame(){}});
 await tick();
 const click=async(key,code)=>{const name=key.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());await box.handlers.click({target:{closest:()=>({dataset:{[name]:code},hasAttribute:k=>k===key})}});await tick();};
 const changeSemester=async(code,semester)=>{await box.handlers.change({target:{value:String(semester),dataset:{semester:code},hasAttribute:key=>key==='data-semester'}});await tick();};
 const drag=async(code,semester,targetCode=null,placement='before',pointerY)=>{
  const sourceSemester=plan.items.find(x=>x.code===code).semester,item=semesterCards(sourceSemester).find(node=>node.dataset.planCourse===code);
  box.handlers.dragstart({target:{closest:selector=>selector==='[data-plan-course]'?item:null},clientX:0,dataTransfer:{setData(){}}});
  const target=semesterCards(semester).find(node=>node.dataset.planCourse===targetCode),eventTarget={closest:selector=>selector==='[data-drop-semester]'?{dataset:{dropSemester:String(semester)}}:selector==='[data-plan-course]'?target:null};
  const clientY=pointerY??(target?target.getBoundingClientRect().top+(placement==='before'?25:75):1000),list=semesterList(semester);
  for(const type of ['dragenter','dragover'])box.handlers[type]?.({target:eventTarget,clientX:0,clientY,dataTransfer:{},preventDefault(){acceptedDropEvents.push(type);}});
  const indicator={active:list.classList.contains('has-sort-target'),y:list.style.getPropertyValue('--course-insert-y')};
  await box.handlers.drop({target:eventTarget,clientY,preventDefault(){}});await tick();
  return {...indicator,cleared:!list.classList.contains('has-sort-target')};
 };
 return {html:()=>box.innerHTML,creditHTML:()=>creditContent.innerHTML,creditDialog,milestones,plan:()=>copy(plan),writes:()=>writes,reads:()=>reads,renders:()=>box.htmlWrites(),holdPlan:()=>{let release;planGate=new Promise(done=>release=done);return ()=>{planGate=null;release();};},changeLayout:async value=>{desktop=value;media.matches=value;await media.change();await tick();},toasts,moves,reorders,acceptedDropEvents,click,changeSemester,drag,external:async value=>{plan=C.validatePlan(value,courses);await events['rci:planchange']();await tick();}};
}
const card=(html,code)=>html.match(new RegExp('<details[^>]*id="plan-course-'+code+'"[\\s\\S]*?</details>'))?.[0];
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 await test('Both layouts show the third-semester cumulative shortfall at the semester, clearing at exactly 30 ECTS without saving',async()=>{
  const initial=C.validatePlan({...draft([{code:'IN2064',status:'planned',semester:1},{code:'OWNG',name:'自录专业选修',custom:true,group:'G',ects:21.5,status:'planned',semester:3}]),timeline:{count:3,start:'winter'}},courses);
  for(const desktop of [true,false]){
   const h=await harness(initial,desktop);
   assert(h.html().includes('累计 29.5 / 30 ECTS · 还差 0.5'));assert(h.html().includes('1 项学期进度待完善'));
   assert(h.html().includes('data-progress-semester="3"'));assert(!h.html().includes('data-progress-semester="2"'));assert(!h.html().includes('data-progress-semester="4"'));
   assert(!h.html().includes('plan-progress-alerts'));
   await h.click('data-open-progress-check','');assert(h.creditDialog.open);assert(h.milestones.open);assert(h.creditDialog.scrollTop>0);
   assert(h.creditHTML().includes('计划还差 0.5 ECTS'));assert(h.creditHTML().includes('data-study-section="deadlines"'));
   const fixed=copy(initial);fixed.items[1].ects=22;await h.external(fixed);
   assert(!h.html().includes('data-progress-semester='));assert(h.html().includes('当前规划范围内的学期进度已覆盖'));assert.equal(h.writes(),0);assert.deepEqual(h.plan(),fixed);
  }
 });
 await test('Semester hints include the foundation deadline and never count later courses toward an earlier checkpoint',async()=>{
  const initial=draft([{code:'IN2064',status:'planned',semester:4},{code:'OWNG',name:'之后的选修',custom:true,group:'G',ects:30,status:'planned',semester:4}]);initial.preferences.deadlineException=true;
  assert(C.calculate(initial,courses).allocated>30);
  const h=await harness(initial);
  assert(h.html().includes('data-progress-semester="2"'));assert(h.html().includes('需安排至少 1 门 A/B/C 必修'));
  assert(h.html().includes('data-progress-semester="3"'));assert(h.html().includes('累计 0 / 30 ECTS · 还差 30'));
  assert(!h.html().includes('data-progress-semester="5"'));assert.equal(h.writes(),0);assert(h.plan().preferences.deadlineException);
  const empty=C.validatePlan({...draft([]),timeline:{count:3,start:'winter'}},courses),narrow=await harness(empty,false);
  assert(narrow.html().includes('2 项学期进度待完善'));assert(narrow.html().includes('累计 0 / 30 ECTS · 还差 30'));
 });
 await test('Missing passed-semester records request verification instead of declaring a definite shortfall',async()=>{
  const initial=C.validatePlan({...draft([{code:'IN2064',status:'passed',semester:0},{code:'OWNG',name:'已修认定',custom:true,group:'G',ects:22,status:'passed',semester:2}]),preferences:{startSemester:4}},courses),h=await harness(initial);
  const third=h.html().match(/<button[^>]*data-progress-semester="3"[^>]*>[\s\S]*?<\/button>/)[0];
  assert(third.includes('通过学期待核对'));assert(!third.includes('还差'));assert.equal(h.writes(),0);
  const recorded=copy(initial);recorded.items[0].semester=1;await h.external(recorded);
  assert(!h.html().includes('data-progress-semester="2"'));assert(!h.html().includes('data-progress-semester="3"'));
 });
 await test('Checkpoints follow the planning horizon and unconfirmed rules remain qualified in the details',async()=>{
  const initial=C.validatePlan({...draft([]),cohort:'unknown',conditionalConfirmed:false,timeline:{count:6,start:'winter'}},courses),h=await harness(initial);
  assert(h.html().includes('5 项学期进度待完善'));
  for(const [semester,required] of [[3,30],[4,60],[5,90],[6,120]])assert(h.html().includes(`累计 0 / ${required} ECTS · 还差 ${required}`),semester);
  assert(h.creditHTML().includes('尚未选择入学批次'));assert(h.creditHTML().includes('录取补修要求尚未确认'));assert.equal(h.writes(),0);
  const short=await harness(C.validatePlan({...draft([]),timeline:{count:1,start:'winter'}},courses));assert(!short.html().includes('data-open-progress-check'));assert(!short.creditHTML().includes('data-check-semester='));
 });
 await test('Semester overview counts include passed history and update after status changes and undo',async()=>{
  const codes=['IN2067','IN2064','IN2406','ED150039','IN2346','IN2106','MW0085','MW1808','IN2107','MW1420','CIT433037','IN2357','WI001056_1','IN2320'];
  const initial=draft(codes.map(code=>({code,status:code==='IN2064'?'passed':'planned',semester:code==='IN2064'?6:2}))),h=await harness(initial);
  const counts=html=>Object.fromEntries([...html.matchAll(/class="plan-course-status-(pending|passed)">[^<]+<b>(\d+)<\/b>/g)].map(m=>[m[1],Number(m[2])]));
  assert.deepEqual(counts(h.html()),{pending:13,passed:1});assert.equal(h.writes(),0);assert.deepEqual(h.plan(),initial);
  const progress=h.html().match(/<section class="plan-progress"[\s\S]*?<\/section>/)[0];
  assert(!progress.includes('plan-course-status'));assert.match(h.html(),/<h2 id="semester-board-title">学期安排<\/h2><div class="plan-course-status"/);
  await h.click('data-passed','IN2346');assert.deepEqual(counts(h.html()),{pending:12,passed:2});
  await h.toasts.at(-1).action.run();await tick();assert.deepEqual(counts(h.html()),{pending:13,passed:1});assert.deepEqual(h.plan(),initial);
  await h.external({...initial,items:initial.items.map(x=>({...x,status:'passed'}))});assert.deepEqual(counts(h.html()),{pending:0,passed:14});
  await h.external({...initial,items:[]});assert.deepEqual(counts(h.html()),{pending:0,passed:0});
  const narrow=await harness(initial,false);assert(!narrow.html().includes('plan-course-status'));
 });
 await test('Credit check opens without changing a plan, shows category and domain gaps, and refreshes while open',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:1},{code:'OWNG',name:'已认可计算选修',ects:8.5,group:'G',custom:true,status:'planned',semester:2},{code:'OWNJ',name:'已认可跨学科',ects:7.5,group:'J',custom:true,status:'planned',semester:2}]),h=await harness(initial);
  assert(h.html().includes('data-open-credit-check'));assert(!h.html().includes('id="summary-gaps"'));
  assert(h.creditHTML().includes('22.5<small> / 120 ECTS'));assert(h.creditHTML().includes('97.5<small> ECTS'));assert(h.creditHTML().includes('超出 1.5 ECTS 未计入总进度'));
  for(const group of ['core','professional','F','H','I'])assert(h.creditHTML().includes('/courses/?group='+group));
  assert(!h.creditHTML().includes('href="/courses/?group=G"'));assert(!h.creditHTML().includes('href="/courses/?group=J"'));
  assert(h.creditHTML().includes('data-study-section="deadlines"'));assert(h.creditHTML().includes('已包含在上方专业选修总额中'));assert(h.creditHTML().includes('计划可覆盖'));assert(h.creditHTML().includes('计划还差 7.5 ECTS'));
  h.creditDialog.scrollTop=300;await h.click('data-open-credit-check','');assert(h.creditDialog.open);assert.equal(h.creditDialog.scrollTop,0);assert.equal(h.writes(),0);assert.deepEqual(h.plan(),initial);
  await h.external({...initial,items:[]});assert(h.creditDialog.open);assert(h.creditHTML().includes('120<small> ECTS'));assert(h.creditHTML().includes('/courses/?group=J'));assert.equal(h.writes(),0);
  const narrow=await harness(initial,false);assert(!narrow.html().includes('id="summary-gaps"'));assert(narrow.html().includes('data-open-credit-check'));assert(narrow.creditHTML().includes('data-study-section="deadlines"'));await narrow.click('data-open-credit-check','');assert(narrow.creditDialog.open);assert.equal(narrow.writes(),0);assert.deepEqual(narrow.plan(),initial);
 });
 await test('Credit check separates historical records from future estimates and explains unconfirmed remediation',async()=>{
  const initial=C.validatePlan({...draft([{code:'IN2064',status:'passed',semester:0},{code:'ED140014',status:'planned',semester:4}]),cohort:'unknown',conditionalConfirmed:false,preferences:{startSemester:4}},courses),h=await harness(initial);
  assert(h.creditHTML().includes('尚未选择入学批次'));assert(h.creditHTML().includes('录取补修要求尚未确认'));assert(h.creditHTML().includes('ED140014'));assert(h.creditHTML().includes('data-edit-academic'));
  const historical=h.creditHTML().match(/<tr data-check-semester="2"><th scope="row">第 2 学期末[\s\S]*?<\/tr>/)[0];assert(historical.includes('历史记录'));assert(historical.includes('通过学期待核对'));assert(!historical.includes('计划可覆盖'));
  const confirmed=await harness(C.validatePlan({...initial,cohort:'2026/27冬季',conditional:true,conditionalConfirmed:true},courses));
  assert(confirmed.creditHTML().includes('补修 K'));assert(confirmed.creditHTML().includes('credit-category-remediation'));assert(!confirmed.creditHTML().includes('data-edit-academic'));assert.deepEqual(confirmed.plan().items,initial.items);assert.equal(confirmed.writes(),0);
 });
 await test('Desktop hover categories follow the credit overview while preserving passed and custom recognition records',async()=>{
  const expected={IN2067:'core',IN2064:'core',IN2228:'core',IN2107:'core',IN2106:'core',IN2346:'professional',MW0085:'professional',MW1808:'professional',CIT433050:'professional',WI001056_1:'interdisciplinary',IN2320:'thesis',ED140014:'remediation',IN2060:'interdisciplinary'};
  const initial=draft(Object.keys(expected).map(code=>code==='IN2060'?{code,name:'原有跨学科认定',custom:true,group:'J',ects:3,status:'passed',semester:6}:{code,...(code==='CIT433050'?{group:'I'}:{}),status:code==='IN2064'?'passed':'planned',semester:code==='IN2064'?1:2})),h=await harness(initial);
  for(const [code,category] of Object.entries(expected)){
   const shown=card(h.html(),code);assert(shown.includes(`data-credit-category="${category}"`),code);assert(shown.includes('credit-category-'+category),code);
  }
  assert(card(h.html(),'IN2064').includes('✓ 已通过'));assert(card(h.html(),'IN2060').includes('原有跨学科认定'));assert.deepEqual(h.plan(),initial);assert.equal(h.writes(),0);
  const narrow=await harness(initial,false);assert(!narrow.html().includes('data-credit-category='));assert.equal(narrow.writes(),0);
 });
 await test('Proportional credit overview preserves fractional credits and counts passed credits once on both layouts',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:1},{code:'OWN1',name:'示例认定',ects:7.5,group:'G',custom:true,status:'planned',semester:2}]);
  for(const desktop of [true,false]){
   const h=await harness(initial,desktop),html=h.html();
   const segments=[...html.matchAll(/data-credit-share="([\d.]+)" max="([\d.]+)" value="([\d.]+)"/g)].map(m=>m.slice(1).map(Number));
   assert.deepEqual(segments,[[43,43,8],[41,41,7.5],[6,6,0],[30,30,0]]);
   assert.equal(segments.reduce((n,x)=>n+x[0],0),120);
   if(desktop){
    assert(html.includes('class="credit-distribution"'));assert(html.includes('aria-label="学分分布与规划进度"'));
    assert.deepEqual([...html.matchAll(/class="credit-segment[^>]*data-credit-category="([^"]+)" tabindex="0"/g)].map(m=>m[1]),['core','professional','interdisciplinary','thesis']);
   }else{
    for(const [label,value,target] of [['必修',8,43],['专业选修',7.5,41],['跨学科',0,6],['论文',0,30]])assert(html.includes(`<dt>${label}</dt><dd><b>${value}</b><span> / ${target}</span><progress`));
   }
   assert(html.includes('已通过 8 · 还需规划 104.5'));assert(html.includes('<b>15.5</b><small>/ 120 ECTS'));
   assert.equal(h.writes(),0);assert.deepEqual(h.plan(),initial);
  }
 });
 await test('Credit proportions follow the remediation rule and cap overfilled credits without changing records',async()=>{
  const initial=C.validatePlan({...draft([]),conditional:true,conditionalConfirmed:true,items:[{code:'OWN1',name:'原有认定',ects:30,group:'G',custom:true,status:'passed',semester:1},{code:'OWN2',name:'另一项认定',ects:30,group:'H',custom:true,status:'planned',semester:2}]},courses);
  for(const desktop of [true,false]){
   const h=await harness(initial,desktop);
   const segments=[...h.html().matchAll(/data-credit-share="([\d.]+)" max="([\d.]+)" value="([\d.]+)"/g)].map(m=>m.slice(1).map(Number));
   assert.deepEqual(segments,[[43,43,0],[36,36,36],[6,6,0],[30,30,0],[5,5,0]]);assert.equal(segments.reduce((n,x)=>n+x[0],0),120);
   assert(h.html().includes('credit-category-remediation'));
   assert(h.creditHTML().includes('超出 24 ECTS 未计入总进度'));assert.deepEqual(h.plan(),initial);assert.equal(h.writes(),0);
  }
  const legacy=await harness(C.validatePlan({...initial,cohort:'2024夏季'},courses));
  assert(legacy.html().includes('data-credit-share="41"'));assert(!legacy.html().includes('credit-category-remediation'));
 });
 await test('Marking passed keeps the course in the same semester and counts its credit once, excluding future workload',async()=>{
  const initial=draft([{code:'IN2064',status:'planned',semester:1,locked:true},{code:'IN2228',status:'planned',semester:1}]),h=await harness(initial),total=C.calculate(initial,courses).allocated;
  await h.click('data-passed','IN2064');const p=h.plan(),html=h.html(),shown=card(html,'IN2064');
  assert.equal(p.items.length,2);assert.equal(p.items[0].semester,1);assert.equal(p.items[0].status,'passed');assert(shown.includes('✓ 已通过'));assert(shown.includes('draggable="true"'));assert(shown.includes('data-semester="IN2064"'));assert(!shown.includes('has-conflict'));assert(!shown.includes('目录不符'));assert(shown.includes('data-unpass="IN2064"'));
  const semester=html.match(/<section class="semester-card winter" id="semester-1"[\s\S]*?<\/section>/)[0];assert(semester.includes('plan-course-IN2064'));assert(semester.indexOf('plan-course-IN2064')<semester.indexOf('plan-course-IN2228'));assert(html.includes('已通过 8 · 待修 8 ECTS'));
  assert.equal(C.calculate(p,courses).allocated,total);assert.equal(C.calculate(p,courses,true).allocated,8);assert.equal(C.schedule(p,courses).semesters[0].credits,8);
  const refreshed=await harness(p);assert(card(refreshed.html(),'IN2064').includes('✓ 已通过'));assert.equal(refreshed.writes(),0);
  await h.toasts.at(-1).action.run();await tick();assert.deepEqual(h.plan(),initial);assert(!card(h.html(),'IN2064').includes('✓ 已通过'));
 });
 await test('Unknown and out-of-range passed history remains visible without assigning it a new semester',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:0},{code:'OWN1',name:'原有自录认定',ects:7.5,group:'H',custom:true,status:'passed',semester:6}]),h=await harness(initial),html=h.html();
  assert(html.includes('其他已通过课程'));assert(card(html,'IN2064').includes('通过学期未记录'));assert(card(html,'OWN1').includes('第 6 学期通过'));assert(card(html,'OWN1').includes('原有自录认定'));assert(card(html,'OWN1').includes('7.5'));
  assert.deepEqual(h.plan(),initial);assert.equal(h.writes(),0);assert(C.schedule(initial,courses).semesters.every(x=>x.credits===0));
  await h.click('data-unpass','OWN1');assert.deepEqual(h.plan().items[1],{...initial.items[1],status:'planned',semester:1});
  await h.toasts.at(-1).action.run();await tick();assert.deepEqual(h.plan(),initial);
 });
 await test('Reverting a passed course preserves its original in-range semester and undo cannot overwrite later edits',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:3}]),h=await harness(initial);
  await h.click('data-unpass','IN2064');assert.equal(h.plan().items[0].semester,3);assert.equal(h.plan().items[0].status,'planned');
  const undo=h.toasts.at(-1).action.run,next=h.plan();next.items[0].semester=1;await h.external(next);await assert.rejects(undo,/后续修改/);assert.equal(h.plan().items[0].semester,1);
 });
 await test('Passed cards expose historical semester choices and both dropdown and drag request an explicit history correction',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:6}]),h=await harness(initial),shown=card(h.html(),'IN2064');
  assert(shown.includes('value="0"'));assert(shown.includes('value="6" selected'));assert(shown.includes('value="12"'));assert(shown.includes('规划范围外'));assert(shown.includes('Machine Learning 通过学期'));
  await h.changeSemester('IN2064',2);await h.drag('IN2064',3);
  assert.deepEqual(h.moves,[{code:'IN2064',semester:2,options:{editPassedSemester:true}},{code:'IN2064',semester:3,options:{editPassedSemester:true}}]);
  assert.deepEqual(h.plan(),initial);
 });
 await test('Mobile passed records stay accessible below the board and support history corrections, status changes and undo',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:1},{code:'IN2228',status:'planned',semester:1}]),h=await harness(initial,false);
  assert(h.html().includes('<details id="passed-history"'));assert(card(h.html(),'IN2064').includes('✓ 已通过'));assert(card(h.html(),'IN2064').includes('通过学期'));assert(card(h.html(),'IN2228'));assert(!h.html().includes('semester-status-totals'));assert.equal(h.writes(),0);
  const firstSemester=h.html().match(/<section class="semester-card winter" id="semester-1"[\s\S]*?<\/section>/)[0];assert(!firstSemester.includes('plan-course-IN2064'));
  await h.changeSemester('IN2064',3);assert.deepEqual(h.moves,[{code:'IN2064',semester:3,options:{editPassedSemester:true}}]);
  await h.click('data-unpass','IN2064');assert.equal(h.plan().items[0].status,'planned');assert.equal(h.plan().items[0].semester,1);await h.toasts.at(-1).action.run();await tick();assert.deepEqual(h.plan(),initial);
  await h.click('data-passed','IN2228');assert.equal(h.plan().items[1].status,'passed');await h.toasts.at(-1).action.run();await tick();assert.deepEqual(h.plan(),initial);
 });
 await test('Future desktop cards use drag while mobile assignment, historical corrections, allocation and season warnings remain available',async()=>{
  const initial=draft([{code:'IN2064',status:'planned',semester:1},{code:'IN2228',status:'planned',semester:1},{code:'CIT433050',group:'I',status:'planned',semester:2},{code:'IN2107',status:'passed',semester:0}]);
  for(const desktop of [true,false]){
   const h=await harness(initial,desktop),html=h.html(),shown=card(html,'IN2064'),heading=shown.match(/<summary[\s\S]*?<\/summary>/)[0];
   assert(heading.includes('class="course-card-meta">IN2064 ·'));assert(!shown.includes('course-card-info'));
   assert.equal(shown.includes('data-semester="IN2064"'),!desktop);
   assert(card(html,'CIT433050').includes('data-allocation="CIT433050"'));assert(card(html,'IN2228').includes('id="course-season-IN2228"'));
   if(desktop)assert(card(html,'IN2107').includes('data-semester="IN2107"'));
   else{await h.changeSemester('IN2064',3);assert.deepEqual(h.moves,[{code:'IN2064',semester:3,options:{editPassedSemester:false}}]);}
   assert.equal(h.writes(),0);assert.deepEqual(h.plan(),initial);
  }
 });
 await test('Both layouts follow saved order without rendering redundant course-order controls',async()=>{
  const initial=C.reorderSemester(draft([{code:'IN2064',status:'planned',semester:1},{code:'IN2228',status:'passed',semester:1},{code:'IN2406',status:'planned',semester:1}]),1,['IN2406','IN2228','IN2064']);
  for(const desktop of [true,false]){
   const h=await harness(initial,desktop),html=h.html();assert(html.indexOf('id="plan-course-IN2406"')<html.indexOf('id="plan-course-IN2064"'));
   assert(!html.includes('同学期顺序'));assert(!html.includes('data-order-step'));assert(!html.includes('course-card-order'));
   assert(card(html,'IN2228'));assert.equal(h.writes(),0);assert.deepEqual(h.plan(),initial);
  }
 });
 await test('Dragging within a semester targets a card position while cross-semester drops retain the existing move flow',async()=>{
  const initial=draft(['IN2064','IN2228','IN2406'].map(code=>({code,status:'planned',semester:1}))),h=await harness(initial);
  await h.drag('IN2406',1,'IN2064','before');await h.drag('IN2064',1,'IN2406','after');await h.drag('IN2228',1);await h.drag('IN2406',2);
  assert.deepEqual(h.reorders,[{code:'IN2406',semester:1,options:{relativeTo:'IN2064',placement:'before'}},{code:'IN2064',semester:1,options:{relativeTo:'IN2406',placement:'after'}},{code:'IN2228',semester:1,options:{relativeTo:null}}]);
  assert.deepEqual(h.moves,[{code:'IN2406',semester:2,options:{editPassedSemester:false}}]);assert.deepEqual(h.plan(),initial);
  assert.deepEqual(h.acceptedDropEvents,['dragenter','dragover','dragenter','dragover','dragenter','dragover','dragenter','dragover']);
 });
 await test('Insertion markers sit at gap midpoints and gap drops use the indicated position, including list ends',async()=>{
  const initial=draft(['IN2064','IN2228','IN2406'].map(code=>({code,status:'planned',semester:1}))),h=await harness(initial);
  assert.deepEqual(await h.drag('IN2406',1,'IN2064','after'),{active:true,y:'105px',cleared:true});
  assert.deepEqual(await h.drag('IN2406',1,null,'before',205),{active:true,y:'105px',cleared:true});
  assert.deepEqual(h.reorders.at(-1),{code:'IN2406',semester:1,options:{relativeTo:'IN2228',placement:'before'}});
  assert.deepEqual(await h.drag('IN2406',1,'IN2064','before'),{active:true,y:'-5px',cleared:true});
  assert.deepEqual(await h.drag('IN2064',1,'IN2406','after'),{active:true,y:'325px',cleared:true});
  const self=await h.drag('IN2064',1,'IN2064');assert(!self.active);assert(self.cleared);
  const other=await h.drag('IN2064',2);assert(!other.active);assert(other.cleared);assert.deepEqual(h.plan(),initial);
 });
 await test('A status change shares its event refresh instead of reading and rendering the board twice',async()=>{
  const h=await harness(draft([{code:'IN2064',status:'planned',semester:1}])),reads=h.reads(),renders=h.renders();
  await h.click('data-passed','IN2064');
  assert.equal(h.writes(),1);assert.equal(h.reads()-reads,1);assert.equal(h.renders()-renders,1);
  assert(card(h.html(),'IN2064').includes('✓ 已通过'));
 });
 await test('Overlapping refreshes discard a stale snapshot and commit the latest plan once',async()=>{
  const initial=draft([{code:'IN2064',status:'planned',semester:1}]),h=await harness(initial),renders=h.renders(),release=h.holdPlan();
  const first=h.external({...initial,items:[...initial.items,{code:'IN2228',status:'planned',semester:2}]});
  await tick();
  const latest={...initial,items:[{code:'IN2406',status:'passed',semester:3}]},second=h.external(latest);
  release();await Promise.all([first,second]);
  assert.equal(h.renders()-renders,1);assert(card(h.html(),'IN2406').includes('✓ 已通过'));assert(!card(h.html(),'IN2228'));assert(!card(h.html(),'IN2064'));assert.equal(h.writes(),0);
  await h.external(initial);assert(card(h.html(),'IN2064'));assert.equal(h.renders()-renders,2);
 });
 await test('Desktop preparation assigns only unscheduled future courses and subsequent refreshes do not save',async()=>{
  const initial=draft([{code:'IN2064',status:'planned',semester:0},{code:'IN2228',status:'passed',semester:0}]),h=await harness(initial);
  assert.equal(h.writes(),1);assert.equal(h.plan().items[0].semester,1);assert.equal(h.plan().items[1].semester,0);
  await h.external(h.plan());assert.equal(h.writes(),1);
  const mobile=await harness(initial,false);assert.equal(mobile.writes(),0);assert.deepEqual(mobile.plan(),initial);
  await mobile.changeLayout(true);assert.equal(mobile.writes(),1);assert.equal(mobile.plan().items[0].semester,1);assert.equal(mobile.plan().items[1].semester,0);
  await mobile.changeLayout(false);await mobile.changeLayout(true);assert.equal(mobile.writes(),1);
  const unknown=await harness(C.validatePlan({...initial,cohort:'unknown'},courses));assert.equal(unknown.writes(),0);assert.equal(unknown.plan().items[0].semester,0);
 });
 console.log(`${checks} planner board checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
