/* Exercise production multi-candidate drafts, filtering and safe save boundaries. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../assets/core'),S=require('../site3/search');
const courses=require('../scripts/load-courses')(),catalog=require('../data/course-topics.json');
const source=fs.readFileSync(require.resolve('../site3/course-topics'),'utf8'),copy=x=>JSON.parse(JSON.stringify(x));
const seminar=catalog.entries.filter(x=>x.module==='IN2107'),snap=t=>C.validateTopic(t,t.module),tick=()=>new Promise(resolve=>setImmediate(resolve));
function element(){return {textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,checked:false,open:false,isConnected:true,handlers:{},attrs:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;}};}
function harness(items=[],{desktop=true,data=catalog,cohort='2026/27冬季'}={}){
 let p=C.validatePlan({version:5,cohort,conditional:false,conditionalConfirmed:true,items},courses),writes=0,fail=false,cancel=false,readFail=false,release=null;
 const fields=Object.fromEntries(['form','#topic-picker-title','#topic-picker-context','[data-topic-search]','[data-topic-term]','[data-topic-term-label]','[data-topic-source-term]','[data-topic-source-note]','[data-topic-source-link]','[data-topic-count]','[data-topic-results]','[data-topic-empty]','[data-topic-selected-only]','[data-topic-selected-count]','[data-topic-clear]','[data-topic-error]','[data-topic-save]','details'].map(key=>[key,element()]));
 const cancelButtons=[element(),element()],dialog=element(),opener=element(),replacement=element(),main=element(),calls=[],toasts=[],events={};
 dialog.querySelector=key=>fields[key];dialog.querySelectorAll=()=>cancelButtons;
 dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.handlers.close();};
 const U={base:'',persisted:true,data:async()=>{if(readFail)throw Error('读取失败');return {courses,courseTopics:data};},plan:async()=>copy(p),toast:(message,action)=>toasts.push({message,action}),setCourseTopics:async(code,ids,options)=>{
  calls.push({code,ids:[...ids],options:copy(options)});if(release)await new Promise(resolve=>release.resolve=resolve);if(fail)throw Error('保存失败，可重试');if(cancel)return {kind:'cancelled'};
  const previous=p.items.find(x=>x.code===code)||null;
  if(JSON.stringify(previous)!==JSON.stringify(options.expectedItem))throw Error('模块或课题已在其他页面调整');
  if(p.cohort==='unknown')p={...p,cohort:'2026/27冬季',timeline:{...p.timeline,start:'winter'}};
  const applied=previous?copy(previous):{code,status:'planned',semester:options.semester,locked:false};
  delete applied.topic;if(ids.length)applied.topics=ids.map(id=>snap(catalog.entries.find(t=>t.id===id)||{...C.itemTopics(previous).find(t=>t.id===id),module:code}));else delete applied.topics;
  p=C.validatePlan({...p,items:[...p.items.filter(x=>x.code!==code),applied]},courses);writes++;
  return {kind:previous?'topics':'added',code,semester:applied.semester,previous,applied};
 },undoCourse:async change=>{p=C.validatePlan({...p,items:[...p.items.filter(x=>x.code!==change.code),...(change.previous?[change.previous]:[])]},courses);writes++;}};
 const env={RCI:C,RCISearch:S,RCIUI:U,matchMedia:()=>({matches:desktop}),addEventListener:(type,fn)=>events[type]=fn,document:{createElement:tag=>tag==='dialog'?dialog:element(),body:{append(){}},querySelectorAll:()=>[],querySelector:()=>replacement,getElementById:()=>main,addEventListener(){}}};
 vm.runInNewContext(source,env);
 return {U,fields,dialog,opener,replacement,calls,toasts,plan:()=>copy(p),writes:()=>writes,open:async(code='IN2107',semester=2,initialTopicId=null)=>{await env.RCICourseTopics.open(code,{semester,opener,initialTopicId});},choose:(id,checked=true)=>dialog.handlers.change({target:{name:'course-topic-choice',value:id,checked}}),clear:()=>fields['[data-topic-clear]'].handlers.click(),only:()=>fields['[data-topic-selected-only]'].handlers.click(),search:value=>{fields['[data-topic-search]'].value=value;fields['[data-topic-search]'].handlers.input();},save:()=>fields.form.handlers.submit({preventDefault(){}}),cancel:()=>cancelButtons[1].handlers.click(),escape:()=>{let prevented=false;dialog.handlers.cancel({preventDefault(){prevented=true;}});if(!prevented)dialog.close();return prevented;},fail:value=>fail=value,cancelSetup:()=>cancel=true,failRead:()=>readFail=true,defer:()=>{release={};return release;},external:items=>{p=C.validatePlan({...p,items},courses);}};
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 await test('A detail page stages an additional candidate while preserving every saved candidate and the module semester',async()=>{
  const data={...catalog,detailPages:[seminar[2].id]},h=harness([{code:'IN2107',status:'planned',semester:3,topics:seminar.slice(0,2).map(snap)}],{data});await h.open('IN2107',2,seminar[2].id);
  assert(h.fields['[data-topic-results]'].innerHTML.includes('/courses/IN2107/topics/'+seminar[2].id+'/?semester=3'));assert(h.fields['[data-topic-results]'].innerHTML.includes('target="_blank"'));assert.equal(h.writes(),0);assert(h.fields['[data-topic-selected-count]'].textContent.includes('3 个候选'));await h.save();assert.equal(h.plan().items[0].semester,3);assert.equal(C.calculate(h.plan(),courses).allocated,5);assert.equal(h.plan().items[0].topics.length,3);
  const invalid=harness();await invalid.open('IN2106',1,seminar[0].id);assert(!invalid.dialog.open);assert.equal(invalid.writes(),0);assert(invalid.toasts.at(-1).message.includes('不属于'));
 });
 await test('Search retains independent checkbox drafts; opening, choosing, Enter and cancellation do not write',async()=>{
  const h=harness();await h.open();assert(h.dialog.open);assert(h.fields['#topic-picker-context'].textContent.includes('将加入第 2 学期'));assert(h.fields['[data-topic-term-label]'].hidden);assert.equal(h.fields['[data-topic-count]'].textContent,'74 个课题');assert(h.fields['[data-topic-save]'].disabled);
  h.choose(seminar[0].id);h.search('robot');assert(h.fields['[data-topic-results]'].innerHTML.includes('Robotics'));h.choose(seminar[1].id);h.search('');assert.equal((h.fields['[data-topic-results]'].innerHTML.match(/ checked/g)||[]).length,2);assert(h.fields['[data-topic-results]'].innerHTML.includes('type="checkbox"'));assert(!h.fields['[data-topic-results]'].innerHTML.includes('type="radio"'));assert.equal(h.writes(),0);
  let prevented=false;h.fields['[data-topic-search]'].handlers.keydown({key:'Enter',preventDefault(){prevented=true;}});assert(prevented);h.cancel();assert(!h.dialog.open);assert(h.opener.focused);await h.open();assert(h.fields['[data-topic-save]'].disabled);assert.equal(h.calls.length,0);
 });
 await test('A new module and multiple candidates save atomically, with an explicit destination and safe undo',async()=>{
  const h=harness([],{cohort:'unknown'});await h.open();h.choose(seminar[0].id);h.choose(seminar[1].id);assert.equal(h.fields['[data-topic-save]'].textContent,'加入第 2 学期');await h.save();
  assert(!h.dialog.open);assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.expectedItem,null);assert.equal(h.plan().items.length,1);assert.equal(h.plan().items[0].topics.length,2);assert.equal(h.plan().items[0].semester,2);assert.equal(C.calculate(h.plan(),courses).allocated,5);assert(h.toasts.at(-1).message.includes('2 个候选'));await h.toasts.at(-1).action.run();assert.equal(h.plan().items.length,0);
 });
 await test('Removing one and clearing all candidates retain passed status, historical semester, lock and credits',async()=>{
  const original={code:'IN2107',status:'passed',semester:7,locked:true,topics:seminar.slice(0,2).map(snap)},h=harness([original]);await h.open('IN2107',2);assert(h.fields['#topic-picker-context'].textContent.includes('第 7 学期已通过'));assert(h.fields['[data-topic-save]'].disabled);
  h.choose(seminar[0].id,false);await h.save();let item=h.plan().items[0];assert.equal(item.semester,7);assert.equal(item.status,'passed');assert(item.locked);assert.deepEqual(item.topics.map(x=>x.id),[seminar[1].id]);
  await h.open();h.clear();assert.equal(h.writes(),1);assert.equal(h.fields['[data-topic-save]'].textContent,'清空候选');await h.save();item=h.plan().items[0];assert(!item.topics);assert.equal(item.semester,7);assert(item.locked);assert.equal(C.calculate(h.plan(),courses,true).allocated,5);
 });
 await test('Unavailable historical candidates remain selectable and removable without losing them during a search or save',async()=>{
  const old={...snap(seminar[0]),id:'IN2107-2025W-123456abcdef',term:'2025W',title:'往期候选'},h=harness([{code:'IN2107',status:'planned',semester:1,topics:[old]}]);
  await h.open();assert(h.fields['[data-topic-results]'].innerHTML.includes('本期名单未收录'));assert(h.fields['[data-topic-results]'].innerHTML.includes('value="'+old.id+'" checked'));h.search('no-such-topic-xyz');assert(!h.fields['[data-topic-empty]'].hidden);h.search('');h.choose(seminar[1].id);await h.save();assert.equal(h.plan().items[0].topics.length,2);assert.deepEqual(h.plan().items[0].topics[0],old);
  await h.open();h.choose(old.id,false);await h.save();assert.deepEqual(h.plan().items[0].topics.map(x=>x.id),[seminar[1].id]);
 });
 await test('Only-selected filtering, search, removal and clear remain draft-only and accurately report totals',async()=>{
  const h=harness();await h.open();h.choose(seminar[0].id);h.choose(seminar[1].id);h.only();assert.equal(h.fields['[data-topic-count]'].textContent,'2 个课题');assert.equal(h.fields['[data-topic-selected-only]'].attrs['aria-pressed'],'true');h.choose(seminar[0].id,false);assert.equal(h.fields['[data-topic-count]'].textContent,'1 个课题');h.clear();assert(!h.fields['[data-topic-empty]'].hidden);assert(h.fields['[data-topic-save]'].disabled);assert(h.fields['[data-topic-selected-count]'].textContent.includes('0 个候选'));h.only();assert.equal(h.fields['[data-topic-count]'].textContent,'74 个课题');assert.equal(h.writes(),0);
 });
 await test('Failures preserve all candidates and the search for retry; repeated save and Escape cannot race an active write',async()=>{
  const h=harness();await h.open();h.search('robot');h.choose(seminar[0].id);h.choose(seminar[1].id);h.fail(true);await h.save();assert(h.dialog.open);assert(h.fields['[data-topic-error]'].textContent.includes('保存失败'));assert.equal(h.fields['[data-topic-search]'].value,'robot');assert.equal(h.writes(),0);assert.equal(h.calls[0].ids.length,2);
  h.fail(false);const gate=h.defer(),pending=h.save();await tick();await h.save();assert.equal(h.calls.length,2);assert(h.escape());gate.resolve();await pending;assert.equal(h.writes(),1);assert.equal(h.plan().items[0].topics.length,2);assert(!h.dialog.open);
 });
 await test('Setup cancellation and in-memory-only storage keep drafts open without claiming a saved result',async()=>{
  const h=harness();await h.open();h.choose(seminar[0].id);h.cancelSetup();await h.save();assert(h.dialog.open);assert.equal(h.writes(),0);assert.equal(h.toasts.length,0);
  const temp=harness();temp.U.persisted=false;await temp.open();temp.choose(seminar[0].id);await temp.save();assert(temp.dialog.open);assert(temp.fields['[data-topic-error]'].textContent.includes('未保存到浏览器'));assert.equal(temp.toasts.length,0);
 });
 await test('Concurrent candidate or semester changes block stale saves and restore the replacement entry on close',async()=>{
  for(const patch of [{semester:3},{topics:[snap(seminar[2])]}]){
   const h=harness([{code:'IN2107',status:'planned',semester:1}]);await h.open();h.choose(seminar[0].id);h.external([{code:'IN2107',status:'planned',semester:1,...patch}]);await h.save();assert(h.dialog.open);assert(h.fields['[data-topic-error]'].textContent.includes('其他页面'));assert.equal(h.writes(),0);h.opener.isConnected=false;h.cancel();assert(h.replacement.focused);
  }
 });
 await test('Source-term filters never discard candidates from other terms, while data failures cannot open a broken picker',async()=>{
  const extra={...seminar[0],id:'IN2107-2025W-123456abcdef',term:'2025W'},h=harness([],{data:{...catalog,entries:[...catalog.entries,extra]}});await h.open();assert(!h.fields['[data-topic-term-label]'].hidden);h.choose(seminar[1].id);h.fields['[data-topic-term]'].value='2025W';h.fields['[data-topic-term]'].handlers.change();assert.equal(h.fields['[data-topic-count]'].textContent,'1 个课题');h.choose(extra.id);h.fields['[data-topic-term]'].value='';h.fields['[data-topic-term]'].handlers.change();assert.equal((h.fields['[data-topic-results]'].innerHTML.match(/ checked/g)||[]).length,2);assert(h.fields['[data-topic-selected-count]'].textContent.includes('2 个候选'));h.cancel();
  const failed=harness();failed.failRead();await failed.open();assert(!failed.dialog.open);assert(failed.toasts.at(-1).message.includes('读取失败'));assert.equal(failed.writes(),0);
 });
 console.log(checks+' course topic picker checks passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
