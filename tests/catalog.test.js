/* Current official membership coverage and recommendation safety are release contracts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),load=require('../scripts/load-courses'),C=require('../assets/core'),E=require('../assets/planning-engine');
const courses=load(),source=require('../data/official-professional-memberships.json'),evidence=require('../data/course-verification.json'),audit=require('../data/catalog-audit.json'),offerings=require('../data/teaching-offerings.json');
const map=new Map(courses.map(c=>[c.module_code,c]));
const B=require('../site3/backup-core');
const draft=()=>C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,items:[]},courses);
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
test('All 153 official professional modules and 158 memberships are present with exact ECTS',()=>{
 assert.equal(courses.length,175);assert.equal(source.modules.length,153);assert.equal(new Set(source.modules.map(m=>m.module_code)).size,153);
 assert.equal(source.modules.reduce((n,m)=>n+m.accepted_sections.length,0),158);
 for(const m of source.modules){const c=map.get(m.module_code);assert(c,m.module_code);assert.equal(Number(c.ects),m.ects);assert.deepEqual(c.allowed_groups,m.accepted_sections.map(x=>x[0]));assert.equal(m.module_detail_ids.length,1);}
 assert.equal(audit.coverage.GHI.omitted_distinct_modules,0);assert.equal(audit.additional_professional_modules,106);assert.equal(audit.coverage.J.omitted_distinct_modules,419);
});
test('Every professional module has field-level evidence and unsupported facts cannot default to verified',()=>{
 for(const m of source.modules){const v=evidence.courses[m.module_code];assert(v);assert.equal(v.fields.ects,'verified');assert.equal(v.fields.groups,'verified');assert(C.safeURL(v.source));assert(C.safeURL(v.source_api));assert(/^[a-f0-9]{64}$/.test(v.source_sha256));
  for(const [key,sourceKey] of [['term','term'],['language','language'],['prerequisites','prerequisites']])if(v.source_field_status[sourceKey]==='not_provided')assert.equal(v.fields[key],'pending',m.module_code+' '+key);
 }
 const vs=Object.values(evidence.courses),complete=v=>Object.values(v.fields).every(x=>x==='verified');
 assert.equal(vs.filter(complete).length,audit.verification.fully_verified);assert.equal(vs.filter(v=>!complete(v)).length,audit.verification.pending);
 assert.equal(vs.filter(v=>v.automatic_recommendation_eligible).length,audit.verification.automatic_recommendation_eligible);
 for(const c of courses.filter(c=>c.verification))assert.equal(E.recommendationEligible(c),c.automatic_recommendation_eligible,c.module_code);
});
test('Unknown prerequisites, irregular occurrence and old selected academic year are disabled',()=>{
 for(const code of ['IN2002','IN2133','IN2138','IN2058','EI5111','IN2076','CIT323000','IN2123','IN2169','CIT4230002'])assert.equal(E.recommendationEligible(map.get(code)),false,code);
 assert.equal(map.get('IN2123').current_term,'待核实');assert.equal(map.get('IN2123').verification.selected_semester_label,'2014S');
 assert.equal(C.offering(map.get('IN2123'),'winter').state,'unknown');assert.equal(C.offering(map.get('IN2123'),'summer').state,'unknown');
 assert.equal(map.get('WZ1339').prerequisites.kind,'none');assert.equal(map.get('MW0085').prerequisites.kind,'recommended');
 const c=map.get('CIT323007'),unsafe={...c,verification:{...c.verification,fields:{...c.verification.fields,prerequisites:undefined}}};assert.equal(E.recommendationEligible(unsafe),false);
 assert.equal(E.recommendationEligible({...c,verification:undefined,automatic_recommendation_eligible:undefined}),false);
});
test('Desired and manually selected unsafe future modules cannot bypass the same gate, even with dated teaching',()=>{
 for(const code of ['IN2002','IN2123','IN2076','IN2169','CIT4230002'])for(const mode of ['desired','selected']){
  const p=draft();if(mode==='desired')p.preferences.desired=[code];else p.items=[{code,status:'planned',semester:1,locked:false}];
  const before=JSON.stringify(p),r=E.generate(p,courses,{...offerings,[code]:{offerings:{'2026-winter':{available:true,language:'EN'}}}});
  assert(!r.ok,code+' '+mode);assert(r.reasons.some(x=>x.includes(code)));assert.equal(JSON.stringify(p),before);
 }
});
test('Already passed uncertain modules survive automatic planning and are never silently scheduled again',()=>{
 const p=draft();p.items=[{code:'IN2076',status:'passed',semester:0},{code:'IN2002',status:'passed',semester:0}];const r=E.generate(p,courses,offerings);assert(r.ok,JSON.stringify(r.reasons));
 for(const code of ['IN2076','IN2002'])assert.deepEqual(r.plan.items.find(x=>x.code===code),C.validatePlan(p,courses).items.find(x=>x.code===code));assert(r.calculation.complete);
 for(const code of r.added.filter(code=>'GHI'.includes(map.get(code).section_2025[0])))assert(E.recommendationEligible(map.get(code)),code);
});
test('New catalogue identities cannot overwrite a legacy custom recognition record or its backup',()=>{
 const old={version:4,cohort:'2026/27冬季',conditional:false,conditionalConfirmed:true,items:[{code:'CIT323007',name:'已认定的自录课程',group:'H',ects:7.5,custom:true,status:'passed',semester:1,locked:false}]};
 const p=C.validatePlan(old,courses);assert.equal(p.version,5);assert.deepEqual(p.items,old.items);assert.equal(C.calculate(p,courses,true).totals.H,7.5);assert.equal(C.calculate(p,courses,true).totals.G,0);assert.equal(C.calculate(p,courses,true).custom,1);
 const parsed=B.parse(JSON.stringify(B.create({plan:p,favorites:[]},courses)),courses);assert.deepEqual(parsed.plan.items,old.items);
 const r=E.generate(p,courses,offerings);assert(r.ok,JSON.stringify(r.reasons));assert.deepEqual(r.plan.items.find(x=>x.code==='CIT323007'),old.items[0]);assert.equal(r.plan.items.filter(x=>x.code==='CIT323007').length,1);
 const future=C.validatePlan({...old,items:[{...old.items[0],status:'planned'}]},courses);assert.equal(C.schedule(future,courses).semesters[0].credits,7.5);const before=JSON.stringify(future),blocked=E.generate(future,courses,offerings);assert(!blocked.ok);assert(blocked.reasons.some(x=>x.includes('自录课程')));assert.equal(JSON.stringify(future),before);
 const Picker=require('../site3/course-picker'),view=Picker.choices({courses,names:{}},future,2,{group:'H',query:'CIT323007'})[0];assert(view);assert.equal(view.title,old.items[0].name);assert.equal(view.course.ects,7.5);assert.deepEqual(view.course.allowed_groups,['H']);
});
test('Expanded plans honor English, pinned semesters, desired new courses, progress and K minima',()=>{
 for(const conditional of [false,true]){
  const p=draft();p.conditional=conditional;p.preferences.languages=conditional?['EN','DE']:['EN'];p.preferences.desired=['CIT323007'];p.workload.semesters[1]={maxECTS:24};p.items=[{code:'IN2067',status:'planned',semester:1,locked:true}];
  const r=E.generate(p,courses,offerings);assert(r.ok,JSON.stringify(r.reasons));assert.equal(r.plan.items.find(x=>x.code==='IN2067').semester,1);assert(r.plan.items.some(x=>x.code==='CIT323007'));assert.equal(r.calculation.allocated,120);assert(r.calculation.complete);assert(r.calculation.totals.I>=5);assert.equal(r.calculation.totals.K,conditional?5:0);
  assert.equal(new Set(r.plan.items.map(x=>x.code)).size,r.plan.items.length);assert(C.progression(r.plan,courses).every(x=>x.met));assert(C.schedule(r.plan,courses).semesters[0].credits<=24);
  for(const code of r.added.filter(code=>'GHI'.includes(map.get(code).section_2025[0])))assert(E.recommendationEligible(map.get(code)),code);
  for(const x of r.plan.items.filter(x=>map.get(x.code)?.prerequisites?.kind==='recommended'))assert(r.warnings.some(w=>w.startsWith(x.code+'：')),x.code);
 }
});
console.log(count+' catalogue safety checks passed');
