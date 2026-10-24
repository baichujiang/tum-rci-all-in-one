/* Existing study links and the read-only planner help must not depend on plan storage. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'site3/study-entry.js'),'utf8');
function harness({desktop=true,planner=false,base='',search='',hash=''}={}){
 const replacements=[],handlers={},sections={},tabs={};
 function dialog(){return {open:false,handlers:{},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},addEventListener(event,fn){this.handlers[event]=fn;}};}
 const guide=dialog(),creditCheck=dialog(),returnLink={focus(){this.focused=true;}};
 creditCheck.querySelector=()=>returnLink;
 const content={scrollTop:0},nav={setAttribute(){}};
 for(const key of ['credits','deadlines','registration','sources']){
  sections['study-'+key]={hidden:false,setAttribute(){}};tabs['study-tab-'+key]={id:'study-tab-'+key,attributes:{},setAttribute(name,value){this.attributes[name]=value;},focus(){this.focused=true;}};
 }
 vm.runInNewContext(source,{URLSearchParams,window:{matchMedia:()=>({matches:desktop}),location:{search,hash,replace:url=>replacements.push(url)}},document:{getElementById:id=>planner?({'plan-study-dialog':guide,'credit-check-dialog':creditCheck,'study-rule-panels':content,'study-rule-nav':nav,...sections,...tabs}[id]||null):null,querySelector:()=>({content:base}),addEventListener:(event,fn)=>{handlers[event]=fn;}}});
 const click=(selector,dataset={})=>handlers.click({target:{closest:key=>selector===key?{dataset}:null}});
 const key=(section,key)=>{let prevented=false;handlers.keydown({key,target:{closest:()=>({dataset:{studyTab:section}})},preventDefault(){prevented=true;}});return prevented;};
 return {guide,creditCheck,returnLink,sections,tabs,content,replacements,click,key};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Legacy guide links on both screen sizes lead to the shared rules, including a project base path',()=>{
 for(const desktop of [true,false])for(const base of ['','/rci'])assert.deepEqual(harness({desktop,base}).replacements,[base+'/planner/?guide=study']);
});
test('Shared chapter links preserve known sections and discard unknown redirect input',()=>{
 for(const base of ['','/rci'])for(const section of ['credits','deadlines','registration','sources']){
  for(const hash of ['#'+section,'#study-'+section])assert.deepEqual(harness({base,hash}).replacements,[base+'/planner/?guide=study&section='+section]);
  assert.deepEqual(harness({base,search:'?section='+section}).replacements,[base+'/planner/?guide=study&section='+section]);
 }
 assert.deepEqual(harness({search:'?section=https://example.invalid/'}).replacements,['/planner/?guide=study']);
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
test('Every published page has the same three navigation labels, destinations and selection state on desktop and mobile',()=>{
 const dist=path.join(root,'dist'),base=JSON.parse(fs.readFileSync(path.join(dist,'build-info.json'),'utf8')).base;
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
 const files=walk(dist).filter(file=>file.endsWith('.html'));
 assert.equal(files.length,640+require('../data/course-topics.json').entries.length);
 for(const file of files){
  const page=path.relative(dist,file).split(path.sep).join('/'),route='/'+page.replace(/index\.html$/,'');
  const html=fs.readFileSync(file,'utf8');
  for(const selector of ['desktop-nav','mobile-bottom-nav']){
   const matches=[...html.matchAll(new RegExp('<nav class="'+selector+'"[^>]*>([\\s\\S]*?)<\\/nav>','g'))];
   assert.equal(matches.length,1,page+' '+selector+' count');
   const nav=matches[0][1];
   const links=[...nav.matchAll(/<a class="([^"]*)" href="([^"]+)"([^>]*)>/g)];
   assert.deepEqual(links.map(m=>m[2]),[base+'/',base+'/courses/',base+'/planner/'],page+' '+selector);
   const labels=[...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(m=>m[1].replace(/<span\b[^>]*\bdata-plan-count[^>]*>[\s\S]*?<\/span>/g,'').replace(/<[^>]*>/g,'').trim());
   assert.deepEqual(labels,['常用网站','选课程','我的计划'],page+' '+selector+' labels');
   assert(!nav.includes('desktop-legacy'));assert(!nav.includes('desktop-only'));assert(!nav.includes('学业规则'));
   const active=links.filter(m=>m[3].includes('aria-current="page"')).map(m=>m[2]);
   assert.deepEqual(active,route==='/'?[base+'/']:route.startsWith('/courses/')?[base+'/courses/']:route==='/planner/'?[base+'/planner/']:[],page+' '+selector);
  }
  for(const match of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)){
   if(!match[1]||match[1].startsWith('#'))continue; // In-page anchors do not enter a separate page.
   const url=new URL(match[1],'https://navigation-test.invalid'+base+route);
   if(url.origin==='https://navigation-test.invalid')assert.notEqual(decodeURIComponent(url.pathname).replace(/\/$/,''),base+'/study',page+' still links to the retired rules page');
  }
  assert(!/class="(?:resume-card|study-entry|study-nav|study-heading)"/.test(html),page+' has a retired independent component');
  if(route!=='/planner/'){
   assert(!html.includes('id="plan-study-dialog"'),page+' has a separate help dialog');
   assert(!/\sdata-open-study(?:\s|>)/.test(html),page+' has a separate rules button');
   for(const id of ['study-credits','study-deadlines','study-registration','study-sources'])assert(!html.includes('id="'+id+'"'),page+' duplicates help content');
   for(const control of html.matchAll(/<(a|button)\b[^>]*>[\s\S]*?<\/\1>/g))assert(!control[0].includes('学业规则'),page+' has a rules control');
  }
 }
 const search=JSON.parse(fs.readFileSync(path.join(dist,'assets/search-index.json'),'utf8'));
 assert(!search.docs.some(record=>record.url.split(/[?#]/)[0].replace(/\/$/,'')===base+'/study'));
 console.log('PASS Audited '+files.length+' pages and '+files.length*2+' navigation groups');
 const home=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
 assert(!home.includes('class="resume-card"'));assert(!home.includes('class="study-entry"'));assert(!home.includes('href="/study/"'));
});
test('One set of help instructions remains in the planner without separate page content',()=>{
 const planner=fs.readFileSync(path.join(root,'dist/planner/index.html'),'utf8');
 assert.equal((planner.match(/id="plan-study-dialog"/g)||[]).length,1);
 assert.equal((planner.match(/id="selection-title"/g)||[]).length,1);
 assert(!planner.includes('class="credit-visual"'));
 for(const required of ['G/H/I 各至少 5 ECTS','ED140014','https://matching-in.cit.tum.de/','https://campus.tum.de/','/guides/exams/','/guides/conditional-control/','assets/study-entry.js'])assert(planner.includes(required),required);
});
test('Only planner help contains the rules; the retired route offers a noindex compatibility link',()=>{
 const planner=fs.readFileSync(path.join(root,'dist/planner/index.html'),'utf8'),controls=fs.readFileSync(path.join(root,'site3/planning-controls.js'),'utf8');
 assert.equal((planner.match(/data-open-study /g)||[]).length,1);assert(planner.includes('class="plan-context-button plan-study-entry"'));assert(!planner.includes('plan-context-button desktop-only'));
 assert(planner.includes('<span>帮助说明</span>'));assert(planner.includes('id="plan-study-title">学分与规划说明'));assert(!planner.includes('planning-rules-dialog'));
 for(const stale of ['rulesHTML','planning-rules-content','data-open-planning-rules','plan-rules-link'])assert(!controls.includes(stale),stale);
 for(const required of ['study-credits','study-deadlines','study-registration','study-sources','第 5 学期末至少 90 ECTS','第 7 学期末前完成全部毕业要求','已参加但未通过','最终未通过','APSO §10(4)–(7)','P009252245'])assert(planner.includes(required),required);
 const fallback=fs.readFileSync(path.join(root,'dist/study/index.html'),'utf8');
 assert(fallback.includes('href="/planner/?guide=study"'));assert(fallback.includes('assets/study-entry.js'));assert(fallback.includes('content="noindex,follow"'));
 for(const section of ['study-credits','study-deadlines','study-registration','study-sources'])assert(!fallback.includes('id="'+section+'"'));
});
console.log(count+' study navigation checks passed');
