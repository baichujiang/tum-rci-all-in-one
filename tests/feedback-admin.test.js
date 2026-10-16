'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {BlobNotFoundError,BlobPreconditionFailedError}=require('@vercel/blob');
const {hashPassword}=require('../lib/feedback-admin');
const sessionHandler=require('../api/admin-session').createHandler,inboxHandler=require('../api/admin-feedback').createHandler,feedbackHandler=require('../api/feedback').createHandler;
const password='Synthetic test password, never used in deployment';
async function fixture(){
 let timestamp=Date.now(),sequence=0,unavailable=false;
 const records=new Map(),counts={list:0};
 const env={VERCEL:'1',BLOB_READ_WRITE_TOKEN:'test-only',FEEDBACK_RATE_LIMIT_SECRET:'test-rate-secret',FEEDBACK_ADMIN_PASSWORD_HASH:await hashPassword(password),FEEDBACK_ADMIN_SESSION_SECRET:'test-session-secret-with-at-least-32-characters'};
 const store={
  async get(key,options){assert.equal(options.access,'private');assert.equal(options.useCache,false);if(unavailable)throw Error('offline');const entry=records.get(key);if(!entry)return null;return {statusCode:200,blob:{etag:entry.etag},stream:new Response(JSON.stringify(entry.data)).body};},
  async head(key){if(unavailable)throw Error('offline');if(!records.has(key))throw new BlobNotFoundError();return {};},
  async put(key,text,options){
   assert.equal(options.access,'private');if(unavailable)throw Error('offline');const previous=records.get(key);
   if(options.ifMatch&&options.ifMatch!==previous?.etag)throw new BlobPreconditionFailedError();
   if(previous&&!options.allowOverwrite)throw Error('exists');
   const entry={data:JSON.parse(text),etag:'"test-'+(++sequence)+'"',uploadedAt:new Date(timestamp)};records.set(key,entry);return {etag:entry.etag};
  },
  async del(key){if(unavailable)throw Error('offline');records.delete(key);},
  async list({prefix,cursor}){counts.list++;if(unavailable)throw Error('offline');const all=[...records].filter(([key])=>key.startsWith(prefix)).map(([pathname,entry])=>({pathname,uploadedAt:entry.uploadedAt})),offset=Number(cursor||0),blobs=all.slice(offset,offset+7);return {blobs,hasMore:offset+7<all.length,cursor:String(offset+7)};}
 };
 const deps={store,env,now:()=>timestamp,log:()=>{}};
 return {records,store,env,counts,session:sessionHandler(deps),inbox:inboxHandler(deps),feedback:feedbackHandler(deps),advance:ms=>timestamp+=ms,offline:()=>unavailable=true};
}
async function call(handler,{method='GET',body,headers={},cookie='',url='/api/admin-feedback'}={}){
 const req={method,url,headers:{host:'rci.test',origin:'https://rci.test','content-type':'application/json','x-vercel-forwarded-for':'192.0.2.1',cookie,...headers},body,socket:{}};
 const res={headers:{},headersSent:false,getHeader(key){return this.headers[key.toLowerCase()];},setHeader(key,value){this.headers[key.toLowerCase()]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await handler(req,res);return res;
}
function cookieFrom(response){const value=response.headers['set-cookie'];return (Array.isArray(value)?value[0]:value).split(';')[0];}
async function login(f){const result=await call(f.session,{method:'POST',body:{password}});assert.equal(result.code,200,JSON.stringify(result.data));return {cookie:cookieFrom(result),csrf:result.data.csrf,result};}
async function submit(f,message='希望改善网站入口'){
 f.advance(10001);const id=crypto.randomUUID(),data={id,type:'feature',message,page:'/planner/'};
 const response=await call(f.feedback,{method:'POST',body:data});assert.equal(response.code,201);
 return [...f.records.keys()].find(key=>key.startsWith('feedback/'+id)).slice('feedback/'.length);
}
async function main(){
 const f=await fixture();
 let response=await call(f.session);assert.equal(response.code,200);assert.equal(response.data.authenticated,false);
 for(const cookie of ['', '__Host-rci-feedback-admin=admin']){response=await call(f.inbox,{cookie});assert.equal(response.code,401);assert(!response.data.items);assert.equal(response.headers['cache-control'],'private, no-store');}
 assert.equal(f.counts.list,0);
 response=await call(f.session,{method:'POST',body:{password},headers:{origin:'https://evil.test'}});assert.equal(response.code,403);assert.equal(f.records.size,0);
 response=await call(f.session,{method:'POST',body:{password},headers:{'content-type':'text/plain'}});assert.equal(response.code,415);
 response=await call(f.session,{method:'POST',body:{password:'incorrect'}});assert.equal(response.code,401);assert(!response.headers['set-cookie']);
 const account=await login(f),cookie=account.cookie,csrf=account.csrf;
 const setCookie=String(account.result.headers['set-cookie']);assert(setCookie.includes('HttpOnly'));assert(setCookie.includes('Secure'));assert(setCookie.includes('SameSite=Strict'));assert(setCookie.includes('__Host-'));
 assert(/^[a-f0-9]{64}$/.test(csrf));assert(!JSON.stringify(account.result.data).includes(password));
 assert.equal((await call(f.session,{cookie})).data.authenticated,true);
 const key=await submit(f,'<img src=x onerror=alert(1)>\n反馈应按原文显示。');
 response=await call(f.inbox,{cookie});assert.equal(response.code,200);assert.equal(response.data.items.length,1);let item=response.data.items[0];assert.equal(item.key,key);assert.equal(item.status,'pending');assert.equal(item.version,null);assert(item.message.startsWith('<img'));
 console.log('PASS Unauthenticated and forged sessions cannot read feedback; login requires the one password and issues a secure cookie');
 const patch={key,status:'progress',version:null};
 for(const headers of [{origin:'https://evil.test','x-csrf-token':csrf},{'x-csrf-token':'wrong'},{}]){response=await call(f.inbox,{method:'PATCH',cookie,body:patch,headers});assert.equal(response.code,403);}
 response=await call(f.inbox,{method:'PATCH',cookie,body:patch,headers:{'x-csrf-token':csrf}});assert.equal(response.code,200);const version=response.data.version;
 assert.equal((await call(f.inbox,{cookie})).data.items[0].status,'progress');
 response=await call(f.inbox,{method:'PATCH',cookie,body:{...patch,status:'resolved'},headers:{'x-csrf-token':csrf}});assert.equal(response.code,409);
 response=await call(f.inbox,{method:'PATCH',cookie,body:{...patch,status:'resolved',version},headers:{'x-csrf-token':csrf}});assert.equal(response.code,200);
 const resolvedVersion=response.data.version,originalPut=f.store.put;
 f.store.put=async function(path,text,options){
  if(path==='feedback-status/'+key){f.store.put=originalPut;const previous=f.records.get(path);f.records.set(path,{...previous,etag:'"concurrent-write"'});}
  return originalPut(path,text,options);
 };
 response=await call(f.inbox,{method:'PATCH',cookie,body:{key,status:'progress',version:resolvedVersion},headers:{'x-csrf-token':csrf}});assert.equal(response.code,409);assert.equal(f.records.get('feedback-status/'+key).data.status,'resolved');
 assert.equal(f.records.get('feedback/'+key).data.message,'<img src=x onerror=alert(1)>\n反馈应按原文显示。');
 response=await call(f.inbox,{method:'PATCH',cookie,body:{...patch,key:'../../admin-sessions/file'},headers:{'x-csrf-token':csrf}});assert.equal(response.code,400);
 response=await call(f.inbox,{method:'PATCH',cookie,body:{...patch,status:'delete'},headers:{'x-csrf-token':csrf}});assert.equal(response.code,400);
 console.log('PASS Status updates require same origin and CSRF, persist separately, and reject stale versions and path traversal');
 for(let i=0;i<25;i++)await submit(f,'分页反馈 '+i);
 response=await call(f.inbox,{cookie});assert.equal(response.data.items.length,20);assert(response.data.nextCursor);const firstKeys=new Set(response.data.items.map(x=>x.key)),cursor=response.data.nextCursor;
 await submit(f,'分页期间新到的反馈');
 response=await call(f.inbox,{cookie,url:'/api/admin-feedback?cursor='+cursor});assert.equal(response.data.items.length,6);assert(response.data.items.every(x=>!firstKeys.has(x.key)));
 response=await call(f.inbox,{cookie,url:'/api/admin-feedback?status=resolved'});assert.equal(response.data.items.length,1);assert.equal(response.data.items[0].key,key);
 for(const query of ['?status=bad','?cursor=bad'])assert.equal((await call(f.inbox,{cookie,url:'/api/admin-feedback'+query})).code,400);
 response=await call(f.session,{cookie,method:'DELETE'});assert.equal(response.code,403);
 response=await call(f.session,{cookie,method:'DELETE',headers:{'x-csrf-token':csrf}});assert.equal(response.code,200);assert(String(response.headers['set-cookie']).includes('Max-Age=0'));
 assert.equal((await call(f.inbox,{cookie})).code,401);assert.equal((await call(f.session,{cookie})).data.authenticated,false);
 console.log('PASS Newest-first pagination survives new arrivals, state filters work, and logout revokes the saved session');
 const second=await login(f);f.advance(8*3600000+1);assert.equal((await call(f.inbox,{cookie:second.cookie})).code,401);
 const third=await login(f);const old=f.env.FEEDBACK_ADMIN_PASSWORD_HASH;f.env.FEEDBACK_ADMIN_PASSWORD_HASH=old.slice(0,-1)+(old.endsWith('0')?'1':'0');assert.equal((await call(f.inbox,{cookie:third.cookie})).code,401);f.env.FEEDBACK_ADMIN_PASSWORD_HASH=old;
 f.offline();response=await call(f.inbox,{cookie:third.cookie});assert.equal(response.code,503);assert(!response.data.items);
 const limited=await fixture();for(let i=0;i<5;i++)assert.equal((await call(limited.session,{method:'POST',body:{password:'wrong'}})).code,401);response=await call(limited.session,{method:'POST',body:{password}});assert.equal(response.code,429);assert.equal(response.headers['retry-after'],'900');
 limited.advance(900001);assert.equal((await login(limited)).result.code,200);
 const unconfigured=sessionHandler({env:{},log:()=>{}});assert.equal((await call(unconfigured)).code,503);
 console.log('PASS Expiry, password rotation, storage failure, distributed login limits and missing config all fail closed');
 const paged=await fixture(),owner=await login(paged);
 for(let i=0;i<105;i++){const entry=await submit(paged,'筛选翻页测试 '+i);if(i)await paged.store.put('feedback-status/'+entry,JSON.stringify({status:'resolved',updatedAt:new Date().toISOString()}),{access:'private',allowOverwrite:false});}
 response=await call(paged.inbox,{cookie:owner.cookie,url:'/api/admin-feedback?status=pending'});assert.equal(response.data.items.length,0);assert(response.data.nextCursor);
 response=await call(paged.inbox,{cookie:owner.cookie,url:'/api/admin-feedback?status=pending&cursor='+response.data.nextCursor});assert.equal(response.data.items.length,1);assert.equal(response.data.items[0].message,'筛选翻页测试 0');assert.equal(response.data.nextCursor,null);
 console.log('PASS A sparse state filter exposes continuation instead of incorrectly claiming there are no older matches');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
