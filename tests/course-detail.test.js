/* Course actions preserve records; useful facts are public and audit details are not. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const C=require('../assets/core'),view=require('../scripts/course_detail_view'),D=require('../site3/course-detail'),courses=require('../scripts/load-courses')(),summaries=require('../content/course-summaries.json').courses;
const known=new Map(courses.map(c=>[c.module_code,c])),inventory=require('../data/official-curriculum.json');
const evidence=require('../data/course-content-evidence.json'),validateContent=require('../scripts/course_content');
const client=fs.readFileSync(path.join(__dirname,'../site3/course-detail.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve)),clone=x=>JSON.parse(JSON.stringify(x));
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
function element(){return {value:'',innerHTML:'',textContent:'',disabled:true,hidden:true,dataset:{},handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};}
async function harness({code='IN2346',items=[],query='?semester=1',desktop=true}={}){
 let p=C.validatePlan({version:5,cohort:'2026/27冬季',conditional:false,conditionalConfirmed:true,items},courses),fail=false,cancel=false,persisted=true,writes=0,lastURL='',release;
 const nodes=Object.fromEntries(['[data-detail-semester]','[data-course-detail-add]','#course-detail-status','[data-detail-undo]','[data-detail-back]'].map(k=>[k,element()])),related=[{href:'/courses/IN2389/'}];
 nodes['[data-detail-back]'].lastChild={textContent:''};const box={dataset:{courseCode:code},querySelector:s=>nodes[s],querySelectorAll:()=>related};const events={},calls=[];
 const U={base:'',get persisted(){return persisted;},data:async()=>({courses}),plan:async()=>clone(p),addCourse:async(code,semester,options)=>{calls.push({code,semester,options});if(release)await new Promise(resolve=>release.resolve=resolve);if(fail)throw Error('保存失败，请重试。');if(cancel)return {kind:'cancelled'};const previous=p.items.find(x=>x.code===code),applied=previous?{...previous,semester}:{code,semester,status:'planned',locked:false};p={...p,items:[...p.items.filter(x=>x.code!==code),applied]};writes++;events['rci:planchange']?.();return {kind:previous?'moved':'added',code,semester,previous,applied};},undoCourse:async change=>{p={...p,items:p.items.filter(x=>x.code!==change.code)};if(change.previous)p.items.push(change.previous);writes++;events['rci:planchange']?.();}};
 vm.runInNewContext(client,{RCI:C,RCIUI:U,URL,URLSearchParams,location:{origin:'http://localhost:8001',pathname:'/courses/'+code+'/',search:query,hash:''},history:{replaceState(_a,_b,url){lastURL=url;}},document:{getElementById:()=>box},matchMedia:()=>({matches:desktop,addEventListener(){}}),addEventListener:(type,fn)=>events[type]=fn});await tick();
 return {nodes,calls,related,plan:()=>clone(p),writes:()=>writes,url:()=>lastURL,fail:()=>fail=true,cancel:()=>cancel=true,unsaved:()=>persisted=false,defer:()=>{release={};return release;},refresh:async items=>{p={...p,items};await events['rci:planchange']();await tick();}};
}
(async()=>{
 await test('Course content is useful while audit details stay out of every course page',()=>{
  const c=known.get('IN2346'),html=view({course:c,summary:summaries.IN2346,translation:'深度学习导论'});
  assert(html.includes('冬季／夏季'));assert(html.includes('英语'));assert(html.includes('data-course-detail-add'));assert(html.includes('data-detail-semester'));assert(html.includes('神经网络'));assert(html.includes('MA0901'));assert(html.includes('90分钟'));
  assert(html.includes('modules/detail/light/1334293/study-year/1623'));assert(html.includes('反向传播'));assert(html.includes('PyTorch'));assert(html.includes('整个学期约 180 小时'));assert(html.includes('上课 60 小时 · 自学 120 小时'));assert(!html.includes('这门课怎么用在你的计划中'));
  for(const c of courses){const rendered=view({course:c,summary:summaries[c.module_code]});for(const internal of ['来源与核查记录','course-detail-sources','独立人工复核','官方先修字段摘录','目录核查：'])assert(!rendered.includes(internal),c.module_code+': '+internal);}
  const withoutSummary=view({course:known.get('IN2123')});assert(!withoutSummary.includes('这门课学什么'));assert(withoutSummary.includes('官方课程介绍'));
 });
 await test('Every published course has a field-by-field content decision with matching official source evidence',()=>{
  validateContent(summaries,evidence,courses,inventory);assert.equal(Object.keys(summaries).length,595);
  assert.equal(Object.values(summaries).filter(s=>s.source_type==='module_handbook').length,593);
  assert.equal(Object.values(summaries).filter(s=>s.overview_cn).length,549);
  for(const code of ['MA8113','IN3150','SOT56601','SOT82136'])assert(!summaries[code]);
  for(const c of courses){const s=summaries[c.module_code],html=view({course:c,summary:s,catalog:courses}),text=html.replace(/<[^>]+>/g,'');assert(html.includes('这门课学什么'),c.module_code);assert(html.includes('上课与考核'),c.module_code);for(const key of ['teaching_cn','assessment_cn'])if(s[key])assert(text.includes(C.esc(s[key])),c.module_code+': '+key);if(s.workload_hours)assert(html.includes('预计投入'));assert(!/\bundefined\b|>null</.test(html),c.module_code);}
 });
 await test('Missing content does not hide known teaching and assessment, or create a guessed description',()=>{
  const fallback=view({course:known.get('IN9003'),summary:summaries.IN9003});
  assert(fallback.includes('暂未找到官方课程内容介绍'));assert(fallback.includes('法规附件列为讲授课'));assert(fallback.includes('60—90分钟笔试'));assert(fallback.includes('查看官方依据'));assert(!fallback.includes('官方课程介绍'));
  const missing=view({course:known.get('SZ1235'),summary:summaries.SZ1235});assert(missing.includes('官方手册暂未提供内容介绍'));assert(missing.includes('手册未提供上课方式和考试说明'));assert(!missing.includes('course-workload'));assert(!summaries.SZ1235.overview_cn);
  const unclear=view({course:known.get('SOT86081'),summary:summaries.SOT86081});assert(unclear.includes('手册还没写清'));assert(!unclear.includes('In Progress'));
 });
 await test('Historical handbook and course-page content is labelled before the description',()=>{
  for(const [code,period] of [['IN2123','2014年夏季'],['MW2352','2025年夏季'],['WI000159','2024年夏季'],['IN2404','2023年冬季']]){
   const s=summaries[code],html=view({course:known.get(code),summary:s});assert.equal(s.source_current_year,false);assert(html.includes(period),code);assert(html.indexOf(period)<html.indexOf(s.overview_cn),code);assert(html.includes('本学期安排需确认'));
  }
 });
 await test('Partial workload stays partial, and contradictory source totals are not presented as valid estimates',()=>{
  const partial=view({course:known.get('IN2320'),summary:summaries.IN2320});assert(partial.includes('整个学期约 900 小时'));assert(partial.includes('自学 900 小时'));assert(!partial.includes('上课 undefined'));assert(!partial.includes('上课 0 小时'));
  for(const code of ['ED150018','SZ0514']){const html=view({course:known.get(code),summary:summaries[code]});assert(html.includes('总时长和分项对不上'));assert(!html.includes('整个学期约'));assert(!summaries[code].workload_hours);assert(evidence.courses[code].workload_values.total);}
 });
 await test('Course-specific assessment and non-duplication conditions survive expansion beyond the original eight',()=>{
  const content=code=>view({course:known.get(code),summary:summaries[code]});
  assert(content('IN2390').includes('15分钟口试占1/3'));assert(!content('IN2390').includes('60分钟笔试'));
  assert(content('CIT433021').includes('8至10'));assert(content('SOT86061').includes('60%'));assert(content('SOT86061').includes('40%'));
  assert(content('SZ1408').includes('提交音频文件'));assert(content('WI000159').includes('展示占70%'));
  for(const [code,text] of [['MW0538','MW1420'],['ED160053','已通过 MW2391'],['IN2389','只能选一门计入学位'],['SZ2001','语言名称不一致']]){const html=content(code),requirements=html.match(/<section[^>]+id="course-requirements"[\s\S]*?<\/section>/)?.[0];assert(requirements?.includes(text),code);assert(!requirements.includes('<details'),code);}
 });
 await test('Related course comparisons use explicit alternative and recognition relationships, preserving base paths and credits',()=>{
  const html=view({course:known.get('IN2390'),summary:summaries.IN2390,catalog:courses,base:'/rci'});assert(html.includes('href="/rci/courses/IN2389/"'));assert(html.includes(C.esc(C.courseName(known.get('IN2389')))));
  assert.deepEqual(view.relatedCourses(known.get('IN2067'),courses).map(c=>c.module_code),['ED160028']);
  assert(html.includes('IN2389 和 IN2390 只能选一门计入学位。'));assert(!html.includes('未注明考试通过要求'));
  assert(view.relatedCourses(known.get('SOT86061'),courses).some(c=>c.module_code==='SOT86060'));
  assert.deepEqual(view.relatedCourses(known.get('CIT433021'),courses),[]);
  for(const c of courses){const html=view({course:c,summary:summaries[c.module_code],catalog:courses,base:'/rci'});if(html.includes('href="#course-requirements"'))assert(html.includes('id="course-requirements"'),c.module_code);assert.equal((html.match(/data-course-detail-add/g)||[]).length,1,c.module_code);assert.equal((html.match(/id="detail-semester"/g)||[]).length,1,c.module_code);}
 });
 await test('Publishing rejects forgotten courses, unsupported text, changed sources and invented workload breakdowns',()=>{
  const check=mutate=>{const s=clone(summaries),r=clone(evidence);mutate(s,r);assert.throws(()=>validateContent(s,r,courses,inventory));};
  check(s=>delete s.IN2390);
  check(s=>s.SZ1235.overview_cn='按课程名编写的介绍');
  check((s,r)=>{s.IN2346.source_sha256=r.courses.IN2346.source_sha256='0'.repeat(64);});
  check(s=>s.IN2320.workload_hours.contact=0);
  check(s=>s.ED150018.workload_hours={total:90,contact:30,self_study:60});
  check((s,r)=>{s.IN2123.source_current_year=r.courses.IN2123.source_current_year=true;});
 });
 await test('Student notices preserve eligibility requirements without repeating maintenance conclusions',()=>{
  const language=view({course:known.get('SZ1408'),summary:summaries.SZ1408});assert(language.includes('非母语要求'));assert(language.includes('学分认可'));assert(language.includes('最多计入6 ECTS'));assert(!language.includes('具体未来班次'));
  const law=view({course:known.get('SOT86061'),summary:summaries.SOT86061});assert(law.includes('存在内容重叠'));assert(!law.includes('无申请或先修要求'));
 });
 await test('Credit conflicts, old-year descriptions and specific J conditions stay visible in the main course content',()=>{
  for(const [code,expected] of [['CLA31307','课程目录没有提供学分'],['SOT10082','模块手册列出 3 ECTS'],['IN2123','只能找到旧版课程说明'],['SZ0471','75%']]){const html=view({course:known.get(code)});assert(html.includes(expected),code);assert(html.indexOf(expected)<html.indexOf('course-detail-footer'),code);assert(!/<details[^>]*>[\s\S]*选课前需要确认/.test(html),code);}
  const html=view({course:{...known.get('IN2067'),module_name_current:'<script>bad()</script>'}});assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>bad'));
 });
 await test('Action states protect passed grades, unknown credits and recognized custom records',()=>{
  const c=known.get('CLA31307');assert(D.action(c,null,1).disabled);assert(D.action(c,{custom:true,ects:3,semester:1,status:'planned'},2).label.includes('移到'));assert(D.action(c,{custom:true,ects:3,semester:1,status:'passed'},2).disabled);
  assert.equal(D.action(known.get('IN2346'),{status:'planned',semester:2},2).label,'已在第 2 学期');
 });
 await test('Return links retain local directory filters and reject external or unexpected destinations',()=>{
  const valid='/rci/courses/?q=IN2346&group=G&semester=2';assert.equal(D.backURL(valid,'/rci','https://example.test'),valid);
  assert.equal(D.backURL(valid+'#directory-course-IN2346','/rci','https://example.test'),valid+'#directory-course-IN2346');
  for(const hash of ['#outside','#directory-course-<script>','#directory-course-../admin'])assert.equal(D.backURL(valid+hash,'/rci','https://example.test'),valid);
  for(const invalid of ['//evil.test/courses/','https://evil.test/','/rci/admin/feedback/','/rci/courses/../feedback/','/rci\\courses/','javascript:alert(1)'])assert.equal(D.backURL(invalid,'/rci','https://example.test'),'/rci/courses/');
 });
 await test('Selecting a semester changes only the destination until the student adds; add and undo use the guarded API',async()=>{
  const h=await harness();assert(!h.nodes['[data-course-detail-add]'].disabled);h.nodes['[data-detail-semester]'].value='3';h.nodes['[data-detail-semester]'].handlers.change();assert.equal(h.writes(),0);assert(h.url().includes('semester=3'));
  await h.nodes['[data-course-detail-add]'].handlers.click();assert.equal(h.calls[0].semester,3);assert.equal(h.calls[0].options.moveExisting,true);assert.equal(h.plan().items[0].semester,3);assert(!h.nodes['[data-detail-undo]'].hidden);await h.nodes['[data-detail-undo]'].handlers.click();assert.equal(h.plan().items.length,0);
 });
 await test('Comparing an alternative retains the target semester and safe directory filters without changing the plan',async()=>{
  const from='/courses/?q=deep&group=G',h=await harness({code:'IN2390',query:'?semester=2&from='+encodeURIComponent(from)});
  let u=new URL(h.related[0].href,'http://localhost:8001');assert.equal(u.pathname,'/courses/IN2389/');assert.equal(u.searchParams.get('semester'),'2');assert.equal(u.searchParams.get('from'),from);
  h.nodes['[data-detail-semester]'].value='4';h.nodes['[data-detail-semester]'].handlers.change();u=new URL(h.related[0].href,'http://localhost:8001');assert.equal(u.searchParams.get('semester'),'4');assert.equal(h.writes(),0);
  const unsafe=await harness({query:'?from='+encodeURIComponent('https://evil.test/')});assert.equal(new URL(unsafe.related[0].href,'http://localhost:8001').searchParams.get('from'),'/courses/');
 });
 await test('Existing and passed records keep their status and metadata across detail actions and cross-page updates',async()=>{
  const item={code:'IN2346',name:'学校认可记录',group:'H',ects:7.5,custom:true,status:'planned',semester:1,locked:true},h=await harness({items:[item],query:'?semester=2'});
  await h.nodes['[data-course-detail-add]'].handlers.click();assert.deepEqual(h.plan().items[0],{...item,semester:2});await h.nodes['[data-detail-undo]'].handlers.click();assert.deepEqual(h.plan().items[0],item);
  await h.refresh([{...item,status:'passed'}]);assert(h.nodes['[data-course-detail-add]'].disabled);assert.equal(h.nodes['[data-course-detail-add]'].textContent,'已修通过');
 });
 await test('Unknown credits, cancelled changes, persistence failure and rapid clicks never claim an uncompleted save',async()=>{
  const unknown=await harness({code:'CLA31307'});await unknown.nodes['[data-course-detail-add]'].handlers.click();assert.equal(unknown.calls.length,0);
  const cancelled=await harness();cancelled.cancel();await cancelled.nodes['[data-course-detail-add]'].handlers.click();assert.equal(cancelled.writes(),0);assert(cancelled.nodes['[data-detail-undo]'].hidden);
  const failed=await harness();failed.fail();await failed.nodes['[data-course-detail-add]'].handlers.click();assert(failed.nodes['#course-detail-status'].textContent.includes('保存失败'));assert.equal(failed.writes(),0);
  const h=await harness(),release=h.defer(),first=h.nodes['[data-course-detail-add]'].handlers.click();await tick();await h.nodes['[data-course-detail-add]'].handlers.click();assert.equal(h.calls.length,1);release.resolve();await first;
  const temp=await harness();temp.unsaved();await temp.nodes['[data-course-detail-add]'].handlers.click();assert(temp.nodes['#course-detail-status'].textContent.includes('仅在当前页面'));
 });
 console.log(checks+' course detail checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
