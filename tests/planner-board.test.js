/* Run the production board and status actions against validated local records. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../assets/core'),T=require('../assets/course-context'),E=require('../assets/planning-engine');
const courses=require('../scripts/load-courses')(),names=require('../content/editorial.json').course_names_zh;
const source=fs.readFileSync(require.resolve('../site3/planner'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(resolve=>setImmediate(resolve));
const draft=items=>C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,timeline:{count:4,start:'winter'},items},courses);
function element(){return {innerHTML:'',open:false,handlers:{},style:{setProperty(){}},scrollLeft:0,scrollWidth:600,clientWidth:600,elements:{namedItem(){}},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];},focus(){},toggleAttribute(){}};}
async function harness(initial,desktop=true){
 let plan=copy(initial),writes=0;const events={},nodes={},toasts=[],moves=[],box=element(),creditDialog=element(),creditContent=element();
 creditDialog.showModal=()=>{creditDialog.open=true;};creditDialog.close=()=>{creditDialog.open=false;};creditContent.querySelector=()=>null;
 for(const key of ['.semester-board','.board-head-scroll','.board-courses-scroll','[data-board-step="-1"]','[data-board-step="1"]','#summary-gaps','#custom-plan'])nodes[key]=element();
 box.querySelector=key=>nodes[key];
 const U={base:'',persisted:true,data:async()=>({courses,names}),plan:async()=>copy(plan),updatePlan:async fn=>{const next=await fn(copy(plan));if(next){plan=C.validatePlan(next,courses);writes++;events['rci:planchange']?.();}return copy(plan);},toast:(message,action)=>toasts.push({message,action})};
 U.moveCourse=async(code,semester,options)=>{moves.push(copy({code,semester,options}));return {kind:'unchanged',code,semester};};
 vm.runInNewContext(source,{window:{matchMedia:()=>({matches:desktop,addEventListener(){}}),RCIUI:U,RCI:C,RCICourseContext:T,RCIPlanning:E,addEventListener:(key,fn)=>events[key]=fn},document:{activeElement:null,getElementById:id=>({'planner':box,'credit-check-dialog':creditDialog,'credit-check-content':creditContent}[id])},cancelAnimationFrame(){},requestAnimationFrame(){}});
 await tick();
 const click=async(key,code)=>{const name=key.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());await box.handlers.click({target:{closest:()=>({dataset:{[name]:code},hasAttribute:k=>k===key})}});await tick();};
 const changeSemester=async(code,semester)=>{await box.handlers.change({target:{value:String(semester),dataset:{semester:code},hasAttribute:key=>key==='data-semester'}});await tick();};
 const drag=async(code,semester)=>{
  const item={dataset:{planCourse:code},getAttribute:()=> 'true',classList:{add(){}}};
  box.handlers.dragstart({target:{closest:selector=>selector==='[data-plan-course]'?item:null},clientX:0,dataTransfer:{setData(){}}});
  await box.handlers.drop({target:{closest:()=>({dataset:{dropSemester:String(semester)}})},preventDefault(){}});await tick();
 };
 return {html:()=>box.innerHTML,creditHTML:()=>creditContent.innerHTML,creditDialog,plan:()=>copy(plan),writes:()=>writes,toasts,moves,click,changeSemester,drag,external:async value=>{plan=C.validatePlan(value,courses);await events['rci:planchange']();await tick();}};
}
const card=(html,code)=>html.match(new RegExp('<details[^>]*id="plan-course-'+code+'"[\\s\\S]*?</details>'))?.[0];
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
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
 await test('Desktop credit check opens without changing a plan, shows category and domain gaps, and refreshes while open',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:1},{code:'OWNG',name:'已认可计算选修',ects:8.5,group:'G',custom:true,status:'planned',semester:2},{code:'OWNJ',name:'已认可跨学科',ects:7.5,group:'J',custom:true,status:'planned',semester:2}]),h=await harness(initial);
  assert(h.html().includes('data-open-credit-check'));assert(!h.html().includes('id="summary-gaps"'));
  assert(h.creditHTML().includes('22.5<small> / 120 ECTS'));assert(h.creditHTML().includes('97.5<small> ECTS'));assert(h.creditHTML().includes('超出 1.5 ECTS 未计入总进度'));
  for(const group of ['core','professional','F','H','I'])assert(h.creditHTML().includes('/courses/?group='+group));
  assert(!h.creditHTML().includes('href="/courses/?group=G"'));assert(!h.creditHTML().includes('href="/courses/?group=J"'));
  assert(h.creditHTML().includes('data-study-section="deadlines"'));assert(h.creditHTML().includes('已包含在上方专业选修总额中'));assert(h.creditHTML().includes('计划可覆盖'));assert(h.creditHTML().includes('计划还差 7.5 ECTS'));
  await h.click('data-open-credit-check','');assert(h.creditDialog.open);assert.equal(h.writes(),0);assert.deepEqual(h.plan(),initial);
  await h.external({...initial,items:[]});assert(h.creditDialog.open);assert(h.creditHTML().includes('120<small> ECTS'));assert(h.creditHTML().includes('/courses/?group=J'));assert.equal(h.writes(),0);
  const narrow=await harness(initial,false);assert(narrow.html().includes('id="summary-gaps"'));assert(narrow.html().includes('data-study-section="deadlines"'));assert(!narrow.html().includes('data-open-credit-check'));assert.equal(narrow.creditHTML(),'');
 });
 await test('Credit check separates historical records from future estimates and explains unconfirmed remediation',async()=>{
  const initial=C.validatePlan({...draft([{code:'IN2064',status:'passed',semester:0},{code:'ED140014',status:'planned',semester:4}]),cohort:'unknown',conditionalConfirmed:false,preferences:{startSemester:4}},courses),h=await harness(initial);
  assert(h.creditHTML().includes('尚未选择入学批次'));assert(h.creditHTML().includes('录取补修要求尚未确认'));assert(h.creditHTML().includes('ED140014'));assert(h.creditHTML().includes('data-open-settings'));
  const historical=h.creditHTML().match(/<tr><th scope="row">第 2 学期末[\s\S]*?<\/tr>/)[0];assert(historical.includes('历史记录'));assert(historical.includes('通过学期待核对'));assert(!historical.includes('计划可覆盖'));
  const confirmed=await harness(C.validatePlan({...initial,cohort:'2026/27冬季',conditional:true,conditionalConfirmed:true},courses));
  assert(confirmed.creditHTML().includes('补修 K'));assert(confirmed.creditHTML().includes('credit-category-remediation'));assert(!confirmed.creditHTML().includes('data-open-settings'));assert.deepEqual(confirmed.plan().items,initial.items);assert.equal(confirmed.writes(),0);
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
 await test('Desktop credit segments use target weights and preserve fractional planned and passed credits',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:1},{code:'OWN1',name:'示例认定',ects:7.5,group:'G',custom:true,status:'planned',semester:2}]),h=await harness(initial);
  const segments=[...h.html().matchAll(/data-credit-share="([\d.]+)" max="([\d.]+)" value="([\d.]+)"/g)].map(m=>m.slice(1).map(Number));
  assert.deepEqual(segments,[[43,43,8],[41,41,7.5],[6,6,0],[30,30,0]]);
  assert.deepEqual([...h.html().matchAll(/<progress[^>]*data-credit-category="([^"]+)"/g)].map(m=>m[1]),['core','professional','interdisciplinary','thesis']);
  assert.deepEqual([...h.html().matchAll(/class="credit-segment[^>]*data-credit-category="([^"]+)" tabindex="0"/g)].map(m=>m[1]),['core','professional','interdisciplinary','thesis']);
  assert.equal(segments.reduce((n,x)=>n+x[0],0),120);assert(h.html().includes('credit-category-thesis'));
  assert.equal(h.writes(),0);assert.deepEqual(h.plan(),initial);
 });
 await test('Credit distribution follows the active remediation rule and caps overfilled category progress',async()=>{
  const initial=C.validatePlan({...draft([]),conditional:true,conditionalConfirmed:true,items:[{code:'OWN1',name:'原有认定',ects:30,group:'G',custom:true,status:'passed',semester:1},{code:'OWN2',name:'另一项认定',ects:30,group:'H',custom:true,status:'planned',semester:2}]},courses),h=await harness(initial);
  const segments=[...h.html().matchAll(/data-credit-share="([\d.]+)" max="([\d.]+)" value="([\d.]+)"/g)].map(m=>m.slice(1).map(Number));
  assert.deepEqual(segments,[[43,43,0],[36,36,36],[6,6,0],[30,30,0],[5,5,0]]);assert.equal(segments.reduce((n,x)=>n+x[0],0),120);
  assert.equal([...h.html().matchAll(/data-credit-category="remediation"/g)].length,2);
  assert(h.html().includes('credit-category-remediation'));assert.deepEqual(h.plan(),initial);assert.equal(h.writes(),0);
  const legacy=await harness(C.validatePlan({...initial,cohort:'2024夏季'},courses));
  assert(legacy.html().includes('data-credit-share="41"'));assert(!legacy.html().includes('credit-category-remediation'));
  const narrow=await harness(initial,false);assert(!narrow.html().includes('credit-distribution'));assert(narrow.html().includes('class="progress-row"'));
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
 await test('Previously passed records remain outside the narrow-screen board',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:1},{code:'IN2228',status:'planned',semester:1}]),h=await harness(initial,false);
  assert(!card(h.html(),'IN2064'));assert(card(h.html(),'IN2228'));assert(!h.html().includes('semester-status-totals'));assert.equal(h.writes(),0);
 });
 console.log(`${checks} planner board checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
