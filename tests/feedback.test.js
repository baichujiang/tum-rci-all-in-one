'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {randomUUID}=require('node:crypto'),{BlobNotFoundError}=require('@vercel/blob');
const {createHandler}=require('../api/feedback');
const env={BLOB_READ_WRITE_TOKEN:'test-only',FEEDBACK_RATE_LIMIT_SECRET:'test-only',VERCEL:'1'};
function fixture(){
 const records=new Map();let timestamp=1800000000000,unavailable=false;
 const store={head:async key=>{if(unavailable)throw Error('offline');if(!records.has(key))throw new BlobNotFoundError();return {};},put:async(key,value,options)=>{assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);if(unavailable||records.has(key))throw Error('write failed');records.set(key,JSON.parse(value));}};
 return {records,handler:createHandler({store,env,now:()=>timestamp,log:()=>{}}),later:()=>timestamp+=10001,offline:()=>unavailable=true};
}
const input=()=>({id:randomUUID(),type:'feature',message:'希望增加一个新的入口',page:'/planner/'});
async function call(handler,body=input(),extra={}){
 const req={method:'POST',headers:{host:'rci.test',origin:'https://rci.test','content-type':'application/json','x-vercel-forwarded-for':'192.0.2.1'},body};
 Object.defineProperties(req,Object.getOwnPropertyDescriptors(extra));
 if(extra.headers)req.headers={host:'rci.test',origin:'https://rci.test','content-type':'application/json','x-vercel-forwarded-for':'192.0.2.1',...extra.headers};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await handler(req,res);return res;
}
async function apiTests(){
 assert.equal(require('../site3/feedback').draft('feature','测试内容','//external').page,'/');
 const f=fixture(),body=input();
 let response=await call(f.handler,body);assert.equal(response.code,201);assert.equal(response.data.id,body.id);
 const saved=[...f.records.entries()].find(([key])=>key.startsWith('feedback/'));
 assert.deepEqual(saved[1],{...body,createdAt:new Date(1800000000000).toISOString()});
 assert(!JSON.stringify([...f.records]).includes('192.0.2.1'));
 response=await call(f.handler,body);assert.equal(response.code,200);assert.equal(f.records.size,2);
 response=await call(f.handler,input(),{headers:{'x-forwarded-for':'192.0.2.99'}});assert.equal(response.code,429);assert.equal(response.headers['Retry-After'],'10');
 f.later();response=await call(f.handler,input());assert.equal(response.code,201);
 f.offline();response=await call(f.handler,input());assert.equal(response.code,503);assert(!response.data.ok);
 const g=fixture();
 for(const [extra,code] of [[{method:'GET'},405],[{headers:{origin:'https://other.test'}},403],[{headers:{'sec-fetch-site':'cross-site'}},403],[{headers:{'content-type':'text/plain'}},415],[{headers:{'content-length':'12001'}},413]])assert.equal((await call(g.handler,input(),extra)).code,code);
 for(const patch of [{message:'   '},{message:'a'.repeat(2001)},{id:'bad'},{type:'__proto__'},{website:'spam'}])assert.equal((await call(g.handler,{...input(),...patch})).code,400);
 const malformed={method:'POST',headers:{host:'rci.test','content-type':'application/json'},get body(){throw Error('invalid JSON');}};
 assert.equal((await call(g.handler,undefined,malformed)).code,400);
 assert.equal(g.records.size,0);
 const noStorage=createHandler({env:{}});assert.equal((await call(noStorage)).code,503);
 const h=fixture();assert.equal((await call(h.handler,{...input(),page:'/search/?q=private#plan'})).code,201);assert.equal([...h.records.values()].find(x=>x.message).page,'/');
 console.log('PASS Private feedback saves, deduplicates retries, rate limits, rejects invalid/cross-site requests and fails honestly');
}
async function uiTests(){
 const nodes={};
 for(const id of ['feedback-form','feedback-type','feedback-message','feedback-submit','feedback-status','feedback-context','feedback-copy','feedback-copy-fallback','feedback-website'])nodes[id]={value:'',dataset:{},disabled:false,listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},setCustomValidity(value){this.validation=value;},reportValidity(){return !nodes['feedback-message'].validation;},setAttribute(){},removeAttribute(){}};
 const form=nodes['feedback-form'],message=nodes['feedback-message'],button=nodes['feedback-submit'],status=nodes['feedback-status'];
 form.action='https://rci.test/api/feedback';nodes['feedback-type'].value='feature';
 let requests=[],finish;
 const context={document:{getElementById:id=>nodes[id]},location:{search:'?from=%2Fplanner%2F'},URLSearchParams,crypto:{randomUUID},AbortSignal,console,fetch:async(url,options)=>{requests.push({url,payload:JSON.parse(options.body)});return new Promise(resolve=>finish=resolve);}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../site3/feedback'),'utf8'),context);
 const submit=()=>form.listeners.submit({preventDefault(){}});
 message.value='   ';await submit();assert.equal(requests.length,0);assert(message.validation);
 message.value='希望改进反馈入口';message.listeners.input();
 const first=submit();await submit();assert.equal(requests.length,1);assert(button.disabled);assert(message.readOnly);
 finish({ok:false,json:async()=>({error:'服务暂时不可用'})});await first;
 assert.equal(message.value,'希望改进反馈入口');assert(!button.disabled);assert.equal(status.dataset.state,'error');
 const retry=submit();assert.equal(requests[1].payload.id,requests[0].payload.id);assert.equal(requests[1].payload.page,'/planner/');
 finish({ok:true,json:async()=>({ok:true,id:requests[1].payload.id})});await retry;
 assert.equal(message.value,'');assert.equal(status.dataset.state,'success');assert(button.disabled);
 message.value='还有另一条建议';message.listeners.input();const next=submit();assert.notEqual(requests[2].payload.id,requests[1].payload.id);
 finish({ok:true,json:async()=>({ok:true,id:'wrong-receipt'})});await next;assert.equal(status.dataset.state,'error');assert.equal(message.value,'还有另一条建议');
 console.log('PASS Form prevents double submit, retains failed text and retry ID, verifies receipt, and resets only after success');
}
(async()=>{await apiTests();await uiTests();})().catch(error=>{console.error(error);process.exitCode=1;});
