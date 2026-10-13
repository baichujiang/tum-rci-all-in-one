/* Controlled scheduling tests; real IndexedDB is also exercised in browser QA. */
'use strict';
const assert=require('node:assert/strict'),L=require('../site3/local-lock');
function database(){
 const queue=[];let active=null,closed=0;
 const db={createObjectStore(){},close(){closed++;},transaction(store,mode){
  assert.equal(store,'mutex');assert.equal(mode,'readwrite');
  let pending=0,ended=false;
  const requests=[];
  const tx={objectStore(){return {get(){
   if(ended)throw Error('Inactive transaction');
   const request={};pending++;requests.push(request);if(active===tx)dispatch();return request;
  }};},abort(){if(ended)return;ended=true;if(active===tx)active=null;queue.splice(queue.indexOf(tx),1);tx.onabort?.();start();}};
  function dispatch(){const request=requests.shift();if(!request)return;setImmediate(()=>{
   if(ended)return;request.onsuccess?.();pending--;
   if(!pending)setImmediate(()=>{if(ended||pending)return;ended=true;active=null;queue.shift();tx.oncomplete?.();start();});
  });}
  tx.begin=dispatch;queue.push(tx);start();return tx;
 }};
 function start(){if(!active&&queue.length){active=queue[0];active.begin();}}
 const factory={open(){const request={};setImmediate(()=>{request.result=db;request.onupgradeneeded?.();request.onsuccess?.();});return request;}};
 return {factory,abort:()=>active?.abort(),closed:()=>closed};
}
let count=0;
async function test(name,fn){await fn();console.log('PASS',name);count++;}
(async()=>{
 await test('Native locks keep the shared namespace and return work results',async()=>{
  let used=0;const l=L.create({locks:{request(name,work){assert.equal(name,'rci:local-data');used++;return work();}}});
  assert.equal(await l.run(assertHeld=>{assertHeld();return 42;}),42);assert.equal(used,1);
 });
 await test('Independent pages without Web Locks serialize async read-modify-write work',async()=>{
  const d=database(),pages=Array.from({length:4},()=>L.create({indexedDB:d.factory}));let value=0,inside=0;
  await Promise.all(Array.from({length:24},(_,i)=>pages[i%4].run(async guard=>{
   assert.equal(inside++,0);const before=value;await new Promise(r=>setTimeout(r,2));guard();value=before+1;inside--;
  })));assert.equal(value,24);assert.equal(inside,0);
 });
 await test('A rejected callback releases the transaction for the following page',async()=>{
  const d=database(),a=L.create({indexedDB:d.factory}),b=L.create({indexedDB:d.factory});
  await assert.rejects(a.run(()=>{throw Error('Invalid plan');}),/Invalid plan/);assert.equal(await b.run(()=>17),17);
 });
 await test('Transaction abort invalidates the guard before a delayed write',async()=>{
  const d=database(),l=L.create({indexedDB:d.factory});let release,started,write=false;
  const began=new Promise(r=>{started=r;});const gate=new Promise(r=>{release=r;});
  const task=l.run(async guard=>{started();await gate;guard();write=true;});
  await began;const rejection=assert.rejects(task,/中断/);d.abort();await rejection;release();
  await new Promise(r=>setImmediate(r));assert.equal(write,false);
 });
 await test('Missing or denied IndexedDB never executes an unprotected callback',async()=>{
  for(const indexedDB of [undefined,{open(){throw Error('SecurityError');}},{open(){const r={};setImmediate(()=>r.onerror());return r;}}]){
   let touched=false;await assert.rejects(L.create({indexedDB}).run(()=>{touched=true;}),e=>e.lockUnavailable===true);assert.equal(touched,false);
  }
 });
 await test('A blocked open rejects safely and closes a late successful connection',async()=>{
  let closed=false,request;const indexedDB={open(){request={};setImmediate(()=>request.onblocked());return request;}};
  await assert.rejects(L.create({indexedDB}).run(()=>{}),e=>e.lockUnavailable===true);
  request.result={close(){closed=true;}};request.onsuccess();assert(closed);
 });
 console.log(count+' local lock checks passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
