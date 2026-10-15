/* Exercise the production plan API with storage/confirmation boundaries, without unrelated page widgets. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),C=require('../assets/core.js');
const courses=C.csv(fs.readFileSync(path.join(root,'data/courses_legal_2025.csv'),'utf8'));
const source=fs.readFileSync(path.join(root,'site3/app.js'),'utf8').split('const savedRaw=')[0]+'})();';
const draft=()=>({version:2,cohort:'2026/27冬季',conditional:false,timeline:{count:4,start:'winter'},items:[{code:'IN2064',status:'planned',semester:1}]});
function harness(initial=draft(),desktop=false){
 let stored=JSON.stringify(initial),writes=0,events=0,confirmations=0;
 const control={confirm:true,quota:false};
 const toast={replaceChildren(){},append(){},contains(){return false;}};
 const window={matchMedia:()=>({matches:desktop}),RCILocalLock:require('../site3/local-lock'),RCI:C,confirm(){confirmations++;if(control.onConfirm)control.onConfirm();return control.confirm;},dispatchEvent(ev){assert.equal(ev.type,'rci:planchange');events++;}};
 const context={window,navigator:{locks:{request:(_name,work)=>work()}},URLSearchParams,location:{search:''},document:{querySelector(s){if(s==='meta[name="rci-base"]')return {content:''};if(s==='#toast')return toast;return null;},createElement(){return {addEventListener(){}};}},localStorage:{getItem(){return stored;},setItem(key,value){assert.equal(key,'rci:v2:plan');if(control.quota)throw new Error('quota');stored=value;writes++;}},fetch:async url=>{assert.equal(url,'/assets/planner-data.json');return {ok:true,json:async()=>({courses,names:{}})};},Event:function(type){this.type=type;},setTimeout(){return 0;},clearTimeout(){}};
 vm.runInNewContext(source,context,{filename:'site3/app.js'});
 return {U:window.RCIUI,control,stored:()=>JSON.parse(stored),externalPlan:value=>{stored=JSON.stringify(value);},writes:()=>writes,events:()=>events,confirmations:()=>confirmations};
}
let tests=0;
async function test(name,fn){await fn();tests++;console.log('PASS',name);}
(async()=>{
 await test('A clear confirmation cannot erase a course added by another page',async()=>{
  const h=harness(),latest={...draft(),items:[...draft().items,{code:'IN2320',status:'planned',semester:4}]};
  h.control.onConfirm=()=>h.externalPlan(latest);
  await assert.rejects(h.U.clearPlan(),/其他页面/);
  assert.deepEqual(h.stored(),latest);assert.equal(h.writes(),0);
 });
 await test('Clearing a plan requires confirmation and resets settings only after acceptance',async()=>{
  const h=harness();h.control.confirm=false;
  assert.equal(await h.U.clearPlan(),false);assert.deepEqual(h.stored(),draft());assert.equal(h.writes(),0);
  h.control.confirm=true;assert.equal(await h.U.clearPlan(),true);
  assert.deepEqual(h.stored(),JSON.parse(JSON.stringify(C.validatePlan(h.U.empty(),courses))));assert.equal(h.writes(),1);
 });
 await test('Without cross-page locks, a confirmation cannot overwrite another page’s new course',async()=>{
  const h=harness(),latest={...draft(),items:[...draft().items,{code:'IN2320',status:'planned',semester:4}]};
  h.control.onConfirm=()=>h.externalPlan(latest);
  await assert.rejects(h.U.moveCourse('IN2064',2),/其他页面/);
  assert.deepEqual(h.stored(),latest);assert.equal(h.writes(),0);
 });
 await test('Moving a legacy course preserves its record and degree accounting',async()=>{
  const h=harness(),before=C.calculate(await h.U.plan(),courses).allocated;
  const change=await h.U.moveCourse(' in2064 ',3);
  assert.equal(change.kind,'moved');assert.equal(change.previous.semester,1);
  assert.deepEqual(h.stored().items,[{code:'IN2064',status:'planned',semester:3,locked:false}]);
  assert.equal(C.calculate(await h.U.plan(),courses).allocated,before);assert.equal(h.writes(),1);assert.equal(h.events(),1);
 });
 await test('Custom and unassigned courses can move and undo without losing fields',async()=>{
  const initial=draft();initial.items=[{code:'OWN101',name:'自己的选修',ects:6,group:'G',status:'planned',custom:true,semester:0}];
  const h=harness(initial),change=await h.U.moveCourse('OWN101',2);
  assert.deepEqual(h.stored().items[0],{...initial.items[0],semester:2,locked:false});
  await h.U.undoCourse(change);assert.deepEqual(h.stored().items,C.validatePlan(initial,courses).items);
 });
 await test('A custom record whose code is now in the catalogue keeps its recognition and skips catalogue season prompts',async()=>{
  const initial=draft();initial.items=[{code:'IN2060',name:'原有自录认定',ects:7.5,group:'H',status:'planned',custom:true,semester:1}];
  const h=harness(initial);h.control.confirm=false;const change=await h.U.moveCourse('IN2060',2);
  assert.equal(change.kind,'moved');assert.equal(h.confirmations(),0);assert.equal(h.stored().items[0].ects,7.5);assert.equal(h.stored().items[0].group,'H');
  const changed=h.stored();changed.items[0].ects=8;changed.items[0].name='重新核对的自录认定';h.externalPlan(changed);
  await assert.rejects(h.U.undoCourse(change),/其他调整/);assert.equal(h.stored().items[0].ects,8);assert.equal(h.stored().items[0].name,'重新核对的自录认定');
 });
 await test('Cancelling a seasonal mismatch leaves storage untouched; confirmation allows it',async()=>{
  const h=harness();h.control.confirm=false;
  assert.equal((await h.U.moveCourse('IN2064',2)).kind,'cancelled');
  assert.equal(h.stored().items[0].semester,1);assert.equal(h.writes(),0);assert.equal(h.events(),0);
  h.control.confirm=true;assert.equal((await h.U.moveCourse('IN2064',2)).kind,'moved');
  assert.equal(h.stored().items[0].semester,2);assert.equal(h.confirmations(),2);
 });
 await test('Missing courses and invalid semesters never create records or overwrite a plan',async()=>{
  const h=harness();
  await assert.rejects(h.U.moveCourse('MISSING',1),/不在计划/);
  for(const n of [-1,5,1.5,NaN])await assert.rejects(h.U.moveCourse('IN2064',n),/目标学期/);
  assert.equal((await h.U.moveCourse('IN2064',1)).kind,'unchanged');assert.equal(h.writes(),0);
  assert.deepEqual(h.stored(),draft());
 });
 await test('Rapid moves serialize; undo refuses to overwrite a subsequent adjustment',async()=>{
  const h=harness(),[first,second]=await Promise.all([h.U.moveCourse('IN2064',3),h.U.moveCourse('IN2064',1)]);
  assert.equal(second.previous.semester,3);assert.equal(h.stored().items[0].semester,1);
  await assert.rejects(h.U.undoCourse(first),/其他调整/);
  await h.U.undoCourse(second);assert.equal(h.stored().items[0].semester,3);
  await h.U.undoCourse(first);assert.equal(h.stored().items[0].semester,1);
 });
 await test('Unavailable storage keeps the moved plan for the session and reports it unsaved',async()=>{
  const h=harness();h.control.quota=true;
  await h.U.moveCourse('IN2064',3);
  assert.equal((await h.U.plan()).items[0].semester,3);assert.equal(h.stored().items[0].semester,1);assert.equal(h.U.persisted,false);
 });
 await test('Selecting the other Robotics option cannot replace a passed grade or its historical semester',async()=>{
  const initial=draft();initial.items=[{code:'IN2067',status:'passed',semester:5}];const h=harness(initial);
  await assert.rejects(h.U.addCourse('ED160028',2),/已修/);
  await assert.rejects(h.U.moveCourse('IN2067',1),/已修/);
  assert.deepEqual(h.stored(),initial);assert.equal(h.writes(),0);assert.equal((await h.U.plan()).items[0].semester,5);
 });
 await test('Explicit desktop corrections move a passed grade without future workload or current-season prompts',async()=>{
  const initial=draft();initial.items=[{code:'IN2064',status:'passed',semester:1,locked:true}];const h=harness(initial,true),before=C.validatePlan(initial,courses);
  h.control.confirm=false;const change=await h.U.moveCourse(' in2064 ',2,{editPassedSemester:true});
  assert.equal(change.kind,'moved');assert.deepEqual(h.stored().items,[{...before.items[0],semester:2}]);assert.equal(h.confirmations(),0);
  assert.equal(C.calculate(h.stored(),courses,true).allocated,8);assert(C.schedule(h.stored(),courses).semesters.every(x=>x.credits===0));
  assert.equal((await h.U.addCourse('IN2064',3,{moveExisting:true})).kind,'unchanged');assert.equal(h.stored().items[0].semester,2);
  await h.U.undoCourse(change);assert.deepEqual(h.stored().items,before.items);
  const unknown=await h.U.moveCourse('IN2064',0,{editPassedSemester:true});assert.equal(h.stored().items[0].semester,0);assert.equal(h.stored().items[0].status,'passed');
  await h.U.undoCourse(unknown);assert.deepEqual(h.stored().items,before.items);
 });
 await test('Historical corrections preserve custom recognition, all twelve valid semesters and safe undo after shortening the plan',async()=>{
  const initial=draft();initial.items=[{code:'OWN101',name:'原有认定',ects:7.5,group:'H',custom:true,status:'passed',semester:6}];const h=harness(initial,true),before=C.validatePlan(initial,courses);
  for(const semester of [-1,13,1.5,NaN])await assert.rejects(h.U.moveCourse('OWN101',semester,{editPassedSemester:true}),/目标学期/);
  assert.equal(h.writes(),0);
  const change=await h.U.moveCourse('OWN101',12,{editPassedSemester:true});assert.deepEqual(h.stored().items,[{...before.items[0],semester:12}]);
  await h.U.updatePlan(p=>({...p,timeline:{...p.timeline,count:2}}));await h.U.undoCourse(change);
  assert.equal(h.stored().timeline.count,2);assert.deepEqual(h.stored().items,before.items);
  const next=await h.U.moveCourse('OWN101',1,{editPassedSemester:true}),latest=h.stored();latest.items[0].status='planned';h.externalPlan(latest);
  await assert.rejects(h.U.undoCourse(next),/其他调整/);assert.equal(h.stored().items[0].status,'planned');
 });
 await test('Passed-semester editing requires a current passed record and leaves narrow-screen behavior unchanged',async()=>{
  const initial=draft(),h=harness(initial,true);
  await assert.rejects(h.U.moveCourse('IN2064',2,{editPassedSemester:true}),/状态已更新/);assert.equal(h.writes(),0);
  initial.items[0].status='passed';const narrow=harness(initial);
  await assert.rejects(narrow.U.moveCourse('IN2064',2,{editPassedSemester:true}),/已修/);assert.equal(narrow.writes(),0);
 });
 await test('Directory direct add and move can undo while preserving all previous records',async()=>{
  const h=harness(),before=C.validatePlan(draft(),courses),added=await h.U.addCourse('IN2346',1,{moveExisting:true});
  assert.equal(added.kind,'added');assert.equal(h.stored().items.length,2);await h.U.undoCourse(added);assert.deepEqual(h.stored().items,before.items);
  const moved=await h.U.addCourse('IN2064',3,{moveExisting:true});assert.equal(moved.kind,'moved');assert.equal(h.stored().items[0].semester,3);await h.U.undoCourse(moved);assert.deepEqual(h.stored().items,before.items);
  h.control.confirm=false;assert.equal((await h.U.addCourse('IN2064',2,{moveExisting:true})).kind,'cancelled');assert.deepEqual(h.stored().items,before.items);
 });
 await test('Undoing a confirmed Robotics alternative restores the previous choice and semester',async()=>{
  const initial=draft();initial.items=[{code:'IN2067',status:'planned',semester:1,locked:true}];const h=harness(initial);
  h.control.confirm=false;assert.equal((await h.U.addCourse('ED160028',2,{moveExisting:true})).kind,'cancelled');assert.equal(h.writes(),0);
  h.control.confirm=true;const change=await h.U.addCourse('ED160028',2,{moveExisting:true});assert.equal(change.kind,'replaced');assert.equal(h.stored().items[0].code,'ED160028');await h.U.undoCourse(change);assert.deepEqual(h.stored().items,C.validatePlan(initial,courses).items);
 });
 await test('Desktop default additions go to the first semester while narrow-screen defaults remain compatible',async()=>{
  const initial=draft();initial.items=[];
  const desktop=harness(initial,true),added=await desktop.U.addCourse('IN2064');
  assert.equal(added.semester,1);assert.equal(desktop.stored().items[0].semester,1);
  await desktop.U.undoCourse(added);assert.equal(desktop.stored().items.length,0);
  const narrow=harness(initial);assert.equal((await narrow.U.addCourse('IN2064')).semester,0);
 });
 await test('Assigning legacy future records preserves custom recognition and passed history and is idempotent',async()=>{
  const initial=draft();initial.items=[{code:'IN2064',status:'passed',semester:0},{code:'OWN101',name:'旧认定',ects:7.5,group:'H',status:'planned',custom:true,semester:0},{code:'IN2228',status:'planned',semester:2}];
  const h=harness(initial,true),before=C.validatePlan(initial,courses);
  await h.U.assignUnscheduled();
  assert.deepEqual(h.stored().items,before.items.map(x=>x.status==='planned'&&x.semester===0?{...x,semester:1}:x));
  assert.equal(h.stored().items.find(x=>x.code==='IN2064').semester,0);
  const writes=h.writes();await h.U.assignUnscheduled();assert.equal(h.writes(),writes);
 });
 console.log(`${tests} plan interaction checks passed`);
})().catch(err=>{console.error(err);process.exitCode=1;});
