'use strict';
const assert=require('node:assert/strict');
const {sanitizeEvent,install}=require('../site3/analytics');
const origin='https://tum-rci-all-in-one.vercel.app';
const view=url=>({type:'pageview',url});
for(const url of [origin+'/search/?q=private-search',origin+'/planner/?semester=2#plan=private-plan',origin+'/feedback/?from=/planner/&token=private-token']){
 const cleaned=sanitizeEvent(view(url),origin);
 assert.equal(cleaned.url,new URL(url).origin+new URL(url).pathname);
 assert(!JSON.stringify(cleaned).includes('private-'));
}
console.log('PASS Search parameters, feedback context and shared-plan fragments are not sent');
for(const path of ['/admin','/admin/feedback/','/api/admin-feedback','/api/feedback'])assert.equal(sanitizeEvent(view(origin+path),origin),null);
assert.equal(sanitizeEvent(view(origin+'/rci/admin/feedback/'),origin,'/rci'),null);
console.log('PASS Administrator and API paths are excluded, including prefixed sites');
for(const event of [view('https://other.example/'),view('not a URL'),{type:'event',url:origin+'/'},null])assert.equal(sanitizeEvent(event,origin),null);
console.log('PASS Invalid, external and custom events are rejected');
let received=null;
assert.equal(install(options=>{received=options;},{origin,productionOrigin:origin,pathname:'/planner/'}),true);
assert.equal(received.mode,'production');assert.equal(received.debug,false);
assert.deepEqual(received.beforeSend(view(origin+'/planner/?private=value#private')),{type:'pageview',url:origin+'/planner/'});
console.log('PASS Official SDK initialization uses the page-view privacy filter');
for(const options of [
 {origin:'http://localhost:8001',productionOrigin:origin,pathname:'/'},
 {origin:'https://preview.vercel.app',productionOrigin:origin,pathname:'/'},
 {origin,productionOrigin:'',pathname:'/'},
 {origin,productionOrigin:origin,pathname:'/admin/feedback/'},
 {origin,productionOrigin:origin,pathname:'/rci/admin/feedback/',basePath:'/rci'}
])assert.equal(install(()=>assert.fail('SDK must not load here'),options),false);
console.log('PASS Local previews, preview deployments and private pages do not initialize tracking');
