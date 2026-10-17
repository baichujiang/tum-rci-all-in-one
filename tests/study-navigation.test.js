/* Existing study links and the read-only planner help must not depend on plan storage. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'site3/study-entry.js'),'utf8');
function harness({desktop=true,planner=false,base='',search=''}={}){
 const replacements=[],handlers={},sections={},tabs={};
 function dialog(){return {open:false,handlers:{},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},addEventListener(event,fn){this.handlers[event]=fn;}};}
 const guide=dialog(),creditCheck=dialog(),returnLink={focus(){this.focused=true;}};
 creditCheck.querySelector=()=>returnLink;
 const content={scrollTop:0},nav={setAttribute(){}};
 for(const key of ['credits','deadlines','registration','sources']){
  sections['study-'+key]={hidden:false,setAttribute(){}};tabs['study-tab-'+key]={id:'study-tab-'+key,attributes:{},setAttribute(name,value){this.attributes[name]=value;},focus(){this.focused=true;}};
 }
 vm.runInNewContext(source,{URLSearchParams,window:{matchMedia:()=>({matches:desktop}),location:{search,replace:url=>replacements.push(url)}},document:{getElementById:id=>planner?({'plan-study-dialog':guide,'credit-check-dialog':creditCheck,'study-rule-panels':content,'study-rule-nav':nav,...sections,...tabs}[id]||null):null,querySelector:()=>({content:base}),addEventListener:(event,fn)=>{handlers[event]=fn;}}});
 const click=(selector,dataset={})=>handlers.click({target:{closest:key=>selector===key?{dataset}:null}});
 const key=(section,key)=>{let prevented=false;handlers.keydown({key,target:{closest:()=>({dataset:{studyTab:section}})},preventDefault(){prevented=true;}});return prevented;};
 return {guide,creditCheck,returnLink,sections,tabs,content,replacements,click,key};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Legacy guide links on both screen sizes lead to the shared rules, including a project base path',()=>{
 for(const desktop of [true,false])for(const base of ['','/rci'])assert.deepEqual(harness({desktop,base}).replacements,[base+'/planner/?guide=study']);
});
test('Planner study help opens and closes without reading or changing a plan',()=>{
 for(const desktop of [true,false]){
 const ui=harness({planner:true,desktop});assert.equal(ui.guide.open,false);
 ui.click('[data-open-study]');assert.equal(ui.guide.open,true);
 ui.click('[data-close-study]');assert.equal(ui.guide.open,false);
 ui.click('[data-unrelated]');assert.equal(ui.guide.open,false);assert.deepEqual(ui.replacements,[]);
 }
});
test('Direct links open the same rules on desktop and mobile and can select the progress chapter',()=>{
 for(const desktop of [true,false]){
  assert.equal(harness({planner:true,desktop,search:'?guide=study'}).guide.open,true);
  const ui=harness({planner:true,desktop,search:'?guide=study&section=deadlines'});
  assert(ui.guide.open);assert(!ui.sections['study-deadlines'].hidden);assert(ui.sections['study-credits'].hidden);assert.equal(ui.tabs['study-tab-deadlines'].attributes['aria-selected'],'true');
 }
 assert.equal(harness({planner:true,search:'?guide=other'}).guide.open,false);
});
test('Progress links select their chapter, then restore the credit check even after Escape',()=>{
 const ui=harness({planner:true});ui.creditCheck.showModal();
 ui.click('[data-open-study]',{studySection:'deadlines'});assert(ui.guide.open);assert(!ui.creditCheck.open);
 assert(!ui.sections['study-deadlines'].hidden);assert(ui.sections['study-credits'].hidden);assert.equal(ui.content.scrollTop,0);
 ui.guide.close();assert(ui.creditCheck.open);assert(ui.returnLink.focused);
 ui.creditCheck.close();ui.click('[data-open-study]');ui.click('[data-close-study]');assert(!ui.creditCheck.open);
});
test('Chapter tabs switch only the content, reset its own scroll, and ignore unknown targets',()=>{
 const ui=harness({planner:true});ui.click('[data-open-study]');ui.content.scrollTop=450;
 ui.click('[data-study-tab]',{studyTab:'sources'});assert(!ui.sections['study-sources'].hidden);assert(ui.sections['study-credits'].hidden);assert.equal(ui.content.scrollTop,0);
 assert.equal(ui.tabs['study-tab-sources'].attributes['aria-selected'],'true');assert.equal(ui.tabs['study-tab-sources'].tabIndex,0);
 ui.click('[data-study-tab]',{studyTab:'unknown'});assert(!ui.sections['study-sources'].hidden);assert(ui.sections['study-deadlines'].hidden);
 ui.click('[data-close-study]');ui.click('[data-open-study]');assert(!ui.sections['study-credits'].hidden);assert(ui.sections['study-sources'].hidden);
});
test('Keyboard navigation wraps between tabs and supports Home and End',()=>{
 const ui=harness({planner:true});ui.click('[data-open-study]');
 assert(ui.key('credits','ArrowLeft'));assert(!ui.sections['study-sources'].hidden);assert(ui.tabs['study-tab-sources'].focused);
 assert(ui.key('sources','ArrowRight'));assert(!ui.sections['study-credits'].hidden);
 assert(ui.key('credits','End'));assert(!ui.sections['study-sources'].hidden);
 assert(ui.key('sources','Home'));assert(!ui.sections['study-credits'].hidden);
 assert(!ui.key('credits','Tab'));
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
test('Rules have one static entry on both screen sizes and are fully removed from planning settings',()=>{
 const planner=fs.readFileSync(path.join(root,'dist/planner/index.html'),'utf8'),controls=fs.readFileSync(path.join(root,'site3/planning-controls.js'),'utf8');
 assert.equal((planner.match(/data-open-study /g)||[]).length,1);assert(planner.includes('class="plan-context-button plan-study-entry"'));assert(!planner.includes('plan-context-button desktop-only'));
 assert(planner.includes('id="plan-study-title">学分与学业规则'));assert(!planner.includes('planning-rules-dialog'));
 for(const stale of ['rulesHTML','planning-rules-content','data-open-planning-rules','plan-rules-link'])assert(!controls.includes(stale),stale);
 for(const required of ['study-credits','study-deadlines','study-registration','study-sources','第 5 学期末至少 90 ECTS','第 7 学期末前完成全部毕业要求','已参加但未通过','最终未通过','APSO §10(4)–(7)','P009252245'])assert(planner.includes(required),required);
 const fallback=fs.readFileSync(path.join(root,'dist/study/index.html'),'utf8');assert(fallback.includes('<h1>学分与学业规则</h1>'));
 for(const section of ['study-credits','study-deadlines','study-registration','study-sources'])assert(fallback.includes('id="'+section+'"'));
});
console.log(count+' study navigation checks passed');
