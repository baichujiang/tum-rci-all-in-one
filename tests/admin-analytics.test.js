'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createAnalytics}=require('../lib/admin-analytics'),handler=require('../api/admin-analytics').createHandler;
const env={VERCEL:'1',BLOB_READ_WRITE_TOKEN:'synthetic',FEEDBACK_RATE_LIMIT_SECRET:'synthetic',FEEDBACK_ADMIN_PASSWORD_HASH:'scrypt:'+'a'.repeat(32)+':'+'b'.repeat(64),FEEDBACK_ADMIN_SESSION_SECRET:'synthetic-session-secret-at-least-32-characters',ANALYTICS_VERCEL_TOKEN:'synthetic-analytics-token'};
const now=Date.parse('2026-10-17T13:24:00Z'),sid='c'.repeat(64),version=crypto.createHash('sha256').update(env.FEEDBACK_ADMIN_PASSWORD_HASH).digest('hex');
const session={csrf:'d'.repeat(64),expiresAt:now+3600000,version};
const store={async get(path){return path==='admin-sessions/'+sid+'.json'?{statusCode:200,blob:{etag:'test'},stream:new Response(JSON.stringify(session)).body}:null;}};
function source(){
 const calls=[];
 return {calls,async fetch(url,options){
  calls.push({url:new URL(url),options});
  let data={visitors:5,pageviews:12};
  if(url.searchParams.get('by')==='day')data=[{timestamp:'2026-10-16T00:00:00.000Z',visitors:3,pageviews:7},{timestamp:'2026-10-17T00:00:00.000Z',visitors:4,pageviews:5}];
  if(url.searchParams.get('by')==='requestPath')data=[{requestPath:'/',visitors:5,pageviews:8},{requestPath:'/courses',visitors:2,pageviews:4},{requestPath:'Others',visitors:1,pageviews:1},{requestPath:'//evil.test',visitors:1,pageviews:1},{requestPath:'/admin/feedback',visitors:1,pageviews:1}];
  return Response.json({data});
 }};
}
async function call(api,{cookie='',url='/api/admin-analytics?days=7',method='GET'}={}){
 const req={method,url,headers:{host:'rci.test',cookie},socket:{}};
 const res={headers:{},getHeader(key){return this.headers[key.toLowerCase()];},setHeader(key,value){this.headers[key.toLowerCase()]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await api(req,res);return res;
}
async function main(){
 const {sealData}=await import('iron-session'),sealed=await sealData({sid,version},{password:env.FEEDBACK_ADMIN_SESSION_SECRET,ttl:3600}),cookie='__Host-rci-feedback-admin='+sealed;
 const upstream=source(),api=handler({...upstream,env,store,now:()=>now,log:()=>{}});
 for(const value of ['', '__Host-rci-feedback-admin=forged']){const result=await call(api,{cookie:value});assert.equal(result.code,401);assert.equal(result.headers['cache-control'],'private, no-store');assert(!result.data.totals);}
 assert.equal(upstream.calls.length,0);
 console.log('PASS Anonymous and forged sessions never query or receive analytics');
 let result=await call(api,{cookie});assert.equal(result.code,200);assert.deepEqual(result.data.totals,{visitors:5,pageviews:12});assert.equal(result.data.trend.length,7);assert.equal(result.data.trend[0].pageviews,0);assert.equal(result.data.trend.at(-1).pageviews,5);assert.deepEqual(result.data.topPages.map(row=>row.path),['/','/courses']);
 assert.equal(result.data.since,'2026-10-11T00:00:00.000Z');assert.equal(result.data.until,'2026-10-18T00:00:00.000Z');
 for(const {url,options}of upstream.calls){assert.equal(url.origin,'https://api.vercel.com');assert.equal(url.searchParams.get('projectId'),'prj_kKIaE5FAphsU2C7hdC93F9KBIzVH');assert.equal(url.searchParams.get('teamId'),'team_oF7mkDKDywaaYzrHLxxfZfrc');assert(url.searchParams.get('filter').includes("environment eq 'production'"));assert.equal(options.headers.Authorization,'Bearer synthetic-analytics-token');assert.equal(options.redirect,'error');}
 assert.equal(upstream.calls.find(call=>call.url.pathname.endsWith('/count')).url.searchParams.get('until'),'2026-10-18T00:00:00.000Z');
 assert.equal(upstream.calls.find(call=>call.url.searchParams.get('by')==='day').url.searchParams.get('until'),'2026-10-17T23:59:59.999Z');
 assert(!JSON.stringify(result.data).includes(env.ANALYTICS_VERCEL_TOKEN));assert.equal(result.headers.vary,'Cookie');
 console.log('PASS Authenticated dashboard reads real API shapes, includes today, fills missing days, and keeps period visitors deduplicated');
 await Promise.all([call(api,{cookie}),call(api,{cookie})]);assert.equal(upstream.calls.length,3);
 for(const query of ['days=365','days=7&days=30','days=7&projectId=other','days=7&filter=anything']){assert.equal((await call(api,{cookie,url:'/api/admin-analytics?'+query})).code,400);}
 assert.equal((await call(api,{cookie,method:'POST'})).code,405);assert.equal(upstream.calls.length,3);
 result=await call(api,{cookie,url:'/api/admin-analytics?days=30'});assert.equal(result.code,200);assert.equal(result.data.trend.length,30);assert.equal(upstream.calls.length,6);
 console.log('PASS Only bounded 7/30-day read-only queries are accepted; refreshes share a one-minute server cache');
 const missing=handler({env:{...env,ANALYTICS_VERCEL_TOKEN:''},store,now:()=>now,fetch:()=>{throw Error('must not query');},log:()=>{}});assert.equal((await call(missing,{cookie})).code,503);
 const failed=handler({env,store,now:()=>now,fetch:async()=>Response.json({error:'private upstream detail'},{status:403}),log:()=>{}});result=await call(failed,{cookie});assert.equal(result.code,503);assert(!JSON.stringify(result.data).includes('private upstream detail'));assert(!result.data.totals);
 const malformed=handler({env,store,now:()=>now,fetch:async()=>Response.json({data:{visitors:'5',pageviews:12}}),log:()=>{}});assert.equal((await call(malformed,{cookie})).code,503);
 session.expiresAt=now-1;assert.equal((await call(api,{cookie})).code,401);
 console.log('PASS Missing config, invalid upstream data, API denial and expired login fail closed without exposing secrets or fake zeroes');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
