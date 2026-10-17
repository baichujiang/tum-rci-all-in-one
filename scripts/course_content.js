/* Validate editorial coverage against maintenance evidence before publishing. */
'use strict';
const assert=require('node:assert/strict');
const fields=['overview','teaching','assessment'],hourKeys=['total','contact','self_study'];
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const officialURL=s=>{try{const u=new URL(s);return u.protocol==='https:'&&(u.hostname==='tum.de'||u.hostname.endsWith('.tum.de'))&&!u.username&&!u.password;}catch(_){return false;}};
module.exports=function validateCourseContent(summaries,evidence,courses,inventory){
 const codes=courses.map(c=>c.module_code).sort(),records=evidence.courses;
 assert.equal(evidence.schema_version,1,'Unsupported course content evidence');
 assert.deepEqual(Object.keys(summaries).sort(),codes,'Course content must cover every published course exactly once');
 assert.deepEqual(Object.keys(records).sort(),codes,'Course content evidence must cover every published course exactly once');
 const modules=new Map(inventory.modules.map(m=>[m.module_code,m]));
 for(const code of codes){
  const s=summaries[code],r=records[code],fail=message=>assert.fail(code+': '+message);
  if(r.module_code!==code||!['module_handbook','official_course_page','official_regulation'].includes(s.source_type))fail('Invalid source identity');
  for(const key of ['source_type','source_url','source_api','source_sha256','checked_on','source_period','source_current_year'])if(s[key]!==r[key])fail('Source metadata differs: '+key);
  if(!officialURL(s.source_url)||!hash(s.source_sha256)||!/^\d{4}-\d{2}-\d{2}$/.test(s.checked_on)||typeof s.source_current_year!=='boolean'||!s.source_period)fail('Missing official source evidence');
  if(s.source_type==='module_handbook'){
   const id=s.source_api?.match(/^https:\/\/campus\.tum\.de\/tumonline\/ee\/rest\/slc\.cm\.reg\/student\/modules\/detail\/(\d+)\/(\d+)$/)?.[1];
   if(!id||!s.source_url.includes('/modules/detail/light/'+id+'/'))fail('Handbook API and student link must identify the same module');
   const m=modules.get(code)?.handbook_check;
   if(m&&(m.source_api!==s.source_api||m.source_sha256!==s.source_sha256||m.selected_semester_label!==s.source_period||m.current_academic_year_selection_verified!==s.source_current_year))fail('Handbook differs from verified curriculum snapshot');
   for(const key of [...fields,...hourKeys])if(!r.fields[key]||!hash(r.fields[key].sha256))fail('Missing selected field hash: '+key);
  }
  for(const key of fields){
   const status=s.field_status?.[key],value=s[key+'_cn'],f=r.fields[key];
   if(!['available','not_provided','unclear','pending'].includes(status)||!f)fail('Missing field decision: '+key);
   if(status==='available'){
    if(typeof value!=='string'||!value.trim()||value.startsWith('@')||f.status!=='present')fail('Summary has no supporting field: '+key);
    if(s.source_type!=='module_handbook'&&!f.locator)fail('Fallback source requires a field locator');
   }else if(value!==undefined||(status==='unclear')!==(f.status==='present'))fail('Missing or unclear evidence must not produce a summary: '+key);
  }
  for(const key of ['topics_cn','selection_notes_cn'])if(s[key]&&(!Array.isArray(s[key])||!s[key].length||s[key].some(v=>typeof v!=='string'||!v.trim())))fail('Invalid '+key);
  for(const [key,property] of [['syllabus','topics_cn'],['outcomes','outcomes_cn'],['assignments','assignments_cn']]){
   const status=s.field_status?.[key],value=s[property],f=r.fields[key];
   if(!['available','not_provided','unclear','pending'].includes(status)||!f)fail('Missing expanded field decision: '+key);
   if(status==='available'){
    if(!Array.isArray(value)||!value.length||value.some(v=>typeof v!=='string'||!v.trim()||v.startsWith('@'))||f.status!=='present')fail('Expanded content has no supporting field: '+key);
   }else if(value!==undefined||key!=='assignments'&&(status==='unclear')!==(f.status==='present'))fail('Missing expanded evidence must not produce content: '+key);
   if(key==='syllabus'&&JSON.stringify(f)!==JSON.stringify(r.fields.overview))fail('Syllabus must use the official content field');
   if(key==='outcomes'&&s.source_type==='module_handbook'&&!hash(f.sha256))fail('Missing learning outcome field hash');
   if(key==='assignments'){
    if(!Array.isArray(f.sources)||!f.sources.length)fail('Missing activity sources');
    if(status==='available'&&!f.sources.some(source=>source.status==='present'))fail('Activity has no available teaching or assessment source');
    for(const source of f.sources){const original=r.fields[source.field];if(!['teaching','assessment'].includes(source.field)||!original||Object.keys(original).some(k=>source[k]!==original[k]))fail('Activity source does not match teaching or assessment evidence');}
   }
  }
  const values=r.workload_values,keys=Object.keys(values);
  if(keys.some(k=>!hourKeys.includes(k)||!Number.isFinite(values[k])||values[k]<0)||values.total===0)fail('Invalid source hours');
  const conflict=keys.length===3&&Math.abs(values.total-values.contact-values.self_study)>.01;
  const status=conflict?'conflict':keys.length===3?'available':keys.length?'partial':'not_provided';
  if(s.workload_status!==status)fail('Incorrect workload availability');
  if(status==='available'||status==='partial')assert.deepEqual(s.workload_hours,values,code+': published hours differ from source');
  else if(s.workload_hours!==undefined)fail('Missing or conflicting hours must not be published as a valid total');
 }
};
