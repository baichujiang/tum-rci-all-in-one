/* Exercise the real invitation UI across its Berlin-time deadline. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),config=require('../content/community.json');
const source=fs.readFileSync(path.join(root,'site3/community.js'),'utf8');
function invitation(time){
 let now=Date.parse(time),timer;
 const active={hidden:true},contact={hidden:false},status={textContent:'请联系开发者获取入群方式。'};
 const image={dataset:{src:config.qrImage},removeAttribute(name){assert.equal(name,'src');delete this.src;}};
 const nodes={'[data-community-active]':active,'[data-community-contact]':contact,'[data-community-status]':status,'[data-community-qr]':image};
 const handlers={},entry={dataset:{expiresAt:config.expiresAt},querySelector:s=>nodes[s],addEventListener:(event,fn)=>{handlers[event]=fn;}};
 class Clock extends Date{static now(){return now;}}
 vm.runInNewContext(source,{Date:Clock,document:{querySelector:()=>entry,addEventListener:(event,fn)=>{handlers[event]=fn;}},window:{addEventListener:(event,fn)=>{handlers[event]=fn;}},clearTimeout(){timer=null;},setTimeout(fn,delay){timer={fn,delay};return 1;}});
 return {active,contact,status,image,handlers,setTime:time=>{now=Date.parse(time);},timer:()=>timer};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Invitation works up to the last moment before October 20 in Berlin',()=>{
 const ui=invitation('2026-10-19T23:59:59.999+02:00');
 assert.equal(ui.active.hidden,false);assert.equal(ui.contact.hidden,true);
 assert.equal(ui.image.src,config.qrImage);assert.equal(ui.timer().delay,1);
});
test('The exact deadline hides the code and offers developer contact',()=>{
 const ui=invitation('2026-10-20T00:00:00+02:00');
 assert.equal(ui.active.hidden,true);assert.equal(ui.contact.hidden,false);
 assert.equal(ui.image.src,undefined);assert(ui.status.textContent.includes('二维码已过期'));assert.equal(ui.timer(),null);
});
test('A page left open switches without a reload',()=>{
 const ui=invitation('2026-10-19T23:59:59+02:00'),callback=ui.timer().fn;
 ui.setTime('2026-10-20T00:00:00+02:00');callback();
 assert.equal(ui.active.hidden,true);assert.equal(ui.contact.hidden,false);assert.equal(ui.image.src,undefined);
});
test('Opening, resuming or restoring the page rechecks the deadline',()=>{
 for(const event of ['toggle','pageshow','visibilitychange']){
  const ui=invitation('2026-10-13T12:00:00+02:00');
  ui.setTime('2026-10-21T12:00:00+02:00');ui.handlers[event]();
  assert.equal(ui.active.hidden,true);assert.equal(ui.contact.hidden,false);assert.equal(ui.image.src,undefined);
 }
});
test('The built homepage includes the entry, deadline and contact fallback',()=>{
 const home=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
 assert(home.includes('加入 RCI 微信群'));assert(home.includes(config.validUntil));assert(home.includes(config.expiresAt));
 assert(home.includes('assets/community.js'));assert(home.includes('联系开发者'));assert(home.includes('需要 GitHub 账号'));
 assert(!/data-community-qr[^>]*\ssrc=/.test(home));
 const output=path.join(root,'dist',config.qrImage);
 assert(fs.readFileSync(output).equals(fs.readFileSync(path.join(root,config.qrImage))));
});
console.log(count+' community checks passed');
