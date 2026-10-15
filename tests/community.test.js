/* Exercise the real invitation UI across its Berlin-time deadline. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),config=require('../content/community.json');
const source=fs.readFileSync(path.join(root,'site3/community.js'),'utf8');
function invitation(time,desktop=true){
 let now=Date.parse(time),timer;
 const active={hidden:true},contact={hidden:false},status={textContent:'请联系开发者获取入群方式。'};
 const image={dataset:{src:config.qrImage},removeAttribute(name){assert.equal(name,'src');delete this.src;}};
 const nodes={'[data-community-active]':active,'[data-community-contact]':contact,'[data-community-status]':status,'[data-community-qr]':image};
 const hero={append(card){card.parentElement=this;}},slot={append(card){card.parentElement=this;}},card={parentElement:hero};
 const media={matches:desktop,addEventListener(event,fn){assert.equal(event,'change');this.change=fn;}};
 const handlers={},entry={dataset:{expiresAt:config.expiresAt},closest:s=>{assert.equal(s,'.community-card');return card;},querySelector:s=>nodes[s],addEventListener:(event,fn)=>{handlers[event]=fn;}};
 class Clock extends Date{static now(){return now;}}
 vm.runInNewContext(source,{Date:Clock,document:{querySelector:s=>s==='[data-community]'?entry:s==='[data-community-slot]'?slot:null,addEventListener:(event,fn)=>{handlers[event]=fn;}},window:{matchMedia:query=>{assert.equal(query,'(min-width:721px)');return media;},addEventListener:(event,fn)=>{handlers[event]=fn;}},clearTimeout(){timer=null;},setTimeout(fn,delay){timer={fn,delay};return 1;}});
 return {active,contact,status,image,handlers,card,hero,slot,setDesktop:value=>{media.matches=value;media.change();},setTime:time=>{now=Date.parse(time);},timer:()=>timer};
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
test('Desktop placement moves the same card to the bottom and keeps the narrow-screen position',()=>{
 const ui=invitation('2026-10-15T12:00:00+02:00');
 assert.equal(ui.card.parentElement,ui.slot);
 ui.setDesktop(false);assert.equal(ui.card.parentElement,ui.hero);
 ui.setDesktop(true);assert.equal(ui.card.parentElement,ui.slot);
 const narrow=invitation('2026-10-15T12:00:00+02:00',false);
 assert.equal(narrow.card.parentElement,narrow.hero);
});
test('Moving the card preserves its expiry refresh and contact fallback',()=>{
 const ui=invitation('2026-10-19T23:59:59+02:00');
 ui.setDesktop(false);ui.setDesktop(true);
 ui.setTime('2026-10-20T00:00:00+02:00');ui.handlers.toggle();
 assert.equal(ui.active.hidden,true);assert.equal(ui.contact.hidden,false);assert.equal(ui.image.src,undefined);
});
test('The built homepage includes the entry, deadline and contact fallback',()=>{
 const home=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
 assert(home.includes('加入 RCI 微信群'));assert(home.includes(config.validUntil));assert(home.includes(config.expiresAt));
 assert(home.includes('assets/community.js'));assert(home.includes('联系开发者'));assert(home.includes('需要 GitHub 账号'));
 assert(!/data-community-qr[^>]*\ssrc=/.test(home));
 assert.equal((home.match(/data-community /g)||[]).length,1);
 assert.equal((home.match(/data-community-slot/g)||[]).length,1);
 assert(home.indexOf('data-community-slot')>home.indexOf('id="websites"'));
 const output=path.join(root,'dist',config.qrImage);
 assert(fs.readFileSync(output).equals(fs.readFileSync(path.join(root,config.qrImage))));
});
console.log(count+' community checks passed');
