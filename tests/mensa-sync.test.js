/* Exercise daily synchronization, durable reuse, failures and API authorization without live services. */
'use strict';
const assert=require('node:assert/strict');
const M=require('../site3/mensa'),{createMensa,translationKey,weekKey,validChinese}=require('../lib/mensa-sync');
const publicHandler=require('../api/mensa-translations').createHandler,cronHandler=require('../api/mensa-sync').createHandler;
const ID='mensa-garching',DATE='2026-10-19',NAME='Neue Kürbislasagne (2 Stück)',ZH='新式南瓜千层面（2 块）';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const feed=(names,date=DATE)=>({year:M.weekOf(date).year,number:M.weekOf(date).week,days:[{date,dishes:names.map(name=>({name}))}]});
function fixture(names=[NAME]){
 const records=new Map(),calls=[],modelCalls=[],feeds=new Map([[M.menuURL(ID,DATE),feed(names)]]);
 let version=0,time=Date.parse(DATE+'T08:00:00Z'),failure=null,modelReply=null;
 const env={BLOB_READ_WRITE_TOKEN:'test-storage',VERCEL_OIDC_TOKEN:'test-identity',CRON_SECRET:'test-cron-secret'};
 const store={
  async get(key,options){if(failure?.('get',key))throw Error('storage offline');const record=records.get(key);return record?{statusCode:200,stream:json(record.data).body,blob:{etag:options.headers?.['accept-encoding']==='identity'?record.etag:'W/'+record.etag}}:null;},
  async put(key,text,options){
   if(failure?.('put',key))throw Error('storage offline');
   const previous=records.get(key);
   if((!options.allowOverwrite&&previous)||(options.ifMatch&&previous?.etag!==options.ifMatch))throw Error('Precondition failed');
   assert.equal(options.access,'private');assert.equal(options.addRandomSuffix,false);
   const etag='v'+(++version);records.set(key,{data:JSON.parse(text),etag});return {etag};
  }
 };
 const request=async(url,options={})=>{
  calls.push(url);
  if(url==='https://ai-gateway.vercel.sh/v1/chat/completions'){
   assert.equal(options.headers.Authorization,'Bearer test-identity');
   const body=JSON.parse(options.body),rows=JSON.parse(body.messages[1].content);modelCalls.push(rows);
   return modelReply?modelReply(rows):json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translations:rows.map(r=>({id:r.id,text:translationKey(r.source)===translationKey(NAME)?ZH:'新菜 '+(r.source.match(/\d+/g)||[]).join(' ')}))})}}]});
  }
  assert(url.startsWith('https://tum-dev.github.io/eat-api/'));return feeds.has(url)?json(feeds.get(url)):json({},404);
 };
 const service=()=>createMensa({store,env,fetch:request,now:()=>time});
 return {records,calls,modelCalls,feeds,env,store,service,setTime:value=>{time=Date.parse(value);},fail:fn=>{failure=fn;},reply:fn=>{modelReply=fn;}};
}
async function invoke(handler,{url='/api/mensa-translations?canteen='+ID+'&date='+DATE,method='GET',authorization}={}){
 const res={headers:{},statusCode:200,setHeader(key,value){this.headers[key]=value;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
 await handler({url,method,headers:{authorization}},res);return res;
}
let count=0;
async function test(name,fn){await fn();count++;console.log('PASS',name);}
(async()=>{
 await test('New names translate once, persist without prices and survive a fresh service instance',async()=>{
  const f=fixture([NAME,'  NEUE Kürbislasagne (2 Stück)  ','Pommes frites']);
  const result=await f.service().sync();assert(result.ok);assert.equal(result.translated,1);assert.equal(result.uniqueDishes,2);assert.equal(result.pending,0);assert.equal(f.modelCalls.length,1);assert.equal(f.modelCalls[0].length,1);
  assert.equal(f.calls.filter(u=>u.startsWith('https://tum-dev')).length,75);
  const cache=await f.service().publicWeek(ID,DATE);assert.equal(cache.dishes[NAME],ZH);assert.equal(cache.dishes['Pommes frites'],'薯条');assert(!JSON.stringify(cache).includes('prices'));assert.equal(f.records.size,4);
  assert.equal(f.records.get(translationKey(NAME)).data.language,'zh-CN');
  assert.equal((await f.service().sync()).skipped,'already-synced');assert.equal(f.modelCalls.length,1);
  f.setTime('2026-10-20T08:00:00Z');assert((await f.service().sync()).ok);assert.equal(f.modelCalls.length,1);
 });
 await test('Curated names do not require model authentication or consume translation budget',async()=>{
  const f=fixture(['Pommes frites']);delete f.env.VERCEL_OIDC_TOKEN;const result=await f.service().sync();assert(result.ok);assert.equal(result.translated,0);assert.equal(f.modelCalls.length,0);assert.equal((await f.service().publicWeek(ID,DATE)).dishes['Pommes frites'],'薯条');
 });
 await test('A daily persistent quota survives force runs and new names resume on the following day',async()=>{
  const f=fixture([NAME,'Neue Suppe']);f.env.MENSA_TRANSLATION_DAILY_LIMIT='1';let result=await f.service().sync();assert.equal(result.translated,1);assert.equal(result.pending,1);
  result=await f.service().sync({force:true});assert.equal(result.translated,0);assert.equal(result.pending,1);assert.equal(f.modelCalls.length,1);
  f.setTime('2026-10-20T08:00:00Z');result=await f.service().sync();assert.equal(result.translated,1);assert.equal(result.pending,0);assert.equal(f.modelCalls.length,2);
 });
 await test('Daily model allowance is charged before a failed attempt and is never bypassed by retries',async()=>{
  const f=fixture();f.env.MENSA_TRANSLATION_DAILY_LIMIT='1';f.reply(()=>json({},429));let result=await f.service().sync();assert(!result.ok);assert.equal(result.pending,1);assert.equal(f.records.get('mensa/v1/usage/'+DATE+'.json').data.attempted,1);
  result=await f.service().sync({force:true});assert.equal(f.modelCalls.length,1);assert.equal(result.pending,1);assert.equal(f.records.get('mensa/v1/sync-state.json').data.completedDay,null);
 });
 await test('Unavailable translation credentials leave new names pending while publishing known Chinese',async()=>{
  const f=fixture([NAME,'Pommes frites']);delete f.env.VERCEL_OIDC_TOKEN;const result=await f.service().sync();assert(!result.ok);assert.equal(result.pending,1);assert.equal(f.modelCalls.length,0);const data=await f.service().publicWeek(ID,DATE);assert(!data.dishes[NAME]);assert.equal(data.dishes['Pommes frites'],'薯条');
 });
 await test('Source HTTP failures retain the previous week cache and do not invent menu records',async()=>{
  const f=fixture();await f.service().sync();const previous=JSON.stringify(f.records.get(weekKey(ID,DATE)));f.setTime('2026-10-20T08:00:00Z');f.feeds.set(M.menuURL(ID,DATE),{year:2001,number:1,days:[]});const result=await f.service().sync();assert(!result.ok);assert.equal(JSON.stringify(f.records.get(weekKey(ID,DATE))),previous);assert.equal(f.modelCalls.length,1);
 });
 await test('Missing feeds remain unpublished and menu responses cannot introduce another week or malformed days',async()=>{
  const f=fixture();f.feeds.clear();f.feeds.set(M.menuURL(ID,DATE),{...feed([NAME]),days:[{date:'2026-10-29',dishes:[{name:NAME}]}]});const result=await f.service().sync();assert(!result.ok);assert.equal(result.availableWeeks,0);assert.equal(result.unpublishedWeeks,74);assert.equal(f.modelCalls.length,0);assert.deepEqual((await f.service().publicWeek(ID,DATE)).dishes,{});
 });
 await test('Model output requires exact IDs, Chinese text, intact quantity digits and a complete response',async()=>{
  const f=fixture(),bad=[{translations:[]},{translations:[{id:9,text:ZH}]},{translations:[{id:0,text:'German text'}]},{translations:[{id:0,text:'南瓜千层面'}]},{translations:[{id:0,text:'<script>中文2</script>'}]}];
  for(const data of bad){f.reply(()=>json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}]}));await assert.rejects(()=>f.service().translate([NAME]));}
  f.reply(()=>json({choices:[{finish_reason:'length',message:{content:JSON.stringify({translations:[{id:0,text:ZH}]})}}]}));await assert.rejects(()=>f.service().translate([NAME]));
  f.reply(()=>json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translations:[{id:0,text:ZH},{id:0,text:ZH}]})}}]}));await assert.rejects(()=>f.service().translate([NAME,'Neue Suppe']));
  assert(!validChinese('南瓜千层面（1 块）',NAME));
  assert(validChinese('半只猪肘配土豆沙拉','1/2 Schweinshaxe mit Kartoffelsalat'));
  assert(!validChinese('猪肘配土豆沙拉','1/2 Schweinshaxe mit Kartoffelsalat'));
 });
 await test('Reordered model IDs remain attached to their original dish names',async()=>{
  const f=fixture();f.reply(()=>json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translations:[{id:1,text:'新汤'},{id:0,text:ZH}]})}}]}));assert.deepEqual(await f.service().translate([NAME,'Neue Suppe']),[ZH,'新汤']);
 });
 await test('Failed immutable translation writes remain pending and never appear as cached success',async()=>{
  const f=fixture();f.fail((op,key)=>op==='put'&&key.startsWith('mensa/v1/translations/'));const result=await f.service().sync();assert(!result.ok);assert.equal(result.translated,0);assert.equal(result.pending,1);assert(!f.records.has(translationKey(NAME)));assert.equal(f.records.get('mensa/v1/sync-state.json').data.completedDay,null);
 });
 await test('A failed week snapshot can recover from durable dish translations without another model call',async()=>{
  const f=fixture();f.fail((op,key)=>op==='put'&&key.startsWith('mensa/v1/weeks/'));assert(!(await f.service().sync()).ok);assert.equal(f.modelCalls.length,1);f.fail(null);assert((await f.service().sync()).ok);assert.equal(f.modelCalls.length,1);assert.equal((await f.service().publicWeek(ID,DATE)).dishes[NAME],ZH);
 });
 await test('An unexpected orchestration failure releases the lease without marking the day complete',async()=>{
  const f=fixture();f.records.set('mensa/v1/usage/'+DATE+'.json',{etag:'bad',data:{attempted:-1}});await assert.rejects(()=>f.service().sync());const state=f.records.get('mensa/v1/sync-state.json').data;assert.equal(state.completedDay,null);assert.equal(state.expiresAt,0);assert.equal(state.summary.ok,false);
 });
 await test('Concurrent daily invocations acquire only one lease and incur one translation batch',async()=>{
  const f=fixture(),results=await Promise.all([f.service().sync(),f.service().sync()]);assert.equal(results.filter(r=>r.skipped==='running').length,1);assert.equal(f.modelCalls.length,1);
 });
 await test('Corrupt dish cache values never pass into a published week or get silently translated again',async()=>{
  const f=fixture();f.records.set(translationKey(NAME),{etag:'bad',data:{version:1,source:'Different source',text:ZH}});const result=await f.service().sync();assert(!result.ok);assert.equal(f.modelCalls.length,0);assert.equal(result.pending,1);assert(!Object.hasOwn((await f.service().publicWeek(ID,DATE)).dishes,NAME));
 });
 await test('Public API accepts only allowlisted canteens and valid dates, and never invokes translation',async()=>{
  const f=fixture(),handler=publicHandler({service:f.service(),log:()=>{}});let response=await invoke(handler);assert.equal(response.statusCode,200);assert(response.headers['Cache-Control'].includes('s-maxage=300'));assert.equal(f.calls.length,0);
  for(const url of ['/api/mensa-translations?canteen=../../feedback&date='+DATE,'/api/mensa-translations?canteen='+ID+'&date=2026-02-30','/api/mensa-translations?canteen='+ID+'&date=9999-10-19'])assert.equal((await invoke(handler,{url})).statusCode,400);
  assert.equal((await invoke(handler,{method:'POST'})).statusCode,405);assert.equal(f.modelCalls.length,0);
 });
 await test('Public API degrades to a small generic error without credentials or private cache details',async()=>{
  const f=fixture();delete f.env.BLOB_READ_WRITE_TOKEN;delete f.env.VERCEL_OIDC_TOKEN;const response=await invoke(publicHandler({service:f.service(),log:()=>{}}));assert.equal(response.statusCode,503);assert.equal(response.headers['Cache-Control'],'no-store');assert.deepEqual(response.body,{error:'中文参考暂时无法读取。'});
 });
 await test('Daily endpoint requires the cron secret and exposes no model access through unauthorized requests',async()=>{
  let calls=0;const service={sync:async options=>{calls++;return {ok:true,force:options.force};}},handler=cronHandler({service,env:{CRON_SECRET:'secret'},log:()=>{}});
  for(const authorization of [undefined,'Bearer wrong','Bearer secret\n'])assert.equal((await invoke(handler,{authorization})).statusCode,401);assert.equal(calls,0);
  assert.equal((await invoke(handler,{authorization:'Bearer secret',method:'POST'})).statusCode,405);
  const response=await invoke(handler,{authorization:'Bearer secret',url:'/api/mensa-sync?force=1'});assert.equal(response.statusCode,200);assert.equal(response.body.force,true);assert.equal(calls,1);assert.equal(response.headers['Cache-Control'],'private, no-store');
  assert.equal((await invoke(cronHandler({service,env:{},log:()=>{}}),{authorization:'Bearer undefined'})).statusCode,401);
  assert.equal((await invoke(cronHandler({service:{sync:async()=>{throw Error('private token');}},env:{CRON_SECRET:'secret'},log:()=>{}}),{authorization:'Bearer secret'})).statusCode,503);
 });

 await test('Production cron uses a direct route with the site trailing-slash policy and a daily schedule',async()=>{
  const config=require('../vercel.json');assert.equal(config.crons.length,1);assert.equal(config.crons[0].schedule,'30 9 * * *');assert.equal(config.crons[0].path,'/api/mensa-sync/');assert.equal(config.trailingSlash,true);assert.equal(config.functions['api/mensa-sync.js'].maxDuration,300);
 });
 console.log(count+' daily menu checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
