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
 let plan=copy(initial),writes=0;const events={},nodes={},toasts=[],box=element();
 for(const key of ['.semester-board','.board-head-scroll','.board-courses-scroll','[data-board-step="-1"]','[data-board-step="1"]','#summary-gaps','#custom-plan'])nodes[key]=element();
 box.querySelector=key=>nodes[key];
 const U={base:'',persisted:true,data:async()=>({courses,names}),plan:async()=>copy(plan),updatePlan:async fn=>{const next=await fn(copy(plan));if(next){plan=C.validatePlan(next,courses);writes++;events['rci:planchange']?.();}return copy(plan);},toast:(message,action)=>toasts.push({message,action})};
 vm.runInNewContext(source,{window:{matchMedia:()=>({matches:desktop,addEventListener(){}}),RCIUI:U,RCI:C,RCICourseContext:T,RCIPlanning:E,addEventListener:(key,fn)=>events[key]=fn},document:{activeElement:null,getElementById:id=>id==='planner'?box:null},cancelAnimationFrame(){},requestAnimationFrame(){}});
 await tick();
 const click=async(key,code)=>{const name=key.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());await box.handlers.click({target:{closest:()=>({dataset:{[name]:code},hasAttribute:k=>k===key})}});await tick();};
 return {html:()=>box.innerHTML,plan:()=>copy(plan),writes:()=>writes,toasts,click,external:async value=>{plan=C.validatePlan(value,courses);await events['rci:planchange']();await tick();}};
}
const card=(html,code)=>html.match(new RegExp('<details[^>]*id="plan-course-'+code+'"[\\s\\S]*?</details>'))?.[0];
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 await test('Marking passed keeps the course in the same semester and counts its credit once, excluding future workload',async()=>{
  const initial=draft([{code:'IN2064',status:'planned',semester:1,locked:true},{code:'IN2228',status:'planned',semester:1}]),h=await harness(initial),total=C.calculate(initial,courses).allocated;
  await h.click('data-passed','IN2064');const p=h.plan(),html=h.html(),shown=card(html,'IN2064');
  assert.equal(p.items.length,2);assert.equal(p.items[0].semester,1);assert.equal(p.items[0].status,'passed');assert(shown.includes('✓ 已通过'));assert(shown.includes('draggable="false"'));assert(!shown.includes('data-semester'));assert(!shown.includes('has-conflict'));assert(shown.includes('data-unpass="IN2064"'));
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
 await test('Previously passed records remain outside the narrow-screen board',async()=>{
  const initial=draft([{code:'IN2064',status:'passed',semester:1},{code:'IN2228',status:'planned',semester:1}]),h=await harness(initial,false);
  assert(!card(h.html(),'IN2064'));assert(card(h.html(),'IN2228'));assert(!h.html().includes('semester-status-totals'));assert.equal(h.writes(),0);
 });
 console.log(`${checks} planner board checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
