'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../assets/core.js');
const courses = C.csv(fs.readFileSync(path.join(__dirname,'../data/courses_legal_2025.csv'),'utf8'));
const draft = () => ({version:2,cohort:'2026/27冬季',conditional:false,items:[]});
const add = (p, ...codes) => ({...p,items:[...p.items,...codes.map(code=>({code,status:'planned'}))]});
let tests = 0;
function test(name, fn) {fn();tests++;console.log('PASS',name);}
test('CSV handles BOM, quoted commas, escaped quotes and multiline values',()=>assert.deepEqual(C.csv('\uFEFFid,name\r\n1,"a,b"\r\n2,"say ""hi""\nnext"\r\n'),[{id:'1',name:'a,b'},{id:'2',name:'say "hi"\nnext'}]));
test('CSV rejects unfinished quotes and wrong column counts',()=>{assert.throws(()=>C.csv('a,b\n"x,y'));assert.throws(()=>C.csv('a,b\nx'));});
test('35 modules preserved',()=>assert.equal(courses.length,35));
test('Known core totals 43',()=>assert.equal(C.calculate(add(draft(),'IN2067','IN2228','IN2406','IN2064','IN2107','IN2106'),courses).totals.core,43));
test('XOR cannot be double counted',()=>assert.throws(()=>C.calculate(add(draft(),'IN2067','ED160028'),courses),/二选一/));
test('Duplicate module codes rejected',()=>assert.throws(()=>C.validatePlan(add(draft(),'IN2067','IN2067'),courses)));
test('Unknown cohort never reports completion',()=>assert.equal(C.calculate({...draft(),cohort:'unknown'},courses).supported,false));
test('Future cohorts rejected',()=>assert.throws(()=>C.validatePlan({...draft(),cohort:'2030'},courses)));
test('Conditional block shifts electives to 36',()=>{const x=C.calculate({...draft(),conditional:true},courses);assert.equal(x.buckets.find(x=>x[0].startsWith('专业'))[2],36);assert.equal(x.buckets.reduce((n,x)=>n+x[2],0),120);});
test('Control remediation does not cover I minimum',()=>{const x=C.calculate({...add(draft(),'ED140014'),conditional:true},courses);assert.equal(x.totals.I,0);assert.equal(x.totals.K,5);assert(x.gaps.some(s=>s.startsWith('I ')));});
test('Unneeded remediation not counted',()=>assert.equal(C.calculate(add(draft(),'ED140014'),courses).allocated,0));
test('Planned and passed separated',()=>{const p=add(draft(),'IN2067');assert.equal(C.calculate(p,courses,true).allocated,0);p.items[0].status='passed';assert.equal(C.calculate(p,courses,true).allocated,6);});
const custom = (code,group,ects) => ({code,name:code,group,ects,custom:true,status:'planned'});
test('Excess interdisciplinary credits cannot fill professional bucket',()=>{const p=draft();p.items=[custom('X1','J',8)];const c=C.calculate(p,courses);assert.equal(c.raw,8);assert.equal(c.allocated,6);assert.equal(c.professional,0);});
test('Correct standard plan meets model, not official graduation',()=>{const p=add(draft(),'IN2067','IN2228','IN2406','IN2064','IN2107','IN2106','IN2320');p.items.push(custom('G1','G',21),custom('H1','H',10),custom('I1','I',10),custom('J1','J',6));const c=C.calculate(p,courses);assert.equal(c.allocated,120);assert.equal(c.complete,true);});
test('120 ECTS without a domain minimum is not complete',()=>{const p=add(draft(),'IN2067','IN2228','IN2406','IN2064','IN2107','IN2106','IN2320');p.items.push(custom('G1','G',21),custom('H1','H',20),custom('J1','J',6));assert.equal(C.calculate(p,courses).complete,false);});
test('Correct conditional plan meets model',()=>{const p={...add(draft(),'ED160028','IN2228','IN2406','IN2064','IN2107','IN2106','IN2320','ED140014'),conditional:true};p.items.push(custom('G1','G',16),custom('H1','H',10),custom('I1','I',10),custom('J1','J',6));assert.equal(C.calculate(p,courses).allocated,120);assert.equal(C.calculate(p,courses).complete,true);});
test('Invalid imports and forged core credits rejected or ignored',()=>{assert.throws(()=>C.validatePlan({...draft(),items:[custom('X','A',30)]},courses));assert.throws(()=>C.validatePlan({...draft(),items:[custom('X','G',-1)]},courses));const p=draft();p.items=[{code:'IN2067',status:'planned',ects:120}];assert.equal(C.calculate(p,courses).raw,6);});
test('Unsafe URLs are rejected and raw HTML stays inert',()=>{assert.equal(C.safeURL('javascript:alert(1)'),'');assert.equal(C.safeURL('https://user:pass@example.org'),'');assert(!C.markdown('<script>alert(1)</script>',C.safeURL).includes('<script>'));assert(!C.markdown('[bad](javascript:alert)',C.safeURL).includes('href='));});
test('Editorial source records are auditable and translations cover modules',()=>{const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../content/editorial.json')));assert.equal(d.sources.filter(s=>s.status==='checked').length,5);for(const c of courses)assert(d.course_names_zh[c.module_code]);for(const a of d.articles)for(const s of a.sources)assert(d.sources.some(x=>x.id===s));for(const s of d.sources)if(s.status==='checked')assert(s.checked_on&&s.scope&&s.human_review==='pending');});
test('Code normalization prevents case and whitespace duplicates',()=>assert.throws(()=>C.validatePlan(add(draft(),'IN2067',' in2067 '),courses)));
test('Old v2 plans keep courses, passed states and custom credits as unassigned',()=>{
 const old=add(draft(),'IN2067');old.items[0].status='passed';old.items.push(custom('OLD1','G',5.5));
 const p=C.validatePlan(old,courses);assert.equal(p.version,4);assert.deepEqual(p.timeline,{count:4,start:'winter'});
 assert.equal(p.items[0].status,'passed');assert.equal(p.items[1].ects,5.5);assert(p.items.every(x=>x.semester===0));
 assert.equal(C.schedule(p,courses).unassigned.credits,5.5);
});
test('Four and five semesters alternate winter/summer from the chosen start',()=>{
 for(const start of ['winter','summer'])for(const count of [4,5]){
  const p={...draft(),timeline:{count,start}},s=C.schedule(p,courses);
  assert.equal(s.semesters.length,count);assert.equal(s.semesters[0].season,start);
  assert.notEqual(s.semesters[1].season,start);assert.equal(s.semesters[4]?.season,count===5?start:undefined);
 }
 assert.equal(C.validatePlan({...draft(),cohort:'2026夏季'},courses).timeline.start,'summer');
});
test('Semester assignment changes workload without changing degree accounting',()=>{
 const p=add(draft(),'IN2067','IN2228','IN2320');p.timeline={count:5,start:'winter'};
 p.items[0].semester=1;p.items[1].semester=2;p.items[2].semester=5;
 const s=C.schedule(p,courses);assert.deepEqual(s.semesters.map(x=>x.credits),[6,8,0,0,30]);
 assert.equal(s.unassigned.items.length,0);assert.equal(C.calculate(p,courses).allocated,44);
 p.items[0].semester=3;assert.equal(C.calculate(p,courses).allocated,44);assert.equal(C.schedule(p,courses).semesters[2].credits,6);
 assert.deepEqual(C.validatePlan(JSON.parse(JSON.stringify(p)),courses).items.map(x=>x.semester),[3,2,5]);
});
test('Winter-only courses conflict in summer; both seasons and thesis remain valid',()=>{
 const p=add(draft(),'IN2067','IN2107','IN2320');p.items.forEach(x=>x.semester=2);
 assert.deepEqual(C.schedule(p,courses).semesters[1].conflicts,['IN2067']);
 assert.equal(C.offering(undefined,'winter').state,'unknown');
 assert.equal(C.offering({term_legal_annex:'不定期'},'summer').state,'unknown');
 assert.equal(C.offering({term_legal_annex:'SoSe'},'summer').state,'compatible');
});
test('Invalid timeline or semester imports fail without coercing assignments',()=>{
 for(const timeline of [null,{count:0,start:'winter'},{count:13,start:'winter'},{count:4.5,start:'winter'},{count:4,start:'spring'}])assert.throws(()=>C.validatePlan({...draft(),timeline},courses));
 for(const semester of [-1,5,1.5,'1',null])assert.throws(()=>C.validatePlan({...draft(),items:[{code:'IN2067',status:'planned',semester}]},courses));
});
console.log(`${tests} tests passed`);
