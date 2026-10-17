/* Full curriculum reconciliation and safe handling of newly discovered modules. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../assets/core'),E=require('../assets/planning-engine'),D=require('../site3/course-directory'),P=require('../site3/course-picker');
const source=require('../data/official-curriculum.json'),courses=require('../scripts/load-courses')(),known=new Map(courses.map(c=>[c.module_code,c])),offerings=require('../data/teaching-offerings.json');
const draft=items=>C.validatePlan({version:5,cohort:'2026/27冬季',conditional:false,conditionalConfirmed:true,items},courses);
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
test('Published modules match the official tree and the four requested omissions stay unpublished',()=>{
 assert.equal(source.modules.length,594);assert.equal(new Set(source.modules.map(m=>m.module_code)).size,594);assert.equal(courses.length,595);
 assert.equal(source.source_pages.length,14);assert.equal(source.excluded_recognition_placeholders.length,19);
 for(const m of source.modules){
  const c=known.get(m.module_code);if(source.site_omissions.module_codes.includes(m.module_code)){assert.equal(c,undefined,m.module_code);continue;}assert(c,m.module_code);assert.equal(C.courseName(c),m.name);assert.equal(c.ects,m.ects===null?'待核实':String(m.ects));assert.deepEqual((c.allowed_groups||[c.section_2025[0]]).slice().sort(),m.groups);
  assert(m.source_node_ids.length&&m.source_pages.length);assert.equal(m.module_detail_ids.length,1);assert(m.handbook_check.identity_matches);assert(/^[a-f0-9]{64}$/.test(m.handbook_check.source_sha256));
 }
 const currentCodes=new Set(source.modules.map(m=>m.module_code));assert.deepEqual(courses.filter(c=>!currentCodes.has(c.module_code)).map(c=>c.module_code).sort(),['ED140014','IN2404','IN9003','MW2352','WI000159']);
 for(const code of ['IN2404','IN9003','MW2352','WI000159']){const c=known.get(code);assert(!E.recommendationEligible(c));assert(D.view(c,null).note.includes('旧法规附件'));}
});
test('Missing curriculum credits cannot inherit numeric handbook credits or lose old custom recognition records',()=>{
 for(const code of ['CLA31307']){
  const c=known.get(code);assert.equal(c.ects,'待核实');assert.equal(c.verification.fields.ects,'pending');assert(!E.recommendationEligible(c));assert.equal(D.button(D.view(c,null),null,1).disabled,true);
  assert.throws(()=>draft([{code,status:'planned',semester:1}]),/学分尚未核实/);
  const own={code,name:'已获学校认可的自录选修',group:code==='IN3150'?'G':'J',ects:5,custom:true,status:'passed',semester:1};assert.deepEqual(draft([own]).items[0],{...own,locked:false});
 }
 for(const code of source.site_omissions.module_codes)assert(!known.has(code),code);
});
test('Current names reach search and pickers while the original annex remains intact',()=>{
 const csv=C.csv(fs.readFileSync(require('node:path').join(__dirname,'../data/courses_legal_2025.csv'),'utf8'));
 for(const code of ['ED160028','IN2228','IN9006']){
  const c=known.get(code),old=csv.find(x=>x.module_code===code);assert.equal(c.module_name_legal_2025,old.module_name_legal_2025);assert.notEqual(C.courseName(c),old.module_name_legal_2025);assert.equal(D.view(c,null).title,C.courseName(c));assert(D.view(c,null).aliases.includes(old.module_name_legal_2025));
  const choices=P.choices({courses,names:{},offerings},draft([]),1,{query:code});assert(choices.some(x=>x.code===code&&x.title===C.courseName(c)),code);
 }
});
console.log(count+' complete curriculum checks passed');
