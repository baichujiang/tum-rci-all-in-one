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
  if(!row.module_detail_urls?.length||!row.module_detail_urls.every(C.safeURL)||!row.review_date||!['G','H','I','J'].includes(row.section?.[0]))throw Error('Current course evidence incomplete: '+row.module_code);
  const patch={current_term:row.term,current_language:row.language,offering_url:row.current_offering_urls?.[0],allowed_groups:row.accepted_sections.map(x=>x[0]),automatic_recommendation_eligible:row.automatic_recommendation_eligible===true,current_metadata_source:row.module_detail_urls[0]};
  const existing=courses.find(c=>c.module_code===row.module_code);
  if(existing){Object.assign(existing,patch);continue;}
  courses.push({module_code:row.module_code,module_name_legal_2025:row.name,section_2025:row.section,ects:String(row.ects),term_legal_annex:row.term,language_legal_annex:row.language,type:'扩展选修',notes_cn:'官方公开 RCI 课程树（20241、2026/27 学年）扩展模块；手册周期不是当期名额或时间承诺。',rule_cohort:'2024夏季起 · 请核对个人TUMonline归类',source_regulation:row.module_detail_urls[0],last_reviewed:row.review_date,catalog_source:'current',...patch});
 }
 for(const [code,patch] of Object.entries(overrides.courses)){
  const c=courses.find(x=>x.module_code===code);
  if(!c||!C.safeURL(patch.current_metadata_source))throw Error('Invalid current metadata override: '+code);
  Object.assign(c,patch);
 }
 for(const m of memberships.modules){
  const c=courses.find(x=>x.module_code===m.module_code),v=evidence.courses[m.module_code];
  if(!c||Number(c.ects)!==m.ects||!v)throw Error('Current membership or verification missing: '+m.module_code);
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
 if(new Set(courses.map(c=>c.module_code)).size!==courses.length)throw Error('Duplicate module code in current catalog');
 return courses;
};
