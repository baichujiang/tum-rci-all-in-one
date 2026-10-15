/* Execute the actual preview UI to protect cancelled jobs and passed grades. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../assets/core'),E=require('../assets/planning-engine'),T=require('../assets/course-context'),S=require('../site3/search');
const courses=require('../scripts/load-courses')();
const source=fs.readFileSync(path.join(__dirname,'../site3/planning-controls.js'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(resolve=>setImmediate(resolve));
function element(){return {innerHTML:'',hidden:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];}};}
async function harness(desktop=false){
 let plan=C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,items:[]},courses),nextTimer=0,planGate=null,planReads=0;
 const timers=new Map(),workers=[],box=element(),dialog=element(),result=element(),apply=element(),cancel=element(),edit=element(),choices=element();
 const settings=element(),preferences=element(),tools=element(),finishSettings=element(),notice=element(),clear=element();
 dialog.querySelector=selector=>({'[data-apply-auto]':apply,'[data-cancel-auto]':cancel,'[data-edit-auto-settings]':edit}[selector]);
 settings.querySelector=()=>finishSettings;box.querySelector=()=>clear;
 for(const panel of [dialog,settings,preferences,tools]){panel.showModal=()=>{panel.open=true;};panel.close=()=>{panel.open=false;panel.handlers.close?.();};}
 class Worker{constructor(){this.terminated=false;workers.push(this);}postMessage(input){this.input=copy(input);}terminate(){this.terminated=true;}}
 const U={base:'',persisted:true,data:async()=>({courses,names:{},synonyms:[]}),plan:async()=>{planReads++;if(planGate)await planGate;return copy(plan);},updatePlan:async fn=>{const next=await fn(copy(plan));if(next)plan=C.validatePlan(next,courses);return plan;},confirmAction:async()=>true,toast(){}};
 const nodes={'planning-controls':box,'auto-plan-dialog':dialog,'auto-plan-result':result,'preference-results':choices,'plan-settings-dialog':settings,'course-preferences-dialog':preferences,'plan-tools-dialog':tools,'plan-context':element(),'plan-add-course':{dataset:{}},'plan-settings-content':element(),'course-preferences-content':element(),'plan-settings-notice':notice,'plan-cohort':{focus(){}},'controls-conditional-status':{focus(){this.focused=true;}},'auto-plan-title':element(),'auto-plan-description':element(),'preference-search':{focus(){this.focused=true;}},'plan-start-term':{focus(){}}};
 vm.runInNewContext(source,{window:{matchMedia:()=>({matches:desktop}),RCIUI:U,RCI:C,RCIPlanning:E,RCICourseContext:T,RCISearch:S,addEventListener(){}},document:{getElementById:id=>nodes[id]},Worker,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
 await tick();
 const generate=()=>box.handlers.click({target:{closest:()=>({hasAttribute:key=>key==='data-generate'})}});
 const finish=()=>box.handlers.click({target:{closest:()=>({hasAttribute:key=>key==='data-finish-settings'})}});
 const change=(id,value)=>box.handlers.change({target:{id,value,closest:()=>null}});
 return {nodes,preferences,workers,timers,dialog,result,apply,edit,settings,notice,generate,finish,change,getPlan:()=>copy(plan),setPlan:value=>{plan=C.validatePlan(value,courses);},planReads:()=>planReads,holdPlan:()=>{let resolve;planGate=new Promise(done=>{resolve=done;});return ()=>{planGate=null;resolve();};}};
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
 const setup=await harness(),unknown=setup.getPlan();unknown.cohort='unknown';unknown.conditionalConfirmed=false;setup.setPlan(unknown);
 await setup.generate();assert.equal(setup.workers.length,0);assert(setup.settings.open);assert(setup.notice.textContent.includes('补修要求'));
 await setup.change('plan-cohort','2026/27冬季');await setup.change('controls-conditional-status','no');await setup.finish();
 assert.equal(setup.settings.open,false);assert.equal(setup.workers.length,1);assert(setup.dialog.open);
 console.log('PASS First-time automatic planning opens necessary settings, then continues directly to a preview');
 await setup.edit.handlers.click();assert(setup.workers[0].terminated);assert.equal(setup.dialog.open,false);assert(setup.settings.open);assert.equal(setup.getPlan().items.length,0);
 console.log('PASS Editing automatic conditions cancels the pending worker and leaves the saved plan untouched');
 const shorter=await harness(),saved=shorter.getPlan();saved.items=[{code:'IN2064',status:'passed',semester:4},{code:'IN2228',status:'planned',semester:4}];shorter.setPlan(saved);
 await shorter.change('plan-semester-count','2');const reduced=shorter.getPlan();assert.equal(reduced.timeline.count,2);assert.equal(reduced.items.find(x=>x.code==='IN2064').semester,4);assert.equal(reduced.items.find(x=>x.code==='IN2228').semester,0);
 console.log('PASS Settings moved into the dialog retain historical passed semesters and unassign displaced future courses');
 const desktop=await harness(true);desktop.setPlan(saved);await desktop.change('plan-semester-count','2');
 assert.equal(desktop.getPlan().items.find(x=>x.code==='IN2064').semester,4);assert.equal(desktop.getPlan().items.find(x=>x.code==='IN2228').semester,1);
 console.log('PASS Desktop shortened plans retain courses in semester one without changing passed history');
 const conflict=await harness(true),conflicted=conflict.getPlan();conflicted.items=[{code:'ED140014',status:'planned',semester:1}];conflict.setPlan(conflicted);
 const unchanged=conflict.getPlan();await conflict.generate();conflict.workers[0].onmessage({data:E.generate(conflict.workers[0].input.plan,courses)});
 assert.equal(conflict.nodes['auto-plan-title'].textContent,'先核对补修要求');assert(conflict.result.innerHTML.includes('控制理论（ED140014）'));assert(conflict.result.innerHTML.includes('查看已选课程'));assert(conflict.result.innerHTML.includes('还没核对'));assert(conflict.result.innerHTML.includes('返回计划'));assert.equal(conflict.edit.textContent,'核对补修设置');assert(conflict.apply.hidden);
 await conflict.edit.handlers.click();assert(conflict.settings.open);assert(conflict.nodes['controls-conditional-status'].focused);assert.deepEqual(conflict.getPlan(),unchanged);
 console.log('PASS Remediation conflict explains both choices and focuses the setting without enabling it or removing a course');
 const desired=await harness(true),wanted=desired.getPlan();wanted.preferences.desired=['ED140014'];desired.setPlan(wanted);await desired.generate();desired.workers[0].onmessage({data:E.generate(desired.workers[0].input.plan,courses)});
 assert(desired.result.innerHTML.includes('“想选”列表'));assert(desired.result.innerHTML.includes('查看想选记录'));assert(!desired.result.innerHTML.includes('查看已选课程'));
 await desired.result.handlers.click({target:{closest:()=>({dataset:{reviewRemediation:'desired'}})}});assert(desired.preferences.open);assert(desired.nodes['preference-search'].focused);assert.deepEqual(desired.getPlan().preferences.desired,['ED140014']);
 console.log('PASS Desired-only remediation conflicts open the corresponding preference without changing it');
 console.log('9 planning UI checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
