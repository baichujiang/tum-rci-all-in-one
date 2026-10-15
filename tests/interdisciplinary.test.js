/* J membership, personal-eligibility gates and credit limits are release contracts. */
'use strict';
const assert=require('node:assert/strict'),C=require('../assets/core'),E=require('../assets/planning-engine'),B=require('../site3/backup-core');
const courses=require('../scripts/load-courses')(),source=require('../data/official-interdisciplinary-memberships.json'),evidence=require('../data/interdisciplinary-verification.json'),decisions=require('../data/interdisciplinary-review-decisions.json'),rules=require('../data/j-rules.json'),audit=require('../data/catalog-audit.json'),offerings=require('../data/teaching-offerings.json');
const known=new Map(courses.map(c=>[c.module_code,c]));
const draft=()=>C.validatePlan({version:5,cohort:'2026/27冬季',conditional:false,conditionalConfirmed:true,items:[]},courses);
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
test('All 428 fixed-credit J modules plus the actual missing-credit module are visible exactly once',()=>{
 assert.equal(source.modules.length,429);assert.equal(new Set(source.modules.map(m=>m.module_code)).size,429);assert.equal(courses.length,595);
 assert.equal(audit.coverage.J.omitted_distinct_modules,0);assert.equal(audit.j_verification.new_fixed_credit_modules,419);
 for(const m of source.modules){const c=known.get(m.module_code);assert(c,m.module_code);assert.deepEqual(c.allowed_groups,['J']);assert.equal(c.ects,m.ects===null?'待核实':String(m.ects));assert(m.module_detail_ids.length===1&&m.source_memberships.length);}
 assert.equal(known.get('CLA31307').verification.fields.ects,'pending');assert.equal(known.get('CLA31307').verification.handbook_ects,3);
 assert.equal(known.get('SOT10082').ects,'2');assert.equal(known.get('SOT10082').verification.handbook_ects,3);assert.equal(known.get('SOT10082').verification.fields.ects,'pending');
});
test('J eligibility approvals bind to current full-handbook hashes and fail closed for legacy or changed evidence',()=>{
 const approved=decisions.reviews.filter(d=>d.auto_candidate_supported);
 assert.equal(approved.length,45);assert.equal(audit.j_verification.automatic_recommendation_eligible,45);
 for(const m of source.modules){const c=known.get(m.module_code),v=evidence.courses[m.module_code];assert.equal(c.verification.source_sha256,v.source_sha256);assert(v.review_reasons_cn.length);assert(v.counting_sources.every(s=>C.safeURL(s.url)));assert.equal(v.selected_semester_id,'207');assert.equal(E.recommendationEligible(c),v.automatic_recommendation_eligible,m.module_code);
  if(v.automatic_recommendation_eligible){assert(approved.some(d=>d.code===m.module_code&&d.source_sha256===v.source_sha256));assert(!E.recommendationEligible({...c,verification:{...v,source_sha256:'0'.repeat(64)}}));}
 }
 assert(!E.recommendationEligible({module_code:'LEGACYJ',section_2025:'J Support Electives',ects:'6'}));
});
test('All 384 unsafe J modules are blocked as desired courses even with dated teaching or overwritten flags',()=>{
 const disabled=source.modules.map(m=>known.get(m.module_code)).filter(c=>!c.automatic_recommendation_eligible);assert.equal(disabled.length,384);
 for(const c of disabled){const p=draft();p.preferences.desired=[c.module_code];const before=JSON.stringify(p),v=c.verification;
  assert(!E.recommendationEligible({...c,automatic_recommendation_eligible:true,verification:{...v,automatic_recommendation_eligible:true,fields:Object.fromEntries(Object.keys(v.fields).map(k=>[k,'verified']))}}),c.module_code);
  const r=E.generate(p,courses,{...offerings,[c.module_code]:{offerings:{'2026-winter':{available:true,language:'EN'}}}});assert(!r.ok,c.module_code);assert(r.reasons.some(s=>s.includes(c.module_code)),c.module_code);assert.equal(JSON.stringify(p),before);
 }
 for(const code of ['MGT000159','SOT46401','SZ0471','SZ0361','SOT10082']){const p=draft();p.items=[{code,status:'planned',semester:1}];assert(!E.generate(p,courses,offerings).ok,code);}
});
test('Language learning is separate from teaching language and personal eligibility is never inferred',()=>{
 const language=source.modules.map(m=>known.get(m.module_code)).filter(c=>c.j_constraints.is_language_course);assert.equal(language.length,156);assert(language.every(c=>!E.recommendationEligible(c)));
 assert.equal(known.get('SZ1102').j_constraints.is_language_course,false);assert(E.recommendationEligible(known.get('SZ1102')));assert(known.get('SZ0361').verification.review_reasons_cn.some(s=>s.includes('B2.2')));
 assert.equal(rules.minimum_ects,6);assert.equal(rules.overall_maximum_ects,null);assert.equal(rules.language_maximum_ects,6);
});
test('Language credit cap and known low-level overlaps affect completeness without deleting records',()=>{
 const langs=source.modules.map(m=>known.get(m.module_code)).filter(c=>c.j_constraints.is_language_course&&Number(c.ects)===3);
 const p=draft();p.items=langs.slice(0,3).map(c=>({code:c.module_code,status:'passed',semester:0}));const r=C.calculate(p,courses);assert.equal(r.raw,9);assert.equal(r.totals.J,6);assert(r.countingIssues.some(s=>s.includes('最多计入 6')));assert.equal(p.items.length,3);
 const pair=langs.flatMap((a,i)=>langs.slice(i+1).filter(b=>a.j_constraints.language_target===b.j_constraints.language_target&&a.j_constraints.language_level_coverage.some(x=>b.j_constraints.language_level_coverage.includes(x))).map(b=>[a,b]))[0];assert(pair);
 p.items=pair.map(c=>({code:c.module_code,status:'passed',semester:1}));assert(C.calculate(p,courses).countingIssues.some(s=>s.includes('级别重叠')));assert.equal(C.calculate(p,courses).totals.J,3);assert.equal(C.progression(p,courses).find(x=>x.semester===3).value,3);
 assert.equal(known.get('SZ0222').j_constraints.language_target,'Kantonesisch');assert.equal(known.get('SZ0209').j_constraints.language_target,'Chinesisch');
 p.items=[{code:'WI001056_1',status:'passed',semester:0},...langs.slice(0,2).map(c=>({code:c.module_code,status:'passed',semester:0}))];assert.equal(C.calculate(p,courses).totals.J,12);
});
test('Every confirmed version family is counted once and marked for review, with original records intact',()=>{
 assert.equal(rules.recognition_families.length,32);
 for(const f of rules.recognition_families){const p=draft();p.items=f.codes.map(code=>({code,status:'passed',semester:0}));const before=JSON.stringify(p),r=C.calculate(p,courses);assert.equal(r.totals.J,Math.max(...f.codes.map(code=>Number(known.get(code).ects))),f.id);assert(r.countingIssues.length,f.id);assert.equal(JSON.stringify(p),before);}
});
test('New J recommendations respect family overlap, pinned semesters, English and complete degree requirements',()=>{
 for(const conditional of [false,true]){const p=draft();p.conditional=conditional;p.preferences.languages=conditional?['EN','DE']:['EN'];p.preferences.desired=['CIT443037'];p.items=[{code:'SOT86060',status:'passed',semester:0},{code:'IN2067',status:'planned',semester:1,locked:true}];const r=E.generate(p,courses,offerings);assert(r.ok,JSON.stringify(r.reasons));assert(r.calculation.complete);assert.equal(r.calculation.allocated,120);assert.equal(r.plan.items.find(x=>x.code==='IN2067').semester,1);assert(!r.plan.items.some(x=>x.code==='SOT86061'));assert(r.plan.items.some(x=>x.code==='CIT443037'));assert(C.progression(r.plan,courses).every(x=>x.met));for(const x of r.plan.items.filter(x=>x.status==='planned'&&known.get(x.code)?.section_2025[0]==='J'))assert(E.recommendationEligible(known.get(x.code)));}
});
test('A previous variant cannot be used to fill the remaining J gap with the same course again',()=>{
 const p=draft();p.items=[{code:'SOT86060',status:'passed',semester:0}];
 const narrow=courses.map(c=>c.section_2025[0]==='J'&&c.module_code!=='SOT86061'?{...c,automatic_recommendation_eligible:false}:c);
 assert(!E.generate(p,narrow,offerings).ok);
 const both=draft();both.preferences.desired=['SOT86060','SOT86061'];const r=E.generate(both,courses,offerings);assert(!r.ok);assert(r.reasons.some(s=>s.includes('重叠')||s.includes('只能计入一次')));
});
test('Explicit previous-pass exclusions preserve chronology and never erase historical records',()=>{
 const p=draft(),previous={code:'MGT001407',name:'已认可记录',ects:3,group:'J',custom:true,status:'passed',semester:1};p.items=[previous,{code:'MGT001445',status:'planned',semester:2}];assert(C.calculate(p,courses).countingIssues.some(s=>s.includes('MGT001407')));
 p.items=[{...previous,semester:2},{code:'MGT001445',status:'passed',semester:1}];assert(!C.calculate(p,courses).countingIssues.some(s=>s.includes('MGT001407')));
 p.items=[previous,{code:'MGT001445',status:'passed',semester:2}];const before=JSON.stringify(p);assert(C.calculate(p,courses).countingIssues.some(s=>s.includes('MGT001407')));assert.equal(JSON.stringify(p),before);
});
test('Recognized passed J records and legacy custom collisions survive planning and backup',()=>{
 const p=draft();p.items=[{code:'MGT000159',status:'passed',semester:0},{code:'CLA31307',name:'已获认可的自录课程',ects:3,group:'J',custom:true,status:'passed',semester:0}];const normalized=C.validatePlan(p,courses),saved=B.parse(JSON.stringify(B.create({plan:normalized,favorites:[]},courses)),courses);assert.deepEqual(saved.plan.items,normalized.items);const r=E.generate(normalized,courses,offerings);assert(r.ok,JSON.stringify(r.reasons));for(const x of normalized.items)assert.deepEqual(r.plan.items.find(y=>y.code===x.code),x);
 const unknown=draft();unknown.preferences.desired=['CLA31307'];assert(!E.generate(unknown,courses,offerings).ok);unknown.items=[{code:'CLA31307',status:'planned',semester:1}];assert.throws(()=>C.validatePlan(unknown,courses),/学分尚未核实/);
});
test('Exclusion preferences can cover the expanded catalogue and preserve the complete backup',()=>{
 const p=draft();p.preferences.excluded=source.modules.map(m=>m.module_code);const normalized=C.validatePlan(p,courses);assert.equal(normalized.preferences.excluded.length,429);const r=E.generate(normalized,courses,offerings);assert(!r.ok);assert(r.reasons.some(s=>s.includes('J 的 6 ECTS')));assert.deepEqual(B.parse(JSON.stringify(B.create({plan:normalized,favorites:[]},courses)),courses).plan.preferences.excluded,normalized.preferences.excluded);
});
console.log(count+' interdisciplinary safety checks passed');
