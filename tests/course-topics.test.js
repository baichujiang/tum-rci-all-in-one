/* Candidate collections survive every plan operation without additional credits. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../assets/core'),B=require('../site3/backup-core'),X=require('../assets/plan-export'),T=require('../site3/course-topics'),D=require('../site3/course-directory');
const catalog=require('../scripts/load-course-topics')(),courses=require('../scripts/load-courses')(),view=require('../scripts/course_topics_view');
const copy=value=>JSON.parse(JSON.stringify(value)),seminars=catalog.entries.filter(x=>x.module==='IN2107'),practicals=catalog.entries.filter(x=>x.module==='IN2106'),first=seminars[0],practical=practicals[0];
const draft=items=>C.validatePlan({version:5,cohort:'2026/27冬季',conditional:false,items},courses),snapshot=t=>C.validateTopic(t,t.module);
let checks=0;function test(name,fn){fn();checks++;console.log('PASS',name);}
test('Only explicitly mapped master topics enter the catalog, with stable identities and source scope',()=>{
 assert.equal(seminars.length,74);assert.equal(practicals.length,72);assert.equal(catalog.sourceType,'remaining_spots');assert.equal(catalog.checkedOn,'2026-10-23');
 assert.equal(new Set(catalog.entries.map(x=>x.id)).size,catalog.entries.length);assert(catalog.entries.every(x=>x.title.includes(x.module)&&x.term==='2026W'));
});
test('Filtering stays within the module and source term, accepts meaningful words, and has a true empty state',()=>{
 assert.equal(T.filter(catalog.entries,'IN2107').length,74);assert.equal(T.filter(catalog.entries,'IN2106').length,72);
 assert(T.filter(catalog.entries,'IN2106','robot').length>0);assert(T.filter(catalog.entries,'IN2106','robot').every(x=>x.module==='IN2106'));
 assert.equal(T.filter(catalog.entries,'IN2107','','2027S').length,0);assert.equal(T.filter(catalog.entries,'IN2107','nonexistent-topic-xyz').length,0);
});
test('Legacy single choices migrate losslessly to v7 candidates; older pages cannot silently overwrite them',()=>{
 const old={version:6,cohort:'2026/27冬季',conditional:false,items:[{code:'IN2107',status:'passed',semester:7,locked:true,topic:snapshot(first)}]},p=C.validatePlan(old,courses);
 assert.equal(p.version,7);assert.deepEqual(p.items[0].topics,[snapshot(first)]);assert(!('topic' in p.items[0]));assert.equal(p.items[0].semester,7);assert(p.items[0].locked);assert.equal(p.items[0].status,'passed');
 assert.equal(C.validatePlan({...p,items:[]},courses).version,7);assert.equal(C.validatePlan({...old,items:[]},courses).version,7);assert.equal(draft([]).version,5);assert.throws(()=>C.validatePlan({...p,version:8},courses));
 assert.throws(()=>draft([{...old.items[0],topics:[snapshot(first)]}]),/字段冲突/);
});
test('Many candidates remain bounded metadata on two credit-bearing modules and never change credit identity',()=>{
 const raw={...snapshot(first),ects:1000,group:'E',status:'passed'},p=draft([{code:'IN2107',status:'planned',semester:1,topics:[raw,snapshot(seminars[1])]},{code:'IN2106',status:'planned',semester:1,topics:practicals.slice(0,3).map(snapshot)}]);
 assert.equal(p.version,7);assert(!('ects' in p.items[0].topics[0]));assert.equal(p.items[0].status,'planned');assert.equal(C.calculate(p,courses).allocated,15);assert.equal(C.schedule(p,courses).semesters[0].credits,15);assert.equal(p.items.length,2);
 assert.equal(C.topicTermLabel('2026W'),'2026/27 冬季');assert.equal(C.topicTermLabel('2027S'),'2027 夏季');
 for(const topic of [null,[],{...raw,id:practical.id},{...raw,title:''},{...raw,title:'x'.repeat(401)},{...raw,term:'2027S'},{...raw,sourceURL:'javascript:alert(1)'},{...raw,sourceURL:'https://user:password@example.com/'}])assert.throws(()=>draft([{code:'IN2107',status:'planned',topics:[topic]}]),/课题/);
 for(const topics of [null,{},[raw,raw],[snapshot(practical)],Array(201).fill(raw)])assert.throws(()=>draft([{code:'IN2107',status:'planned',topics}]),/课题/);
 assert.throws(()=>draft([{code:'IN2064',status:'planned',topics:[raw]}]),/课题/);
});
test('Backups preserve unavailable snapshots; merge unions candidates while keeping local placement and status',()=>{
 const p=draft([{code:'IN2107',status:'passed',semester:7,locked:true,topics:seminars.slice(0,2).map(snapshot)}]),parsed=B.parse(JSON.stringify(B.create({plan:p,favorites:[]},courses)),courses);
 assert.deepEqual(parsed.plan,p);assert.equal(parsed.plan.version,7);assert.deepEqual(B.prepare({plan:draft([]),favorites:[]},parsed,'replace',courses).plan.items,p.items);
 const local={plan:draft([{code:'IN2107',status:'planned',semester:1,topics:[snapshot(seminars[1]),snapshot(seminars[2])]}]),favorites:[]},merged=B.prepare(local,parsed,'merge',courses);
 assert.deepEqual(merged.plan.items[0].topics.map(x=>x.id),[seminars[1].id,seminars[2].id,first.id]);assert.equal(merged.plan.items[0].semester,1);assert.equal(merged.plan.items[0].status,'planned');assert.equal(C.calculate(merged.plan,courses).allocated,5);assert(merged.notes.some(x=>x.includes('合并去重')));
 const stale={...snapshot(first),id:'IN2107-2025W-123456abcdef',term:'2025W',title:'往期候选'};
 const old=draft([{code:'IN2107',status:'planned',topics:[stale]}]);assert.deepEqual(B.parse(JSON.stringify(old),courses).plan.items[0].topics,[stale]);
});
test('Automatic planning carries every candidate and lock with its original module',()=>{
 const p=draft([{code:'IN2107',status:'planned',semester:1,locked:true,topics:seminars.slice(0,3).map(snapshot)},{code:'IN2106',status:'planned',semester:2,topics:practicals.slice(0,2).map(snapshot)}]);p.conditionalConfirmed=true;
 const result=require('../assets/planning-engine').generate(p,courses,require('../data/teaching-offerings.json'));assert(result.ok,JSON.stringify(result.reasons));assert.equal(result.plan.version,7);
 assert.equal(result.plan.items.filter(x=>x.code==='IN2107').length,1);assert.equal(result.plan.items.find(x=>x.code==='IN2107').semester,1);
 for(const item of p.items)assert.deepEqual(result.plan.items.find(x=>x.code===item.code).topics,item.topics);
});
test('Excel and printable plans retain all candidates in a separate list, with only one course row per module',()=>{
 const p=draft([{code:'IN2107',status:'passed',semester:0,topics:seminars.map(snapshot)},{code:'IN2106',status:'planned',semester:1,topics:practicals.map(snapshot)}]);
 const v=X.planView(p,{courses,names:{}}),sheets=X.planSheets(v),html=X.printPlan(v),appendix=sheets.find(x=>x.name==='候选课题');
 assert.equal(v.items.length,2);assert.equal(v.allocated,15);assert.equal(appendix.rows.length,147);assert(html.includes('不代表报名或匹配成功'));
 assert.equal(sheets[1].rows.length,3);assert.equal((html.match(/class="print-course(?: is-passed)?"/g)||[]).length,1);
 for(const entry of catalog.entries){assert(html.includes(C.esc(entry.title)));assert(appendix.rows.some(row=>row.some(cell=>String(cell?.value||'').includes(entry.title))));}
 assert(!appendix.rows[0].some(cell=>cell.value==='ECTS'));assert(sheets.every(sheet=>sheet.heights.every(h=>h<=409)));
 const xlsx=new TextDecoder().decode(X.xlsx(sheets));assert(xlsx.includes(C.esc(first.title)));assert(xlsx.includes(C.esc(practical.title)));
});
test('All module surfaces show candidate counts and share one manager; draft equality ignores incidental order',()=>{
 const html=view('IN2107',catalog);assert(html.includes('data-course-topic-open="IN2107"'));assert(html.includes('data-topic-target="detail-semester"'));assert(!html.includes('data-topic-select'));assert(!html.includes('course-topic-list'));assert(!html.includes('Generative modeling'));
 const dirty={...snapshot(first),title:'<img src=x onerror=alert(1)>'};assert(!T.field('IN2107',[dirty]).includes('<img src=x'));assert.equal(view('IN2064',catalog),'');
 const course=courses.find(x=>x.module_code==='IN2107'),card=D.card(D.view(course,null,{}),null,2,{base:'/rci'});assert(card.includes(T.field('IN2107',[],{semester:2})));assert(card.includes('/rci/courses/IN2107/'));
 const selected={topics:seminars.slice(0,3).map(snapshot)},selectedCard=D.card(D.view(course,selected,{}),selected,2);assert(selectedCard.includes('管理课题'));assert(selectedCard.includes('候选课题 · 3 个'));assert(selectedCard.includes(C.esc(T.displayTitle(first.title))));
 assert.equal(T.displayTitle('Master-Seminar - Wearable Robotics for Motion Assistance and Augmentation (IN2107, IN45095)'),'Wearable Robotics for Motion Assistance and Augmentation');
 assert(T.saveState(null,[]).disabled);assert(!T.saveState(null,[first.id]).disabled);assert(T.saveState({topics:[first,seminars[1]]},[seminars[1].id,first.id]).disabled);assert(T.saveState({topics:[first]},[]).clear);
});
test('A snapshot with duplicate or invalid identity fails validation before publishing',()=>{
 const os=require('node:os'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'rci-topics-'));try{fs.mkdirSync(path.join(dir,'data'));const bad=copy(catalog);bad.entries.push(bad.entries[0]);fs.writeFileSync(path.join(dir,'data/course-topics.json'),JSON.stringify(bad));assert.throws(()=>require('../scripts/load-course-topics')(dir),/duplicate/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
console.log(checks+' course topic checks passed');
