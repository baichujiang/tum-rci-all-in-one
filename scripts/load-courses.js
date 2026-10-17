/* Merge historical annex facts, current memberships and individually checked handbooks. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('../assets/core');
module.exports=function loadCourses(root=path.resolve(__dirname,'..')){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const courses=C.csv(read('data/courses_legal_2025.csv'));
 const current=JSON.parse(read('data/courses_current_2026.json'));
 const memberships=JSON.parse(read('data/official-professional-memberships.json'));
 const evidence=JSON.parse(read('data/course-verification.json'));
 const overrides=JSON.parse(read('data/course-overrides.json'));
 for(const row of current){
  if(!row.module_detail_urls?.length||!row.module_detail_urls.every(C.safeURL)||!row.review_date||!['E','G','H','I','J'].includes(row.section?.[0]))throw Error('Current course evidence incomplete: '+row.module_code);
  const patch={current_term:row.term,current_language:row.language,offering_url:row.current_offering_urls?.[0],allowed_groups:row.accepted_sections.map(x=>x[0]),automatic_recommendation_eligible:row.automatic_recommendation_eligible===true,current_metadata_source:row.module_detail_urls[0]};
  const existing=courses.find(c=>c.module_code===row.module_code);
  if(existing){Object.assign(existing,patch);continue;}
  courses.push({module_code:row.module_code,module_name_legal_2025:row.name,section_2025:row.section,ects:row.ects===null?'待核实':String(row.ects),term_legal_annex:row.term,language_legal_annex:row.language,type:row.section[0]==='E'?'实践课选项':'扩展选修',notes_cn:row.notes_cn||'官方公开 RCI 课程树（20241、2026/27 学年）扩展模块；手册周期不是当期名额或时间承诺。',rule_cohort:'2024夏季起 · 请核对个人TUMonline归类',source_regulation:row.module_detail_urls[0],last_reviewed:row.review_date,catalog_source:'current',prerequisites:row.prerequisites,recommendation_note:row.recommendation_note,...patch});
 }
 for(const [code,patch] of Object.entries(overrides.courses)){
  const c=courses.find(x=>x.module_code===code);
  if(!c||!C.safeURL(patch.current_metadata_source))throw Error('Invalid current metadata override: '+code);
  Object.assign(c,patch);
 }
 for(const m of memberships.modules){
  const c=courses.find(x=>x.module_code===m.module_code),v=evidence.courses[m.module_code];
  if(!c||c.ects!==(m.ects===null?'待核实':String(m.ects))||!v)throw Error('Current membership or verification missing: '+m.module_code);
  const fields=['identity','ects','groups','term','language','prerequisites'];
  if(fields.some(k=>!['verified','pending'].includes(v.fields?.[k])))throw Error('Invalid field verification: '+m.module_code);
  const review=v.follow_up_review;
  if(review&&(!['resolved','unresolved'].includes(review.outcome)||!review.checked_on||!review.summary_cn||!review.sources?.length||review.sources.some(s=>!C.safeURL(s.url))))throw Error('Invalid follow-up evidence: '+m.module_code);
  if(v.source_field_status?.prerequisites==='present_in_current_course'){
   const s=v.field_sources?.prerequisites;
   if(!s||s.module_code!==m.module_code||s.source_type!=='official_current_course'||s.academic_year!==evidence.academic_year||!s.public_access_verified||!s.module_identity_verified||!C.safeURL(s.source_url)||!s.source_field_value?.trim()||!/^[a-f0-9]{64}$/.test(s.snapshot_sha256||''))throw Error('Current-course prerequisite evidence missing: '+m.module_code);
  }
  if(v.automatic_recommendation_eligible&&review?.outcome==='unresolved')throw Error('Unresolved follow-up cannot be recommended: '+m.module_code);
  if(v.automatic_recommendation_eligible&&(fields.some(k=>v.fields[k]!=='verified')||v.current_academic_year_selection_verified!==true||!['WiSe','SoSe','WiSe/SoSe'].includes(v.term)||!['none','recommended'].includes(v.prerequisites?.kind)||v.prerequisites?.requires_confirmation||!C.safeURL(v.source_api)||!/^\w{64}$/.test(v.source_sha256||'')))throw Error('Unresolved module cannot be recommended: '+m.module_code);
  if(v.source&&!C.safeURL(v.source))throw Error('Invalid handbook source: '+m.module_code);
  c.allowed_groups=m.accepted_sections.map(x=>x[0]);
  Object.assign(c,{current_term:v.term,current_language:v.language,verification:v,prerequisites:v.prerequisites,automatic_recommendation_eligible:v.automatic_recommendation_eligible===true,recommendation_note:v.recommendation_note,current_metadata_source:v.source||c.current_metadata_source,current_catalog_status:fields.every(k=>v.fields[k]==='verified')?'verified':'needs_review'});
 }
 const jSource=JSON.parse(read('data/official-interdisciplinary-memberships.json'));
 const jEvidence=JSON.parse(read('data/interdisciplinary-verification.json'));
 const jDecisions=JSON.parse(read('data/interdisciplinary-review-decisions.json'));
 const jRuleIds=new Set(JSON.parse(read('data/j-rules.json')).rules.map(r=>r.id));
 for(const m of jSource.modules){
  const v=jEvidence.courses[m.module_code],fields=['identity','ects','groups','term','language','prerequisites','eligibility','counting'];
  if(!v||fields.some(k=>!['verified','pending'].includes(v.fields?.[k]))||!C.safeURL(v.source)||!C.safeURL(v.source_api)||!/^[a-f0-9]{64}$/.test(v.source_sha256||''))throw Error('Invalid J module evidence: '+m.module_code);
  if(v.automatic_recommendation_eligible&&(fields.some(k=>v.fields[k]!=='verified')||v.current_academic_year_selection_verified!==true||v.eligibility?.requires_confirmation||v.eligibility?.reviewed_source_sha256!==v.source_sha256||v.j_constraints?.is_language_course||!['WiSe','SoSe','WiSe/SoSe'].includes(v.term)||!['none','recommended'].includes(v.prerequisites?.kind)))throw Error('Unsupported J recommendation: '+m.module_code);
  const decision=jDecisions.reviews.find(d=>d.code===m.module_code);
  if(v.automatic_recommendation_eligible&&(!decision?.auto_candidate_supported||!decision.bilingual_checked||decision.source_sha256!==v.source_sha256))throw Error('J recommendation lacks matching reviewed source: '+m.module_code);
  if(v.curriculum_ects!==m.ects||v.fields.ects==='verified'&&v.handbook_ects!==m.ects||!v.j_constraints?.policy_rule_ids?.every(id=>jRuleIds.has(id)))throw Error('J credits or rule binding invalid: '+m.module_code);
  if(!m.module_detail_ids?.length||m.module_detail_ids.length!==1||!m.module_detail_urls?.every(C.safeURL)||!v.review_reasons_cn?.length||!v.counting_sources?.length||v.counting_sources.some(s=>!C.safeURL(s.url)))throw Error('Incomplete J source binding: '+m.module_code);
  const ects=m.ects===null?'待核实':String(m.ects);
  const patch={ects,current_term:v.term,current_language:v.language,allowed_groups:['J'],verification:v,prerequisites:v.prerequisites,j_constraints:v.j_constraints,automatic_recommendation_eligible:v.automatic_recommendation_eligible===true,recommendation_note:v.recommendation_note,current_metadata_source:v.source,current_catalog_status:fields.every(k=>v.fields[k]==='verified')?'verified':'needs_review',offering_url:m.current_offering_urls?.[0]};
  const c=courses.find(x=>x.module_code===m.module_code);
  if(c){if(m.ects!==null&&Number(c.ects)!==m.ects)throw Error('Existing J curriculum ECTS changed: '+m.module_code);Object.assign(c,patch);}
  else courses.push({module_code:m.module_code,module_name_legal_2025:m.name,section_2025:'J Support Electives',term_legal_annex:v.term,language_legal_annex:v.language,type:'扩展选修',notes_cn:'官方公开 RCI 20241、2026/27 学年 J 类模块。列入目录不等于已满足个人资格、获得名额或学校认可。',rule_cohort:'2024夏季起 · 请核对个人TUMonline归类',source_regulation:v.source,last_reviewed:v.checked_on,catalog_source:'current',...patch});
 }
 const curriculum=JSON.parse(read('data/official-curriculum.json'));
 const omitted=new Set(curriculum.site_omissions?.module_codes||[]);
 for(const m of curriculum.modules){
  const c=courses.find(x=>x.module_code===m.module_code);
  if(omitted.has(m.module_code)){if(c)throw Error('Intentionally unpublished module was loaded: '+m.module_code);continue;}
  if(!m.name?.trim()||m.module_detail_urls?.length!==1||!m.module_detail_urls.every(C.safeURL))throw Error('Invalid full curriculum source: '+m.module_code);
  if(!c||c.ects!==(m.ects===null?'待核实':String(m.ects))||JSON.stringify((c.allowed_groups||[c.section_2025[0]]).slice().sort())!==JSON.stringify(m.groups.slice().sort()))throw Error('Full curriculum membership mismatch: '+m.module_code);
  c.module_name_current=m.name;c.current_curriculum_checked_on=curriculum.checked_on;
  c.current_metadata_source=m.module_detail_urls[0];
 }
 if(new Set(courses.map(c=>c.module_code)).size!==courses.length)throw Error('Duplicate module code in current catalog');
 return courses;
};
