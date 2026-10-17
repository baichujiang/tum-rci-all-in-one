/* Exercise loss prevention, old-file compatibility and the production state API. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../assets/core'),B=require('../site3/backup-core');
const courses=C.csv(fs.readFileSync(path.join(__dirname,'../data/courses_legal_2025.csv'),'utf8'));
const draft=()=>({version:2,cohort:'2026/27冬季',conditional:false,timeline:{count:4,start:'winter'},items:[{code:'IN2064',status:'passed',semester:3}]});
const local=()=>({plan:draft(),favorites:['R010','guide:thesis','OLD-FAVORITE']});
const plain=x=>JSON.parse(JSON.stringify(x));
function memory(initial={}){
 const values=new Map(Object.entries(initial));let fail=()=>false;
 const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(fail(k,v))throw Error('quota');values.set(k,String(v));},removeItem(k){if(fail(k,null))throw Error('blocked');values.delete(k);}};
 return {storage,values,fail:fn=>{fail=fn;}};
}
const initial=()=>({[B.keys.plan]:' '+JSON.stringify(draft()),[B.keys.favorites]:JSON.stringify(local().favorites)});
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name);}
const appSource=fs.readFileSync(path.join(__dirname,'../site3/app.js'),'utf8').split('// A small website directory')[0]+'})();';
function application(mem,locks,manualConfirmation=false,noLock=false,lockOverride=null){
 const prompts=[],events=[],toast={replaceChildren(){},append(){},contains(){return false;}};
 const dialog=manualConfirmation?{open:false,showModal(){this.open=true;},addEventListener(type,fn){this.onClose=fn;},answer(value){this.returnValue=value;this.open=false;this.onClose();}}:null;
 const dialogText={};
 function createElement(tag){
  const node={handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(){},focus(){}};if(tag!=='dialog')return node;
  const fields=Object.fromEntries(['form','#academic-term-cohort','#academic-term-error','#academic-term-save','#academic-term-preview'].map(key=>[key,createElement('input')]));
  node.querySelector=key=>fields[key];node.querySelectorAll=()=>[];node.remove=()=>{};
  node.showModal=()=>{node.open=true;prompts.push(node);};node.close=()=>{node.open=false;node.handlers.close();};
  node.submit=async cohort=>{fields['#academic-term-cohort'].value=cohort;fields['#academic-term-cohort'].handlers.change();await fields.form.handlers.submit({preventDefault(){}});};
  return node;
 }

 const window={RCILocalLock:lockOverride|| (noLock?{create:()=>require('../site3/local-lock').create()}:require('../site3/local-lock')),RCI:C,RCIBackup:B,confirm(){return true;},addEventListener(){},dispatchEvent(e){events.push(e.type);}};
 const context={window,URLSearchParams,location:{search:''},navigator:{locks:locks||{request:(_name,work)=>work()}},
  document:{body:{append(){}},querySelector(s){if(s==='meta[name="rci-base"]')return {content:''};if(s==='#toast')return toast;if(s==='#action-dialog')return dialog;if(dialog&&['#dialog-title','#dialog-description','#dialog-confirm'].includes(s))return dialogText[s]||={};return null;},querySelectorAll(){return [];},createElement},
  localStorage:mem.storage,fetch:async url=>{assert.equal(url,'/assets/planner-data.json');return {ok:true,json:async()=>({courses,names:{}})};},Event:function(type){this.type=type;},setTimeout(){return 0;},clearTimeout(){}};
 vm.runInNewContext(appSource,context,{filename:'site3/app.js'});return {U:window.RCIUI,events,dialog,nextPrompt:async()=>{for(let i=0;i<8&&!prompts.at(-1)?.open;i++)await new Promise(resolve=>setImmediate(resolve));assert(prompts.at(-1)?.open,'Expected entry-term prompt');return prompts.at(-1);}};
}
(async()=>{
 await test('A lost storage lock cannot later publish temporary records over another page',async()=>{
  let runs=0;
  const lockOverride={create:()=>({run(work){const run=++runs;return work(()=>{if(run===2)throw Object.assign(new Error('lock lost'),{lockLost:true});});}})};
  const mem=memory(initial()),h=application(mem,undefined,false,false,lockOverride);
  await h.U.addCourse('IN2320',4);assert.equal(h.U.persisted,false);
  const latest={...draft(),items:[...draft().items,{code:'IN2106',status:'planned',semester:2}]};
  mem.storage.setItem(B.keys.plan,JSON.stringify(latest));const before=B.capture(mem.storage);
  await h.U.addCourse('IN2107',1);assert.deepEqual(B.capture(mem.storage),before);assert.equal(h.U.backupPersisted,false);
  const snapshot=await h.U.backupSnapshot();assert(snapshot.data.plan.items.some(x=>x.code==='IN2320'));assert(snapshot.data.plan.items.some(x=>x.code==='IN2107'));
 });
 await test('Without either safe lock, editing stays exportable in memory and never writes existing records',async()=>{
  const mem=memory(initial()),before=B.capture(mem.storage),h=application(mem,undefined,false,true);
  await h.U.addCourse('IN2320',4);const snapshot=await h.U.backupSnapshot();
  assert(snapshot.data.plan.items.some(x=>x.code==='IN2320'));assert(snapshot.data.plan.items.some(x=>x.code==='IN2064'));
  assert.deepEqual(plain(snapshot.data.favorites),local().favorites);assert.equal(h.U.backupPersisted,false);assert.deepEqual(B.capture(mem.storage),before);
  await assert.rejects(h.U.importBackup({plan:draft(),favorites:[]},'replace',snapshot),/持久|导出/);assert.deepEqual(B.capture(mem.storage),before);
 });
 await test('Losing storage access after a successful read preserves observed courses and favorites in the session backup',async()=>{
  const mem=memory(initial()),h=application(mem);await h.U.plan();
  const observed={plan:{...draft(),items:[...draft().items,{code:'IN2107',status:'planned',semester:1}]},favorites:['R031','R055','OLD-FAVORITE']};
  mem.storage.setItem(B.keys.plan,JSON.stringify(observed.plan));mem.storage.setItem(B.keys.favorites,JSON.stringify(observed.favorites));await h.U.backupSnapshot();const before=B.capture(mem.storage);
  mem.storage.getItem=()=>{throw Error('Storage access revoked');};mem.storage.setItem=()=>{throw Error('Storage access revoked');};
  await h.U.addCourse('IN2320',4);const snapshot=await h.U.backupSnapshot();
  assert.deepEqual(plain(snapshot.data.plan.items).map(item=>item.code),['IN2064','IN2107','IN2320']);assert.deepEqual(plain(snapshot.data.favorites),observed.favorites);
  assert.equal(h.U.backupPersisted,false);assert.equal(mem.values.get(B.keys.plan),before.plan);assert.equal(mem.values.get(B.keys.favorites),before.favorites);
 });
 await test('Blocked storage still allows a session-only plan and an exportable in-memory backup',async()=>{
  const mem=memory(initial()),original=mem.values.get(B.keys.plan),get=mem.storage.getItem,set=mem.storage.setItem;
  mem.storage.getItem=()=>{throw Error('Storage access blocked');};mem.storage.setItem=()=>{throw Error('Storage access blocked');};
  const h=application(mem),addition=h.U.addCourse('IN2320',4),prompt=await h.nextPrompt();await prompt.submit('2026/27冬季');await addition;
  assert.equal(h.U.persisted,false);assert.equal(h.U.backupPersisted,false);assert.equal((await h.U.plan()).items[0].code,'IN2320');
  assert.equal((await h.U.backupSnapshot()).data.plan.items[0].code,'IN2320');assert.equal(mem.values.get(B.keys.plan),original);
  mem.storage.getItem=get;mem.storage.setItem=set;await h.U.addCourse('IN2107',1);
  assert.equal(h.U.persisted,false);assert.equal(mem.values.get(B.keys.plan),original);
  await assert.rejects(h.U.importBackup({plan:draft(),favorites:[]},'replace',await h.U.backupSnapshot()),/导出/);
  assert.equal(mem.values.get(B.keys.plan),original);
 });
 await test('An already-open page cannot edit or export mixed records from an interrupted import',async()=>{
  const mem=memory(initial()),h=application(mem),original=B.capture(mem.storage);
  mem.storage.setItem(B.keys.journal,JSON.stringify({version:1,before:original}));
  mem.storage.setItem(B.keys.plan,JSON.stringify({...draft(),items:[]}));const mixed=B.capture(mem.storage);
  await assert.rejects(h.U.addCourse('IN2320',4),/恢复/);
  await assert.rejects(h.U.backupSnapshot(),/恢复/);
  assert.deepEqual(B.capture(mem.storage),mixed);assert.equal(h.U.rawBackup().records.plan,mixed.plan);
 });
 await test('A pending recovery marker created during confirmation prevents the later save',async()=>{
  const mem=memory(initial()),h=application(mem,undefined,true),before=B.capture(mem.storage),move=h.U.addCourse('IN2067',2);
  await new Promise(resolve=>setImmediate(resolve));assert(h.dialog.open);
  mem.storage.setItem(B.keys.journal,JSON.stringify({version:1,before}));h.dialog.answer('confirm');
  await assert.rejects(move,/恢复/);assert.deepEqual(B.capture(mem.storage),before);assert(B.pending(mem.storage));
 });
 await test('A malformed saved plan cannot be silently replaced by adding a course',async()=>{
  const mem=memory({...initial(),[B.keys.plan]:'{"version":2,broken'}),h=application(mem),before=B.capture(mem.storage);
  await assert.rejects(h.U.addCourse('IN2320',4),/原始|读取/);assert.deepEqual(B.capture(mem.storage),before);
 });
 await test('A page waiting for confirmation does not block another page’s backup preview',async()=>{
  let queue=Promise.resolve();const locks={request(name,fn){assert.equal(name,'rci:local-data');const task=queue.then(fn);queue=task.catch(()=>{});return task;}};
  const mem=memory(initial()),first=application(mem,locks,true),second=application(mem,locks);
  const move=first.U.addCourse('IN2067',2);await new Promise(resolve=>setImmediate(resolve));assert(first.dialog.open);
  let ready=false;const preview=second.U.backupSnapshot().then(value=>{ready=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));const wasReady=ready;
  first.dialog.answer('cancel');await move;await preview;
  assert.equal(wasReady,true,'Waiting for a dialog must release the shared storage lock');
 });
 await test('Another page may add a course during confirmation without being overwritten',async()=>{
  let queue=Promise.resolve();const locks={request(name,fn){const task=queue.then(fn);queue=task.catch(()=>{});return task;}};
  const mem=memory(initial()),first=application(mem,locks,true),second=application(mem,locks);
  const move=first.U.addCourse('IN2067',2);await new Promise(resolve=>setImmediate(resolve));assert(first.dialog.open);
  let added=false;const addition=second.U.addCourse('IN2320',4).then(value=>{added=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));const wasAdded=added;
  first.dialog.answer('confirm');const error=await move.then(()=>null,error=>error);await addition;
  assert.equal(wasAdded,true);assert.match(error?.message||'',/其他页面/);
  const stored=JSON.parse(mem.storage.getItem(B.keys.plan));assert(stored.items.some(item=>item.code==='IN2320'));assert.equal(stored.items.find(item=>item.code==='IN2064').semester,3);
 });
 await test('Full backup preserves semesters, passed states, custom credits and unknown favorite IDs',()=>{
  const value=local();value.plan.items.push({code:'OWN1',name:'自己的选修',group:'G',ects:5.5,custom:true,status:'planned',semester:4});
  const parsed=B.parse('\uFEFF'+JSON.stringify(B.create(value,courses)),courses);
  assert.deepEqual(parsed.plan,C.validatePlan(value.plan,courses));assert.deepEqual(parsed.favorites,value.favorites);
 });
 await test('Old plan files keep passed and custom records, default missing semesters and leave favorites alone',()=>{
  const old=draft();delete old.timeline;old.items=[{code:'IN2064',status:'passed'},{code:'OLD1',name:'旧选修',custom:true,group:'H',ects:6,status:'planned'}];
  const incoming=B.parse(JSON.stringify(old),courses),result=B.prepare(local(),incoming,'replace',courses);
  assert.equal(incoming.legacy,true);assert(incoming.plan.items.every(x=>x.semester===0));assert.equal(incoming.plan.items[1].ects,6);assert.deepEqual(result.favorites,local().favorites);
 });
 await test('Exports with the largest supported favorite list remain importable',()=>{
  const value={...local(),favorites:Array.from({length:2000},(_,i)=>String(i).padStart(4,'0')+'汉'.repeat(156))};
  const text=JSON.stringify(B.create(value,courses),null,2);assert.deepEqual(B.parse(text,courses).favorites,value.favorites);
 });
 await test('Invalid, incomplete, future-format and oversized imports are rejected',()=>{
  for(const raw of ['not json',JSON.stringify({type:'tum-rci-backup',version:2,data:local()}),JSON.stringify({type:'tum-rci-backup',version:1,data:{plan:draft()}}),JSON.stringify({type:'tum-rci-backup',version:1,data:{plan:draft(),favorites:[{}]}})])assert.throws(()=>B.parse(raw,courses));
  assert.throws(()=>B.parse('汉'.repeat(Math.ceil(B.maxBytes/3)),courses),/太大/);
 });
 await test('Merge preserves existing arrangements, extends matching timelines and deduplicates favorites',()=>{
  const incoming={plan:{...draft(),timeline:{count:6,start:'winter'},items:[{code:'IN2064',status:'planned',semester:1},{code:'IN2320',status:'planned',semester:6}]},favorites:['R010','R140']};
  const merged=B.prepare(local(),incoming,'merge',courses);
  assert.equal(merged.plan.items[0].status,'passed');assert.equal(merged.plan.items[0].semester,3);assert.equal(merged.plan.timeline.count,6);assert.equal(merged.plan.items[1].semester,6);assert.deepEqual(merged.favorites,[...local().favorites,'R140']);
 });
 await test('Different starting seasons move new courses to unassigned and preserve local settings',()=>{
  const incoming={plan:{...draft(),timeline:{count:5,start:'summer'},items:[{code:'IN2320',status:'passed',semester:5}]},favorites:[]};
  const merged=B.prepare(local(),incoming,'merge',courses);assert.deepEqual(merged.plan.timeline,draft().timeline);assert.equal(merged.plan.items[1].semester,0);assert(merged.notes.some(x=>x.includes('待分配')));
 });
 await test('Exclusive robotics choices retain the local choice and explain the skipped alternative',()=>{
  const here={...local(),plan:{...draft(),items:[{code:'IN2067',status:'planned',semester:1}]}},incoming={plan:{...draft(),items:[{code:'ED160028',status:'planned',semester:2}]},favorites:[]};
  const merged=B.prepare(here,incoming,'merge',courses);assert.equal(merged.plan.items.length,1);assert.equal(merged.plan.items[0].code,'IN2067');assert(merged.notes[0].includes('ED160028'));
 });
 await test('Replacing data keeps a recoverable backup and limits history to three imports',()=>{
  const mem=memory(initial()),before=B.capture(mem.storage),next={plan:{...draft(),items:[]},favorites:[]};
  B.commit(mem.storage,next,{expected:before,beforeBackup:B.create(local(),courses)});
  assert.deepEqual(JSON.parse(mem.storage.getItem(B.keys.plan)),next.plan);assert.deepEqual(B.history(mem.storage)[0].data,B.state(local(),courses));assert.equal(mem.storage.getItem(B.keys.journal),null);
  for(let i=0;i<4;i++)B.commit(mem.storage,next,{expected:B.capture(mem.storage),beforeBackup:B.create(next,courses)});assert.equal(B.history(mem.storage).length,3);
 });
 await test('Failure before the recovery backup does not touch current plan or favorites',()=>{
  const mem=memory(initial()),before=B.capture(mem.storage);mem.fail(k=>k===B.keys.journal);
  assert.throws(()=>B.commit(mem.storage,{plan:draft(),favorites:[]},{expected:before,beforeBackup:B.create(local(),courses)}),/未修改/);assert.deepEqual(B.capture(mem.storage),before);
 });
 await test('A failed favorites write rolls back exact original bytes and absent history',()=>{
  const mem=memory(initial()),before=B.capture(mem.storage);let once=true;mem.fail(k=>{if(k===B.keys.favorites&&once){once=false;return true;}return false;});
  assert.throws(()=>B.commit(mem.storage,{plan:{...draft(),items:[]},favorites:[]},{expected:before,beforeBackup:B.create(local(),courses)}),/已恢复/);assert.deepEqual(B.capture(mem.storage),before);assert.equal(mem.storage.getItem(B.keys.journal),null);
 });
 await test('Interrupted imports recover original raw records, including missing storage keys',()=>{
  for(const old of [initial(),{}]){const mem=memory(old),before=B.capture(mem.storage);mem.storage.setItem(B.keys.journal,JSON.stringify({version:1,before}));mem.storage.setItem(B.keys.plan,JSON.stringify({broken:true}));mem.storage.setItem(B.keys.history,'[]');assert.equal(B.recover(mem.storage),true);assert.deepEqual(B.capture(mem.storage),before);assert.equal(mem.storage.getItem(B.keys.journal),null);}
 });
 await test('Rollback failure retains the journal and recovers when storage becomes writable',()=>{
  const mem=memory(initial()),before=B.capture(mem.storage);mem.fail(k=>k===B.keys.favorites);
  assert.throws(()=>B.commit(mem.storage,{plan:{...draft(),items:[]},favorites:[]},{expected:before,beforeBackup:B.create(local(),courses)}),/原始记录/);assert(B.pending(mem.storage));mem.fail(()=>false);B.recover(mem.storage);assert.deepEqual(B.capture(mem.storage),before);
 });
 await test('A stale preview cannot overwrite changes made on another page',()=>{
  const mem=memory(initial()),before=B.capture(mem.storage);mem.storage.setItem(B.keys.favorites,JSON.stringify(['R128']));const latest=B.capture(mem.storage);
  assert.throws(()=>B.commit(mem.storage,local(),{expected:before,beforeBackup:B.create(local(),courses)}),/其他页面/);assert.deepEqual(B.capture(mem.storage),latest);
 });
 await test('A change after the initial capture cannot be overwritten while reading backup history',()=>{
  const mem=memory(initial()),before=B.capture(mem.storage),get=mem.storage.getItem,other={plan:{...draft(),items:[{code:'IN2320',status:'planned',semester:4}]},favorites:['R140']};let historyReads=0,latest;
  mem.storage.getItem=k=>{
   if(k===B.keys.history&&++historyReads===2){B.commit(mem.storage,other,{beforeBackup:B.create(local(),courses)});latest=B.capture(mem.storage);}
   return get(k);
  };
  assert.throws(()=>B.commit(mem.storage,local(),{expected:before,beforeBackup:B.create(local(),courses)}),/其他页面/);
  assert.deepEqual(B.capture(mem.storage),latest);assert.equal(mem.storage.getItem(B.keys.journal),null);
 });
 await test('A recovery marker appearing after the initial capture is never overwritten',()=>{
  const mem=memory(initial()),before=B.capture(mem.storage),get=mem.storage.getItem;let historyReads=0;
  mem.storage.getItem=k=>{if(k===B.keys.history&&++historyReads===2)mem.storage.setItem(B.keys.journal,JSON.stringify({version:1,before}));return get(k);};
  assert.throws(()=>B.commit(mem.storage,local(),{expected:before,beforeBackup:B.create(local(),courses)}),/恢复/);
  assert.deepEqual(B.capture(mem.storage),before);assert.deepEqual(B.pending(mem.storage).before,before);
 });
 await test('Production API imports plan and favorites together, refreshes both surfaces and restores history',async()=>{
  const mem=memory(initial()),h=application(mem),snapshot=await h.U.backupSnapshot(),incoming={plan:{...draft(),items:[{code:'IN2320',status:'planned',semester:4}]},favorites:['R140'],legacy:false};
  await h.U.importBackup(incoming,'replace',snapshot);assert.equal((await h.U.plan()).items[0].code,'IN2320');assert.deepEqual(JSON.parse(mem.storage.getItem(B.keys.favorites)),['R140']);assert(h.events.includes('rci:planchange'));assert(h.events.includes('rci:saveschange'));
  const restore=B.parse(JSON.stringify(h.U.getBackupHistory()[0]),courses);await h.U.importBackup(restore,'replace',await h.U.backupSnapshot());assert.deepEqual(plain((await h.U.backupSnapshot()).data),B.state(local(),courses));
 });
 await test('Invalid imports and changed production previews never replace local records',async()=>{
  const mem=memory(initial()),h=application(mem),snapshot=await h.U.backupSnapshot(),before=B.capture(mem.storage);
  await assert.rejects(h.U.importBackup({plan:{version:99},favorites:[]},'replace',snapshot));assert.deepEqual(B.capture(mem.storage),before);
  await h.U.updatePlan(p=>({...p,conditional:!p.conditional}));const newer=B.capture(mem.storage);await assert.rejects(h.U.importBackup({plan:draft(),favorites:[]},'replace',snapshot),/已更新/);assert.deepEqual(B.capture(mem.storage),newer);
 });
 await test('Unreadable existing local records remain intact and can be exported as raw recovery data',async()=>{
  const mem=memory({...initial(),[B.keys.plan]:'{damaged original record','rci:v2:checklist':'{damaged checklist'}),h=application(mem),before=B.capture(mem.storage);
  await assert.rejects(h.U.backupSnapshot(),/原始记录/);
  await assert.rejects(h.U.importBackup({plan:draft(),favorites:[]},'replace'),/原始记录/);
  assert.deepEqual(B.capture(mem.storage),before);assert.equal(h.U.rawBackup().records.plan,before.plan);
  assert.equal(h.U.rawBackup().records.checklist,'{damaged checklist');
 });
 await test('Cross-page locks make a queued plan edit use the latest imported plan',async()=>{
  let queue=Promise.resolve();const locks={request(name,fn){assert.equal(name,'rci:local-data');const task=queue.then(fn);queue=task.catch(()=>{});return task;}};
  const mem=memory(initial()),first=application(mem,locks),second=application(mem,locks),snapshot=await first.U.backupSnapshot();
  await second.U.plan();await first.U.importBackup({plan:{...draft(),items:[...draft().items,{code:'IN2320',status:'planned',semester:4}]},favorites:['R140']},'replace',snapshot);
  await second.U.updatePlan(p=>({...p,conditional:!p.conditional}));assert.equal(JSON.parse(mem.storage.getItem(B.keys.plan)).items.length,2);assert.equal(JSON.parse(mem.storage.getItem(B.keys.favorites))[0],'R140');
 });
 await test('Backup replacement keeps display order and merging appends imported courses in their saved order',()=>{
  const here={...draft(),items:['IN2064','IN2107'].map(code=>({code,status:'planned',semester:1})),courseOrder:{1:['IN2107','IN2064']}},incoming={...draft(),items:['IN2064','IN2228','IN2406'].map(code=>({code,status:'planned',semester:1})),courseOrder:{1:['IN2406','IN2064','IN2228']}};
  const parsed=B.parse(JSON.stringify(B.create({plan:incoming,favorites:[]},courses)),courses),replaced=B.prepare({plan:here,favorites:[]},parsed,'replace',courses),merged=B.prepare({plan:here,favorites:[]},parsed,'merge',courses);
  assert.deepEqual(replaced.plan.courseOrder,incoming.courseOrder);assert.deepEqual(C.semesterItems(merged.plan,1,true).map(x=>x.code),['IN2107','IN2064','IN2406','IN2228']);
  assert.deepEqual(merged.plan.items.map(x=>x.code),['IN2064','IN2107','IN2228','IN2406']);
 });
 console.log(count+' backup checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
