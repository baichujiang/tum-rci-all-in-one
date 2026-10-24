'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),C=require('../assets/core');
module.exports=function loadCourseTopics(root=path.resolve(__dirname,'..')){
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/course-topics.json'),'utf8'));
 const source='https://www.cit.tum.de/en/cit/studies/students/examination-matters-modules/informatics/practical-courses-seminar-courses/';
 if(catalog.version!==1||catalog.sourceType!=='remaining_spots'||catalog.sourceURL!==source||!/^\d{4}-\d{2}-\d{2}$/.test(catalog.checkedOn)||!Number.isFinite(Date.parse(catalog.checkedOn))||new Date(catalog.checkedOn).toISOString().slice(0,10)!==catalog.checkedOn||!/^[a-f0-9]{64}$/.test(catalog.sourceSHA256)||!Array.isArray(catalog.entries)||!catalog.entries.length||catalog.entries.length>2000)throw Error('Invalid course topic source metadata');
 const used=new Set();
 for(const entry of catalog.entries){
  const topic=C.validateTopic(entry,entry.module),digest=crypto.createHash('sha256').update(topic.title).digest('hex').slice(0,12);
  const section=entry.module==='IN2106'?'sec5152':'sec5153';
  if(used.has(entry.id)||entry.id!==`${entry.module}-${topic.term}-${digest}`||entry.sourceURL!==source+'#'+section||!new RegExp('\\b'+entry.module+'\\b').test(entry.title))throw Error('Invalid or duplicate course topic: '+entry.id);
  used.add(entry.id);
 }
 for(const code of ['IN2106','IN2107'])if(!catalog.entries.some(x=>x.module===code))throw Error('Missing course topics for '+code);
 return catalog;
};
