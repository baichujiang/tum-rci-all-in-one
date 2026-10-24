'use strict';
const fs=require('node:fs'),path=require('node:path');
const fields=['overview','topics','activities','outcomes','teaching','assessment','prerequisites'];
const listFields=new Set(['topics','activities','outcomes']);
const sourceFields=new Set(['courseContent','previousKnowledge','courseObjective','teachingMethod','assessmentScheme','courseRegistrationInfo','comments']);
function normalize(title){return title.normalize('NFKC').replace(/Master['’]s\b/gi,'Master').replace(/\([^)]*\b(?:IN|MW|ED|SOT)\d+[^)]*\)/g,'').replace(/\b(?:IN|MW|ED|SOT)\d+[._\d]*\b/g,'').toLowerCase().replace(/[^\p{L}\p{N}_]+/gu,'');}
function validate(catalog,metadata,editorial,websites={version:1,checkedOn:metadata.checkedOn,records:{}}){
 const fail=message=>{throw Error('Invalid course topic details: '+message);},sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 if(metadata.version!==1||editorial.version!==2||!date(metadata.checkedOn)||metadata.checkedOn!==editorial.checkedOn)fail('source date/version');
 const ids=new Set(catalog.entries.map(x=>x.id)),details={};
 if(websites.version!==1||websites.checkedOn!==metadata.checkedOn||!websites.records||Object.keys(websites.records).some(id=>!ids.has(id)))fail('website evidence coverage/date');
 for(const source of [metadata.records,editorial.records])if(!source||Object.keys(source).length!==ids.size||Object.keys(source).some(id=>!ids.has(id)))fail('incomplete topic coverage');
 for(const topic of catalog.entries){
  const id=topic.id,m=metadata.records[id],s=editorial.records[id];
  if(m.topicTitle!==topic.title||m.term!==topic.term||!new RegExp('\\b'+topic.module+'\\b').test(m.officialTitle)||normalize(m.officialTitle)!==normalize(topic.title)||!/^\d+$/.test(m.courseId)||m.officialURL!=='https://campus.tum.de/tumonline/ee/ui/ca2/app/desktop/#/slc.tm.cp/student/courses/'+m.courseId||m.sourceAPI!=='https://campus.tum.de/tumonline/ee/rest/slc.tm.cp/student/courses/'+m.courseId||!sha(m.sourceSHA256)||s.sourceSHA256!==m.sourceSHA256)fail(id+' source identity/hash');
  for(const key of ['teachers','languages'])if(!Array.isArray(m[key])||m[key].some(x=>typeof x!=='string'||!x.trim()||x.length>180))fail(id+' '+key);
  if(m.organization!==null&&(typeof m.organization!=='string'||m.organization.length>400))fail(id+' organization');
  const website=websites.records[id],webSources=new Map();
  if(website){
   if(website.courseId!==m.courseId||website.term!==m.term||!Array.isArray(website.sources)||website.sources.length>4||website.reviewNote_cn!==null&&(typeof website.reviewNote_cn!=='string'||!website.reviewNote_cn.trim()||website.reviewNote_cn.length>900))fail(id+' website identity/note');
   for(const source of website.sources){
    let url;try{url=new URL(source.url);}catch{fail(id+' website URL');}
    if(!/^[a-z][a-z0-9-]*$/.test(source.key)||webSources.has(source.key)||url.protocol!=='https:'||!/(^|\.)(tum\.de|lmu\.de)$/.test(url.hostname)||url.username||url.password||url.hash||/token|password|passcode|[?&]pwd=/i.test(url.href)||source.term!==m.term||source.checkedOn!==websites.checkedOn||!sha(source.sourceSHA256)||s.websiteSourceHashes?.[source.key]!==source.sourceSHA256||typeof source.label!=='string'||!source.label.trim()||source.label.length>120||typeof source.identityNote!=='string'||!source.identityNote.trim())fail(id+' website evidence identity/hash');
    webSources.set(source.key,source);
   }
  }
  if(Object.keys(s.websiteSourceHashes||{}).length!==webSources.size||Object.keys(s.websiteSourceHashes||{}).some(key=>!webSources.has(key)))fail(id+' website evidence hashes');
  const prose={};
  for(const key of fields){
   const value=s[key+'_cn'],refs=s.sourceFields?.[key];
   const validText=text=>typeof text==='string'&&!!text.trim()&&text.length<=1800;
   if(value!==null&&(listFields.has(key)?!Array.isArray(value)||!value.length||value.length>12||value.some(x=>!validText(x))||new Set(value).size!==value.length:!validText(value)))fail(id+' '+key);
   if(!Array.isArray(refs)||new Set(refs).size!==refs.length||value!==null&&!refs.length||value===null&&refs.length||refs.some(field=>typeof field!=='string'||(field.startsWith('website:')?!webSources.has(field.slice(8)):!sourceFields.has(field)||!m.fields?.[field]?.available||!sha(m.fields[field].sha256))))fail(id+' '+key+' evidence');
   prose[key]=value;
  }
  if(prose.overview&&!prose.topics)fail(id+' summary without detailed content');
  details[id]={...m,...prose,checkedOn:metadata.checkedOn,websiteSources:[...webSources.values()].map(({url,label})=>({url,label})),sourceReviewNote:website?.reviewNote_cn||null};
 }
 return details;
}
module.exports=function loadCourseTopicDetails(catalog,root=path.resolve(__dirname,'..')){
 return validate(catalog,JSON.parse(fs.readFileSync(path.join(root,'data/course-topic-details.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'content/course-topic-summaries.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'data/course-topic-website-evidence.json'),'utf8')));
};
module.exports.validate=validate;module.exports.normalize=normalize;module.exports.fields=fields;
