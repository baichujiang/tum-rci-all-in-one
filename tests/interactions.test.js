/* Exercise the production plan API with storage/confirmation boundaries, without unrelated page widgets. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),C=require('../assets/core.js');
const courses=C.csv(fs.readFileSync(path.join(root,'data/courses_legal_2025.csv'),'utf8'));
const source=fs.readFileSync(path.join(root,'site3/app.js'),'utf8').split('const savedRaw=')[0]+'})();';
const draft=()=>({version:2,cohort:'2026/27冬季',conditional:false,timeline:{count:4,start:'winter'},items:[{code:'IN2064',status:'planned',semester:1}]});
const courseTopics=require('../data/course-topics.json');
function harness(initial=draft(),desktop=false){
 let stored=JSON.stringify(initial),writes=0,events=0,confirmations=0;
 const control={confirm:true,quota:false},prompts=[];
 function element(){return {handlers:{},value:'',hidden:false,disabled:false,addEventListener(type,fn){this.handlers[type]=fn;},focus(){},setAttribute(){}};}
 function createElement(tag){
  const node=element();if(tag!=='dialog')return node;
  const fields=Object.fromEntries(['form','#academic-term-cohort','#academic-term-error','#academic-term-save','#academic-term-preview'].map(key=>[key,element()]));
  node.querySelector=key=>fields[key];node.querySelectorAll=()=>[];
  node.showModal=()=>{node.open=true;prompts.push(node);};node.close=()=>{node.open=false;node.handlers.close();};node.remove=()=>{};
  node.submit=async cohort=>{fields['#academic-term-cohort'].value=cohort;fields['#academic-term-cohort'].handlers.change();await fields.form.handlers.submit({preventDefault(){}});};
  return node;
 }
 const toast={replaceChildren(){},append(){},contains(){return false;}};
 const window={matchMedia:()=>({matches:desktop}),RCILocalLock:require('../site3/local-lock'),RCI:C,confirm(){confirmations++;if(control.onConfirm)control.onConfirm();return control.confirm;},dispatchEvent(ev){assert.equal(ev.type,'rci:planchange');events++;}};
 const context={window,navigator:{locks:{request:(_name,work)=>work()}},URLSearchParams,location:{search:''},document:{body:{append(){}},querySelector(s){if(s==='meta[name="rci-base"]')return {content:''};if(s==='#toast')return toast;return null;},createElement},localStorage:{getItem(){return stored;},setItem(key,value){assert.equal(key,'rci:v2:plan');if(control.quota)throw new Error('quota');stored=value;writes++;}},fetch:async url=>{assert.equal(url,'/assets/planner-data.json');return {ok:true,json:async()=>({courses,courseTopics,names:{}})};},Event:function(type){this.type=type;},setTimeout(){return 0;},clearTimeout(){}};
 vm.runInNewContext(source,context,{filename:'site3/app.js'});
 return {U:window.RCIUI,control,prompts,nextPrompt:async()=>{for(let i=0;i<8&&!prompts.at(-1)?.open;i++)await new Promise(resolve=>setImmediate(resolve));assert(prompts.at(-1)?.open,'Expected entry-term prompt');return prompts.at(-1);},stored:()=>JSON.parse(stored),externalPlan:value=>{stored=JSON.stringify(value);},writes:()=>writes,events:()=>events,confirmations:()=>confirmations};
}
let tests=0;
async function test(name,fn){await fn();tests++;console.log('PASS',name);}
(async()=>{
 await test('Saving candidate sets keeps one credit-bearing module; remove, clear and undo preserve placement',async()=>{
  const [first,second,third]=courseTopics.entries.filter(x=>x.module==='IN2107'),h=harness({...draft(),items:[]});
  const added=await h.U.setCourseTopics('IN2107',[first.id,second.id],{semester:2,expectedTopics:[],expectedExists:false});
  assert.equal(added.kind,'added');assert.equal(h.stored().version,7);assert.equal(h.stored().items.length,1);assert.equal(C.calculate(h.stored(),courses).allocated,5);assert.equal(h.stored().items[0].topics.length,2);
  const changed=await h.U.setCourseTopics('IN2107',[second.id,third.id],{semester:3,expectedTopics:[C.validateTopic(first,'IN2107'),C.validateTopic(second,'IN2107')],expectedExists:true});
  assert.equal(changed.kind,'topics');assert.equal(h.stored().items.length,1);assert.equal(h.stored().items[0].semester,2);assert.deepEqual(h.stored().items[0].topics.map(x=>x.id),[second.id,third.id]);
  const count=h.writes();assert.equal((await h.U.setCourseTopics('IN2107',[third.id,second.id])).kind,'unchanged');assert.equal(h.writes(),count);
  await h.U.undoCourse(changed);assert.deepEqual(h.stored().items[0].topics.map(x=>x.id),[first.id,second.id]);
  const cleared=await h.U.setCourseTopics('IN2107',[]);assert.equal(h.stored().items.length,1);assert(!h.stored().items[0].topics);assert.equal(h.stored().version,7);assert.equal(C.calculate(h.stored(),courses).allocated,5);
  await h.U.undoCourse(cleared);assert.deepEqual(h.stored().items[0].topics.map(x=>x.id),[first.id,second.id]);
  const practical=courseTopics.entries.find(x=>x.module==='IN2106');await h.U.setCourseTopics('IN2106',[practical.id],{semester:1});assert.equal(h.stored().items.length,2);assert.equal(C.calculate(h.stored(),courses).allocated,15);
 });
 await test('Candidate changes preserve passed results and locks, and stale selections or undo cannot overwrite newer sets',async()=>{
  const [first,second]=courseTopics.entries.filter(x=>x.module==='IN2107');
  const initial={...draft(),version:6,items:[{code:'IN2107',status:'passed',semester:7,locked:true,topic:C.validateTopic(first,'IN2107')}]},h=harness(initial);
  const change=await h.U.setCourseTopics('IN2107',[first.id,second.id],{semester:1}),record=h.stored().items[0];
  assert.equal(record.status,'passed');assert.equal(record.semester,7);assert(record.locked);assert.equal(record.topics.length,2);assert.equal(C.calculate(h.stored(),courses,true).allocated,5);
  await assert.rejects(()=>h.U.setCourseTopics('IN2107',[first.id],{expectedTopics:[C.validateTopic(first,'IN2107')]}),/其他页面/);
  await h.U.setCourseTopics('IN2107',[]);await assert.rejects(()=>h.U.undoCourse(change),/其他调整/);
  for(const ids of [[first.id,first.id],null,['unknown']])await assert.rejects(()=>h.U.setCourseTopics('IN2107',ids),/重复|无效|不属于/);
  await assert.rejects(()=>h.U.setCourseTopics('IN2106',[first.id]),/不属于/);await assert.rejects(()=>h.U.setCourseTopics('IN2064',[first.id]),/不支持/);
 });
 await test('Historical candidates can survive later edits and be removed without accepting unknown snapshots',async()=>{
  const first=courseTopics.entries.find(x=>x.module==='IN2107'),old={...C.validateTopic(first,'IN2107'),id:'IN2107-2025W-123456abcdef',term:'2025W',title:'往期候选'},h=harness({...draft(),items:[{code:'IN2107',status:'planned',semester:1,topics:[old]}]});
  await h.U.setCourseTopics('IN2107',[old.id,first.id]);assert.deepEqual(h.stored().items[0].topics[0],old);assert.equal(h.stored().items[0].topics.length,2);
  await h.U.setCourseTopics('IN2107',[first.id]);assert.equal(h.stored().items[0].topics.length,1);await assert.rejects(()=>h.U.setCourseTopics('IN2107',[old.id,first.id]),/不在当前目录/);
 });
 await test('Cancelled entry setup and unavailable storage never silently persist candidate selection',async()=>{
  const entry=courseTopics.entries.find(x=>x.module==='IN2107'),h=harness({...draft(),cohort:'unknown',items:[]});
  const pending=h.U.setCourseTopics('IN2107',[entry.id],{semester:1}),prompt=await h.nextPrompt();prompt.close();assert.equal((await pending).kind,'cancelled');assert.equal(h.writes(),0);assert.equal(h.stored().items.length,0);
  const blocked=harness({...draft(),items:[{code:'IN2107',status:'planned',semester:2}]});blocked.control.quota=true;
  await blocked.U.setCourseTopics('IN2107',[entry.id]);assert.equal(blocked.U.persisted,false);assert(!blocked.stored().items[0].topics);assert.equal((await blocked.U.plan()).items[0].topics[0].id,entry.id);
 });
 await test('An open candidate manager cannot save against a changed semester, status, lock or candidate set',async()=>{
  const [entry,other]=courseTopics.entries.filter(x=>x.module==='IN2107');
  for(const patch of [{semester:3},{status:'passed'},{locked:true},{topics:[C.validateTopic(other,'IN2107')]}]){
   const h=harness({...draft(),items:[{code:'IN2107',status:'planned',semester:2}]}),expectedItem=(await h.U.plan()).items[0],latest={...await h.U.plan(),items:[{...expectedItem,...patch}]};h.externalPlan(latest);
   await assert.rejects(()=>h.U.setCourseTopics('IN2107',[entry.id],{semester:2,expectedItem}),/其他页面调整/);assert.equal(h.writes(),0);assert.deepEqual(h.stored(),latest);
  }
 });
 await test('First add waits for entry term, cancellation changes nothing, then summer resumes the original target',async()=>{
  const initial={...draft(),cohort:'unknown',items:[]},h=harness(initial);
  let pending=h.U.addCourse('IN2228',3),prompt=await h.nextPrompt();assert.equal(h.writes(),0);prompt.close();
  assert.equal((await pending).kind,'cancelled');assert.deepEqual(h.stored(),initial);
  pending=h.U.addCourse('IN2228',3);prompt=await h.nextPrompt();await prompt.submit('2027夏季');
  assert.equal((await pending).semester,3);assert.equal(h.stored().timeline.start,'summer');assert.equal(h.stored().cohort,'2027夏季');assert.equal(h.confirmations(),0);
  await h.U.addCourse('IN2064',2);assert.equal(h.prompts.length,2);assert.equal(h.confirmations(),0);
 });
 await test('After entry confirmation an incompatible course still requires seasonal confirmation',async()=>{
  const h=harness({...draft(),cohort:'unknown',items:[]});h.control.confirm=false;
  const pending=h.U.addCourse('IN2064',1),prompt=await h.nextPrompt();await prompt.submit('2027夏季');
  assert.equal((await pending).kind,'cancelled');assert.equal(h.stored().timeline.start,'summer');assert.equal(h.stored().items.length,0);assert.equal(h.confirmations(),1);
 });
 await test('Entry-term save preserves courses concurrently added elsewhere and refuses changed academic information',async()=>{
  const initial={...draft(),cohort:'unknown'},h=harness(initial),pending=h.U.ensureAcademicTerm(),prompt=await h.nextPrompt();
  const latest={...initial,items:[...initial.items,{code:'IN2228',status:'planned',semester:2}]};h.externalPlan(latest);
  await prompt.submit('2026/27冬季');assert.equal(await pending,true);assert.equal(h.stored().items.length,2);
  const other=harness(initial),blocked=other.U.ensureAcademicTerm(),active=await other.nextPrompt();other.externalPlan(draft());
  await active.submit('2027夏季');assert.equal(other.writes(),0);assert.match(active.querySelector('#academic-term-error').textContent,/其他页面/);active.close();assert.equal(await blocked,false);
 });
 await test('Concurrent requests share one entry prompt and desktop legacy placement waits for confirmation',async()=>{
  const initial={...draft(),cohort:'unknown',items:[{code:'IN2228',status:'planned',semester:0}]},h=harness(initial,true);
  await h.U.assignUnscheduled();assert.equal(h.writes(),0);assert.equal(h.prompts.length,0);
  const first=h.U.ensureAcademicTerm(),second=h.U.moveCourse(' in2228 ',0),prompt=await h.nextPrompt();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(h.prompts.length,1);await prompt.submit('2027夏季');
  assert.equal(await first,true);assert.equal((await second).semester,1);assert.equal(h.stored().timeline.start,'summer');assert.equal(h.confirmations(),0);
 });
 await test('An existing entry time can be corrected repeatedly without changing course records or planning conditions',async()=>{
  const initial=C.validatePlan({...draft(),conditional:true,conditionalConfirmed:true,items:[{code:'IN2064',status:'planned',semester:1,locked:true},{code:'IN2228',status:'passed',semester:2}]},courses),h=harness(initial);
  let pending=h.U.editAcademicTerm(),prompt=await h.nextPrompt();
  assert(prompt.innerHTML.includes('修改入学时间'));assert.equal(prompt.querySelector('#academic-term-cohort').value,initial.cohort);assert(prompt.querySelector('#academic-term-preview').innerHTML.includes('第 1 学期</small><strong>冬季'));assert.equal(h.writes(),0);
  await prompt.submit('2027夏季');assert.equal(await pending,true);assert.deepEqual(h.stored(),{...initial,cohort:'2027夏季',timeline:{...initial.timeline,start:'summer'}});
  assert.equal(C.planSemesterLabel(await h.U.plan(),1),'第 1 学期 · 夏季');
  pending=h.U.editAcademicTerm();prompt=await h.nextPrompt();assert.equal(prompt.querySelector('#academic-term-cohort').value,'2027夏季');await prompt.submit('2026/27冬季');assert.equal(await pending,true);assert.deepEqual(h.stored(),initial);
  pending=h.U.editAcademicTerm();prompt=await h.nextPrompt();prompt.querySelector('#academic-term-cohort').value='2027夏季';prompt.close();assert.equal(await pending,false);assert.deepEqual(h.stored(),initial);assert.equal(h.writes(),2);
 });
 await test('Editing entry time preserves concurrent course updates and refuses competing entry-time changes',async()=>{
  const initial=draft(),h=harness(initial),pending=h.U.editAcademicTerm(),prompt=await h.nextPrompt(),latest={...initial,items:[...initial.items,{code:'IN2228',status:'passed',semester:2}]};
  h.externalPlan(latest);await prompt.submit('2027夏季');assert.equal(await pending,true);assert.deepEqual(h.stored().items,C.validatePlan(latest,courses).items);
  const other=harness(initial),blocked=other.U.editAcademicTerm(),active=await other.nextPrompt(),newer={...initial,cohort:'2025/26冬季'};other.externalPlan(newer);
  await active.submit('2027夏季');assert.equal(other.writes(),0);assert.deepEqual(other.stored(),newer);assert.match(active.querySelector('#academic-term-error').textContent,/其他页面/);active.close();assert.equal(await blocked,false);
 });
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
 await test('Reordering persists without changing course records and unchanged drop positions never write',async()=>{
  const initial={...draft(),items:['IN2064','IN2228','IN2406'].map(code=>({code,status:'planned',semester:1}))},h=harness(initial,true),before=JSON.parse(JSON.stringify(await h.U.plan()));
  const change=await h.U.reorderCourse('in2406',1,{relativeTo:'IN2064',placement:'before'});assert.equal(change.kind,'reordered');
  assert.deepEqual(h.stored().items,before.items);assert.deepEqual(C.calculate(h.stored(),courses),C.calculate(before,courses));
  assert.deepEqual(Array.from(C.semesterItems(await harness(h.stored(),true).U.plan(),1,true),x=>x.code),['IN2406','IN2064','IN2228']);
  const writes=h.writes();assert.equal((await h.U.reorderCourse('IN2406',1,{relativeTo:'IN2064',placement:'before'})).kind,'unchanged');assert.equal((await h.U.reorderCourse('IN2406',1,{relativeTo:'IN2406'})).kind,'unchanged');assert.equal(h.writes(),writes);
  await assert.rejects(h.U.reorderCourse('IN2406',2,{relativeTo:'IN2064'}),/变化/);await assert.rejects(h.U.reorderCourse('IN2406',1,{relativeTo:'IN2320'}),/变化/);assert.equal(h.writes(),writes);
 });
 await test('Narrow-screen sorting preserves hidden passed positions and safe undo preserves other edits',async()=>{
  const initial={...draft(),items:[{code:'IN2064',status:'planned',semester:1},{code:'IN2228',status:'passed',semester:1},{code:'IN2406',status:'planned',semester:1}]},h=harness(initial);
  const change=await h.U.reorderCourse('IN2406',1,{relativeTo:'IN2064',placement:'before'});assert.deepEqual(C.semesterItems(h.stored(),1,true).map(x=>x.code),['IN2406','IN2228','IN2064']);
  const edited=h.stored();edited.items[0].locked=true;h.externalPlan(edited);await h.U.undoCourseOrder(change);
  assert.deepEqual(C.semesterItems(h.stored(),1,true).map(x=>x.code),['IN2064','IN2228','IN2406']);assert(h.stored().items[0].locked);
  const second=await h.U.reorderCourse('IN2406',1,{relativeTo:'IN2064',placement:'before'}),latest=h.stored();latest.items.push({code:'IN2107',status:'planned',semester:1});h.externalPlan(latest);
  await assert.rejects(h.U.undoCourseOrder(second),/后续调整/);assert.deepEqual(h.stored(),latest);
 });
 await test('A moved course is appended and undo restores a manually chosen source position',async()=>{
  const initial={...draft(),items:[...['IN2064','IN2228','IN2406'].map(code=>({code,status:'planned',semester:1})),{code:'IN2107',status:'planned',semester:2}],courseOrder:{1:['IN2228','IN2406','IN2064']}},h=harness(initial,true);
  const change=await h.U.moveCourse('IN2228',2);assert.deepEqual(C.semesterItems(h.stored(),2,true).map(x=>x.code),['IN2107','IN2228']);
  await h.U.undoCourse(change);assert.deepEqual(C.semesterItems(h.stored(),1,true).map(x=>x.code),initial.courseOrder[1]);assert.deepEqual(C.semesterItems(h.stored(),2,true).map(x=>x.code),['IN2107']);
  const partial=harness({...initial,courseOrder:{1:['IN2228']}},true),before=C.semesterItems(await partial.U.plan(),1,true).map(x=>x.code),moved=await partial.U.moveCourse('IN2406',2);
  await partial.U.undoCourse(moved);assert.deepEqual(C.semesterItems(partial.stored(),1,true).map(x=>x.code),Array.from(before));
 });
 await test('An unsaved reorder remains available in the session without changing persisted data',async()=>{
  const initial={...draft(),items:['IN2064','IN2228'].map(code=>({code,status:'planned',semester:1}))},h=harness(initial,true);h.control.quota=true;
  await h.U.reorderCourse('IN2228',1,{relativeTo:'IN2064',placement:'before'});assert.equal(h.U.persisted,false);assert.deepEqual(h.stored(),initial);assert.deepEqual(Array.from(C.semesterItems(await h.U.plan(),1,true),x=>x.code),['IN2228','IN2064']);
 });
 console.log(`${tests} plan interaction checks passed`);
})().catch(err=>{console.error(err);process.exitCode=1;});
