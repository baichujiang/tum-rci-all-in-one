/* Execute the actual preview UI to protect cancelled jobs and passed grades. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../assets/core'),E=require('../assets/planning-engine'),T=require('../assets/course-context'),S=require('../site3/search');
const courses=C.csv(fs.readFileSync(path.join(__dirname,'../data/courses_legal_2025.csv'),'utf8'));
const source=fs.readFileSync(path.join(__dirname,'../site3/planning-controls.js'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(resolve=>setImmediate(resolve));
function element(){return {innerHTML:'',hidden:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];}};}
async function harness(){
 let plan=C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,items:[]},courses),nextTimer=0,planGate=null,planReads=0;
 const timers=new Map(),workers=[],box=element(),dialog=element(),result=element(),apply=element(),cancel=element(),choices=element();
 dialog.querySelector=selector=>selector==='[data-apply-auto]'?apply:cancel;
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.handlers.close();};
 class Worker{constructor(){this.terminated=false;workers.push(this);}postMessage(input){this.input=copy(input);}terminate(){this.terminated=true;}}
 const U={base:'',persisted:true,data:async()=>({courses,names:{},synonyms:[]}),plan:async()=>{planReads++;if(planGate)await planGate;return copy(plan);},updatePlan:async fn=>{const next=await fn(copy(plan));if(next)plan=C.validatePlan(next,courses);return plan;},toast(){}};
 const nodes={'planning-controls':box,'auto-plan-dialog':dialog,'auto-plan-result':result,'preference-results':choices};
 vm.runInNewContext(source,{window:{RCIUI:U,RCI:C,RCIPlanning:E,RCICourseContext:T,RCISearch:S,addEventListener(){}},document:{getElementById:id=>nodes[id]},Worker,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
 await tick();
 const generate=()=>box.handlers.click({target:{closest:()=>({hasAttribute:key=>key==='data-generate'})}});
 return {workers,timers,dialog,result,apply,generate,getPlan:()=>copy(plan),setPlan:value=>{plan=C.validatePlan(value,courses);},planReads:()=>planReads,holdPlan:()=>{let resolve;planGate=new Promise(done=>{resolve=done;});return ()=>{planGate=null;resolve();};}};
}
(async()=>{
 const h=await harness();await h.generate();const first=h.workers[0],oldTimeout=[...h.timers.values()][0],oldMessage=first.onmessage;
 h.dialog.close();assert(first.terminated);assert.equal(h.timers.size,0);
 const next=h.getPlan();next.items=[{code:'IN2064',status:'passed',semester:0}];h.setPlan(next);
 await h.generate();const second=h.workers[1];oldTimeout();assert.equal(second.terminated,false);assert(h.result.innerHTML.includes('正在检查'));
 console.log('PASS Cancelling a search clears its timer; a queued old timeout cannot terminate a new search');
 second.onmessage({data:E.generate(second.input.plan,courses)});
 const latest=h.result.innerHTML;assert(latest.includes('已修 8'));assert.equal(h.timers.size,0);
 oldMessage({data:E.generate(first.input.plan,courses)});assert.equal(h.result.innerHTML,latest);
 await h.apply.handlers.click();assert.equal(h.getPlan().items.find(x=>x.code==='IN2064').status,'passed');
 console.log('PASS A late cancelled result cannot replace a new preview or erase a passed grade when applied');
 const parallel=await harness(),release=parallel.holdPlan(),firstRequest=parallel.generate(),reads=parallel.planReads();
 await parallel.generate();assert.equal(parallel.planReads(),reads);release();await firstRequest;assert.equal(parallel.workers.length,1);parallel.dialog.close();
 console.log('PASS Rapid generate clicks reserve one request while the plan snapshot is still loading');
 console.log('3 planning UI checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
