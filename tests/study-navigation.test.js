/* Existing study links and the read-only planner help must not depend on plan storage. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'site3/study-entry.js'),'utf8');
function harness({desktop=true,planner=false,base='',search=''}={}){
 const replacements=[],handlers={},guide={open:false,showModal(){this.open=true;},close(){this.open=false;}};
 vm.runInNewContext(source,{URLSearchParams,window:{matchMedia:()=>({matches:desktop}),location:{search,replace:url=>replacements.push(url)}},document:{getElementById:id=>planner&&id==='plan-study-dialog'?guide:null,querySelector:()=>({content:base}),addEventListener:(event,fn)=>{handlers[event]=fn;}}});
 const click=selector=>handlers.click({target:{closest:key=>selector===key?{}:null}});
 return {guide,replacements,click};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Desktop legacy guide links lead to planner help, including a project base path',()=>{
 for(const base of ['','/rci'])assert.deepEqual(harness({base}).replacements,[base+'/planner/?guide=study']);
 assert.deepEqual(harness({desktop:false}).replacements,[]);
});
test('Planner study help opens and closes without reading or changing a plan',()=>{
 const ui=harness({planner:true});assert.equal(ui.guide.open,false);
 ui.click('[data-open-study]');assert.equal(ui.guide.open,true);
 ui.click('[data-close-study]');assert.equal(ui.guide.open,false);
 ui.click('[data-unrelated]');assert.equal(ui.guide.open,false);assert.deepEqual(ui.replacements,[]);
});
test('A legacy desktop link opens the help immediately while narrow-screen planning stays unchanged',()=>{
 assert.equal(harness({planner:true,search:'?guide=study'}).guide.open,true);
 assert.equal(harness({planner:true,desktop:false,search:'?guide=study'}).guide.open,false);
 assert.equal(harness({planner:true,search:'?guide=other'}).guide.open,false);
});
test('Published desktop navigation has three destinations and retains one set of study instructions in planner help',()=>{
 for(const page of ['index.html','planner/index.html','courses/index.html']){
  const html=fs.readFileSync(path.join(root,'dist',page),'utf8');
  const nav=html.match(/<nav class="desktop-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  const links=[...nav.matchAll(/<a class="([^"]*)" href="([^"]+)"/g)].filter(m=>!m[1].includes('desktop-legacy'));
  assert.deepEqual(links.map(m=>m[2]),['/','/courses/','/planner/'],page);
 }
 const planner=fs.readFileSync(path.join(root,'dist/planner/index.html'),'utf8');
 assert.equal((planner.match(/id="plan-study-dialog"/g)||[]).length,1);
 assert.equal((planner.match(/id="selection-title"/g)||[]).length,1);
 assert(!planner.includes('class="credit-visual"'));
 for(const required of ['G/H/I 各至少 5 ECTS','ED140014','https://matching-in.cit.tum.de/','https://campus.tum.de/','/guides/exams/','/guides/conditional-control/','assets/study-entry.js'])assert(planner.includes(required),required);
});
console.log(count+' study navigation checks passed');
