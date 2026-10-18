/* Verify the public source boundary and an independently refreshed, expiring badge. */
'use strict';
const assert=require('node:assert/strict');
const {SOURCES,MAX_AGE,createCrowding}=require('../lib/mensa-crowding');
const {createHandler}=require('../api/mensa-crowding');
const client=require('../site3/mensa-crowding');
const ID='mensa-lothstr',OTHER='mensa-pasing',NOW=Date.parse('2026-10-18T10:00:00Z');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const raw=(changes={})=>({enum_name:SOURCES[ID],current:42,percent:0.25,updated:new Date(NOW-120000).toISOString(),...changes});
const reading=(changes={})=>({version:1,canteen:ID,state:'available',current:42,updated_at:new Date(NOW-120000).toISOString(),expires_at:new Date(NOW-120000+MAX_AGE).toISOString(),...changes});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function invoke(handler,{canteen=ID,method='GET'}={}){
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
 await handler({method,url:'/api/mensa-crowding/?canteen='+encodeURIComponent(canteen)},res);return res;
}
function fixture({hidden=false}={}){
 let time=NOW,sequence=0;
 const timers=new Map(),calls=[],events=new Map();
 const doc={hidden,addEventListener(k,v){if(!events.has(k))events.set(k,new Set());events.get(k).add(v);},removeEventListener(k,v){events.get(k)?.delete(v);if(!events.get(k)?.size)events.delete(k);}};
 const makeNode=id=>({hidden:true,textContent:'',title:'',dataset:{crowdingCanteen:id},setAttribute(k,v){this[k]=v;}});
 const node=makeNode();let badges=Object.keys(SOURCES).map(makeNode);
 const list={querySelectorAll:()=>badges};
 const later=(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:time+ms});return id;};
 const cancel=id=>timers.delete(id);
 const request=(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject}));
 const badge=client.create({catalog:{crowding_url:'/api/mensa-crowding/',crowding_canteens:Object.keys(SOURCES)},node,list,document:doc,fetch:request,now:()=>time,setTimeout:later,clearTimeout:cancel});
 return {badge,node,calls,timers,doc,events,
  async respond(index,data=reading(),status=200){calls[index].resolve(json(data,status));await flush();},
  async respondAll(from=0,changes={}){for(let i=from;i<from+Object.keys(SOURCES).length;i++){calls[i].resolve(json(reading({canteen:new URL(calls[i].url).searchParams.get('canteen'),...changes})));}await flush();},
  async fail(index){calls[index].reject(Error('offline'));await flush();},
  async advance(ms){time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}await flush();},
  visibility(hidden){doc.hidden=hidden;for(const listener of events.get('visibilitychange')||[])listener();},
  rows(){return badges;},replaceRows(ids){badges=ids.map(makeNode);badge.syncList();}
 };
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name);}
(async()=>{
 await test('Only fixed directory sources are requested; zero is a valid count',async()=>{
  const calls=[],read=createCrowding({now:()=>NOW,fetch:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert(options.signal instanceof AbortSignal);return json(raw({current:0}));}});
  const data=await read(ID);assert.equal(data.state,'available');assert.equal(data.current,0);assert(!('percent' in data));assert.equal(data.expires_at,new Date(NOW-120000+MAX_AGE).toISOString());
  assert.deepEqual(calls,['https://api.redcube.dev/v1/capacity/MENSA_LOTHSTR']);
  assert.equal((await read('https://example.org/')).state,'unsupported');assert.equal(calls.length,1);
 });
 await test('Stale and future readings do not publish any count',async()=>{
  for(const updated of [new Date(NOW-MAX_AGE).toISOString(),new Date(NOW+61000).toISOString()]){
   const data=await createCrowding({now:()=>NOW,fetch:async()=>json(raw({updated}))})(ID);
   assert.deepEqual(data,{version:1,canteen:ID,state:'unavailable'});
  }
 });
 await test('Wrong venue, invalid counts and ambiguous timestamps are rejected',async()=>{
  for(const change of [{enum_name:SOURCES[OTHER]},{current:-1},{current:'42'},{current:1.5},{current:Number.MAX_SAFE_INTEGER+1},{updated:null},{updated:'2026-10-18T09:59:00'}]){
   await assert.rejects(()=>createCrowding({now:()=>NOW,fetch:async()=>json(raw(change))})(ID));
  }
  for(const data of [null,[],{},'hello'])await assert.rejects(()=>createCrowding({now:()=>NOW,fetch:async()=>json(data)})(ID));
 });
 await test('Source HTTP failures, broken JSON and oversized bodies fail safely',async()=>{
  for(const response of [json({},503),new Response('{'),new Response(' '.repeat(10001))])await assert.rejects(()=>createCrowding({fetch:async()=>response})(ID));
 });
 await test('API exposes a short cached reading without using private services',async()=>{
  const res=await invoke(createHandler({read:async()=>reading()}));assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'public, max-age=0, s-maxage=60');assert.deepEqual(res.body,reading());
 });
 await test('API rejects invalid venue URLs and methods before calling a source',async()=>{
  let calls=0;const handler=createHandler({read:async()=>{calls++;}});
  for(const canteen of ['','../../mensa-pasing','https://api.redcube.dev/'])assert.equal((await invoke(handler,{canteen})).statusCode,400);
  const res=await invoke(handler,{method:'POST'});assert.equal(res.statusCode,405);assert.equal(res.headers.Allow,'GET');assert.equal(calls,0);
 });
 await test('Source errors return neutral unavailable state without cached errors or details',async()=>{
  const res=await invoke(createHandler({read:async()=>{throw Error('private upstream detail');}}));
  assert.equal(res.statusCode,503);assert.equal(res.headers['Cache-Control'],'no-store');assert.deepEqual(res.body,{version:1,canteen:ID,state:'unavailable'});
  const stale=await invoke(createHandler({read:async()=>({version:1,canteen:ID,state:'unavailable'})}));assert.equal(stale.headers['Cache-Control'],'no-store');
 });
 await test('One shared loop and listener serve both copies without requests on selection or filtering',async()=>{
  const f=fixture();f.badge.select(ID);assert.equal(f.calls.length,3);assert.equal(f.events.get('visibilitychange').size,1);assert.equal(f.node.textContent,'读取中');
  await f.respondAll(0,{current:0});assert.equal(f.node.textContent,'0 人');assert.equal(f.rows()[0].textContent,'0 人');assert.equal(f.node['aria-label'],'当前人数：0 人');assert.equal(f.timers.size,1);
  f.badge.select(OTHER);f.badge.select(OTHER);assert.equal(f.calls.length,3);assert.equal(f.node.title,f.rows()[1].title);
  f.replaceRows([OTHER,ID]);assert.equal(f.rows()[0].textContent,'0 人');assert.equal(f.rows()[1].textContent,'0 人');assert.equal(f.calls.length,3);
  f.badge.select('mensa-garching');assert(f.node.hidden);assert.equal(f.calls.length,3);f.badge.destroy();assert.equal(f.timers.size,0);
 });
 await test('Late venue responses update only their own row, never the selected menu title',async()=>{
  const f=fixture();f.badge.select(ID);f.badge.select(OTHER);await f.respond(1,reading({canteen:OTHER,current:9}));await f.respond(0,reading({current:42}));await f.fail(2);
  assert.equal(f.node.textContent,'9 人');assert.equal(f.rows()[0].textContent,'42 人');f.badge.select('mensa-arcisstr');assert(f.node.hidden);f.badge.destroy();
 });
 await test('Wrong venue payloads, invalid counts and stale timestamps never display availability',async()=>{
  const f=fixture();f.badge.select(ID);await f.respond(0,reading({canteen:OTHER}));await f.fail(1);await f.fail(2);assert.equal(f.node.textContent,'暂无数据');
  for(const change of [{updated_at:'bad'},{current:-2},{expires_at:new Date(NOW).toISOString()},{updated_at:new Date(NOW+120000).toISOString()}])assert(!client.validReading(reading(change),ID,NOW));f.badge.destroy();
 });
 await test('Every minute refreshes each provider once; a failure removes its old count only',async()=>{
  const f=fixture();f.badge.select(ID);await f.respondAll();await f.advance(60000);assert.equal(f.calls.length,6);await f.fail(3);await f.respond(4,reading({canteen:OTHER,current:17}));await f.fail(5);
  assert.equal(f.node.textContent,'暂无数据');assert.equal(f.rows()[0].textContent,'暂无数据');assert.equal(f.rows()[1].textContent,'17 人');assert.equal(f.timers.size,1);f.badge.destroy();
 });
 await test('A nearly expired count clears on time while other source requests remain pending',async()=>{
  const f=fixture();f.badge.select(ID);await f.respond(0,reading({updated_at:new Date(NOW-MAX_AGE+1000).toISOString(),expires_at:new Date(NOW+1000).toISOString()}));assert.equal(f.node.textContent,'42 人');
  await f.advance(1000);assert.equal(f.node.textContent,'暂无数据');assert.equal(f.rows()[0].textContent,'暂无数据');assert.equal(f.calls.length,3);
  await f.fail(1);await f.fail(2);f.badge.destroy();assert.equal(f.timers.size,0);
 });
 await test('Hidden pages stop all polling and returning expires both copies before refreshing',async()=>{
  const f=fixture();f.badge.select(ID);await f.respondAll();f.visibility(true);assert.equal(f.timers.size,0);await f.advance(MAX_AGE);assert.equal(f.calls.length,3);
  f.visibility(false);assert.equal(f.node.textContent,'暂无数据');assert.equal(f.rows()[0].textContent,'暂无数据');assert.equal(f.calls.length,6);
  await f.respondAll(3,{updated_at:new Date(NOW+MAX_AGE).toISOString(),expires_at:new Date(NOW+2*MAX_AGE).toISOString()});assert.equal(f.node.textContent,'42 人');f.badge.destroy();assert.equal(f.events.size,0);
 });
 await test('An aborted response from a previous visibility cycle cannot overwrite new data',async()=>{
  const f=fixture();f.badge.select(ID);f.visibility(true);assert(f.calls.every(call=>call.options.signal.aborted));assert.equal(f.timers.size,0);f.visibility(false);
  await f.respondAll(3,{current:9});await f.respondAll(0,{current:42});assert.equal(f.node.textContent,'9 人');assert.equal(f.rows()[0].textContent,'9 人');f.badge.destroy();
 });
 await test('Slow source requests time out, and destroy cleans active requests and scheduled work',async()=>{
  const f=fixture();f.badge.select(ID);await f.advance(6500);assert(f.calls.every(call=>call.options.signal.aborted));for(let i=0;i<3;i++)await f.fail(i);assert.equal(f.node.textContent,'暂无数据');
  await f.advance(53500);assert.equal(f.calls.length,6);f.badge.destroy();assert.equal(f.timers.size,0);assert.equal(f.events.size,0);await f.respondAll(3);assert.equal(f.node.textContent,'暂无数据');
 });
 await test('A page opened in the background waits until it is visible to request counts',async()=>{
  const f=fixture({hidden:true});f.badge.select(ID);assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);f.visibility(false);assert.equal(f.calls.length,3);await f.respondAll();assert.equal(f.node.textContent,'42 人');f.badge.destroy();
 });
 console.log(`\n${count} crowding checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
