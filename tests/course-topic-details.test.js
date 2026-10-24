'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const catalog=require('../scripts/load-course-topics')(),load=require('../scripts/load-course-topic-details'),view=require('../scripts/course_topic_detail_view'),Topics=require('../site3/course-topics');
const metadata=require('../data/course-topic-details.json'),editorial=require('../content/course-topic-summaries.json'),websites=require('../data/course-topic-website-evidence.json'),details=load(catalog),copy=x=>JSON.parse(JSON.stringify(x));
let checks=0;function test(name,fn){fn();checks++;console.log('PASS',name);}
test('Every remaining-list topic resolves to its own current-term official course, not the generic module',()=>{
 assert.equal(Object.keys(details).length,catalog.entries.length);assert.equal(new Set(Object.values(details).map(x=>x.courseId)).size,catalog.entries.length);
 for(const topic of catalog.entries){const d=details[topic.id];assert.equal(d.term,topic.term);assert.equal(load.normalize(d.officialTitle),load.normalize(topic.title));assert(d.teachers.length);assert(d.officialURL.endsWith(d.courseId));assert(!d.officialURL.includes('/modules/'));}
 const titles=Object.values(details).map(x=>x.officialTitle);assert(titles.some(x=>x.includes("Master's Seminar")));
});
test('Content coverage is explicit and missing or reference-only descriptions never become invented summaries',()=>{
 assert.equal(Object.values(details).filter(x=>x.overview).length,142);assert.equal(Object.values(details).filter(x=>x.prerequisites).length,122);
 assert.equal(Object.values(details).filter(x=>x.topics).length,142);assert.equal(Object.values(details).filter(x=>x.activities).length,133);assert.equal(Object.values(details).filter(x=>x.outcomes).length,98);
 for(const topic of catalog.entries){const d=details[topic.id],html=view(topic,d);assert(html.includes(require('../assets/core').esc(d.overview||'未提供具体内容介绍')));assert(html.includes(require('../assets/core').esc(d.prerequisites||'不能据此认定没有要求')));assert(html.includes('添加到候选清单'));assert(!html.includes('undefined'));}
 const empty=catalog.entries.find(t=>t.title.includes('Advanced magnetic sensing'));assert.equal(details[empty.id].overview,null);assert(!view(empty,details[empty.id]).includes('研究磁传感'));
});
test('Replaced source hashes, stale terms, unrelated titles and missing topic coverage fail closed',()=>{
 const id=catalog.entries[0].id;
 for(const mutate of [m=>m.records[id].sourceSHA256='0'.repeat(64),m=>m.records[id].term='2025W',m=>m.records[id].officialTitle='Unrelated Seminar (IN2107)',m=>delete m.records[id],m=>m.records[id].sourceAPI='https://evil.example/'+m.records[id].courseId]){const bad=copy(metadata);mutate(bad);assert.throws(()=>load.validate(catalog,bad,editorial,websites),/Invalid course topic details/);}
 const bad=copy(editorial);bad.records[id].sourceFields.overview=[];assert.throws(()=>load.validate(catalog,metadata,bad,websites),/evidence/);
});
test('Standalone details preserve base paths and credit identity, and safely escape all source text',()=>{
 const topic=catalog.entries[0],d={...details[topic.id],overview:'<script>alert(1)</script>',topics:['<img src=x onerror=alert(2)>'],teachers:['<img src=x onerror=alert(1)>']},html=view(topic,d,{base:'/rci'});
 assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>alert'));assert(!html.includes('<img src=x'));assert(html.includes('href="/rci/courses/IN2107/"'));assert(html.includes('data-course-topic-open="IN2107"'));assert(html.includes('data-topic-pick="'+topic.id+'"'));assert(html.includes('data-topic-target="topic-detail-semester"'));assert(!html.includes('data-add='));
 assert.equal(Topics.detailURL(topic,'/rci'),'/rci/courses/IN2107/topics/'+topic.id+'/');
});
test('Public detail metadata excludes original descriptions, account identifiers and meeting credentials',()=>{
 const raw=JSON.stringify(metadata);for(const token of ['passcode','meeting.id','personId','gender','teams.microsoft','zoom.us','courseContent":"'])assert(!raw.includes(token));
 for(const topic of catalog.entries){const d=details[topic.id],source=editorial.records[topic.id];for(const key of load.fields)if(d[key])assert(source.sourceFields[key].every(field=>field.startsWith('website:')?websites.records[topic.id].sources.some(x=>x.key===field.slice(8)):metadata.records[topic.id].fields[field].available));}
});
test('Detailed sections remain grounded, structured and complete rather than reverting to a short overview',()=>{
 const id=catalog.entries[0].id;
 for(const mutate of [s=>s.records[id].topics_cn=[],s=>s.records[id].topics_cn='a collapsed summary',s=>delete s.records[id].activities_cn,s=>s.records[id].sourceFields.topics=[],s=>s.records[id].sourceFields.topics=['unverifiedField'],s=>s.records[id].topics_cn=null]){
  const bad=copy(editorial);mutate(bad);assert.throws(()=>load.validate(catalog,metadata,bad,websites),/Invalid course topic details/);
 }
 for(const topic of catalog.entries){const d=details[topic.id],html=view(topic,d);for(const key of ['topics','activities','outcomes'])for(const text of d[key]||[])assert(html.includes(require('../assets/core').esc(text)));assert(html.includes('id="topic-content"'));assert(html.includes('id="topic-work"'));assert(html.includes('id="topic-requirements"'));assert(html.includes('id="topic-learning"'));}
});
test('Specific project work, source-specific grades and eligibility survive the expanded summaries',()=>{
 const find=title=>details[catalog.entries.find(t=>t.title.includes(title)).id];
 const robot=find('Teaching Robots a Spatial Language');assert(robot.topics.some(t=>t.includes('潜在空间表示')&&t.includes('学习式控制')));assert(robot.activities.some(t=>t.includes('书面报告')));assert(robot.assessment.includes('实际演示'));
 const network=find('Networked AI Systems');assert(network.assessment.includes('40%'));assert(network.assessment.includes('60%'));assert(network.activities.some(t=>t.includes('一页')));
 const medicine=find('Learning from Incomplete Patient Data');assert(medicine.activities.some(t=>t.includes('实现、训练和评估')));assert(medicine.assessment.includes('海报'));
 const trusted=find('Trustworthy Machine Learning');assert(trusted.prerequisites.includes('优于 2.0'));assert(trusted.activities.some(t=>t.includes('7–14')));
 const unknown=find('Advanced magnetic sensing');assert.equal(unknown.topics,null);assert.equal(unknown.activities,null);assert.equal(unknown.outcomes,null);assert(!view(catalog.entries.find(t=>t.title.includes('Advanced magnetic sensing')),unknown).includes('学完能做什么'));
});
test('Registration restrictions, source conflicts and nonstandard assessment fields remain visible',()=>{
 const find=title=>{const topic=catalog.entries.find(t=>t.title.toLowerCase().includes(title.toLowerCase()));assert(topic,'Missing topic: '+title);return {topic,detail:details[topic.id]};};
 const closed=find('Deep Learning for Human Modelling'),closedHTML=view(closed.topic,closed.detail);
 assert(closedHTML.includes('不再接受申请'));assert(closedHTML.includes('加入候选仅用于本地规划'));assert(closedHTML.includes('名额可能已变化'));
 const ilab=find('IlabX');assert(ilab.detail.prerequisites.includes('iLab1／iLab2 互斥'));
 const political=find('Digital Future Challenge');assert(political.detail.prerequisites.includes('仅接受政治学本科生'));assert(political.detail.prerequisites.includes('不一致'));
 const schedule=find('Applied Machine Learning in Medicine and Natural Sciences');assert(schedule.detail.teaching.includes('每周研讨'));assert(schedule.detail.teaching.includes('集中授课'));assert(schedule.detail.teaching.includes('不一致'));
 const trusted=find('Trustworthy Machine Learning');assert(trusted.detail.prerequisites.includes('preferably'));assert(trusted.detail.prerequisites.includes('是否为硬性门槛'));
 const storage=find('Modern Storage Technologies');assert(storage.detail.assessment.includes('讨论参与'));assert.deepEqual(editorial.records[storage.topic.id].sourceFields.assessment,['courseRegistrationInfo']);
 const attendance=find('Large Language Models in Medicine');assert(attendance.detail.prerequisites.includes('最多缺席一次'));assert(attendance.detail.prerequisites.includes('两场展示均须参加'));
 const leadership=find('Technical Project Leadership');assert(leadership.detail.teaching.includes('项目工作可完全远程'));assert(leadership.detail.teaching.includes('展示须到现场'));
});
test('Current official website supplements are identity-checked, hash-bound and visible without adding sections',()=>{
 assert.equal(Object.keys(websites.records).length,13);assert.equal(Object.values(details).filter(x=>!x.overview).length,4);
 assert.equal(Object.keys(load.validate(catalog,metadata,editorial,websites)).length,146);
 const topic=catalog.entries.find(t=>t.title.includes('Advanced Security Analysis')),id=topic.id,html=view(topic,details[id]);
 for(const mutate of [w=>w.records[id].courseId='123',w=>w.records[id].term='2025W',w=>w.records[id].sources[0].term='2025W',w=>w.records[id].sources[0].sourceSHA256='0'.repeat(64),w=>w.records[id].sources[0].url='https://untrusted.example/course',w=>delete w.records[id]]){
  const bad=copy(websites);mutate(bad);assert.throws(()=>load.validate(catalog,metadata,editorial,bad),/Invalid course topic details/);
 }
 const bad=copy(editorial);bad.records[id].sourceFields.topics=['website:unverified'];assert.throws(()=>load.validate(catalog,metadata,bad,websites),/evidence/);
 assert(html.includes('查看当期说明会资料（PDF）'));assert(html.includes('40%'));assert(html.includes('30%'));
 for(const t of catalog.entries){const page=view(t,details[t.id]);assert.equal((page.split('<aside')[0].match(/<h2\b/g)||[]).length,3);for(const source of details[t.id].websiteSources)assert(page.includes(require('../assets/core').esc(source.url)));}
});
test('Course-specific rules override generic material and new source contradictions remain explicit',()=>{
 const find=title=>details[catalog.entries.find(t=>t.title.includes(title)).id];
 const physics=find('Deep Learning in Physics');assert(physics.activities.some(t=>t.includes('25 分钟')));assert(physics.activities.some(t=>t.includes('最多四页')));assert(!physics.assessment.includes('75%'));
 const graphics=find('Deep Learning in Computer Graphics');assert(graphics.sourceReviewNote.includes('2027 年 1 月 11 日'));assert(graphics.sourceReviewNote.includes('第三次缺席'));
 const supply=find('Software-Supply Chain Security');assert(supply.assessment.includes('50%'));assert(supply.sourceReviewNote.includes('八页'));assert(supply.sourceReviewNote.includes('十页'));
 const vr=find('Virtual Reality Applications');assert.equal(vr.overview,null);assert(vr.sourceReviewNote.includes('通用模块'));assert.equal(vr.assessment,null);
 const sensing=find('Sensing strategies and control');assert.equal(sensing.overview,null);assert(sensing.sourceReviewNote.includes('不套用 Actuation'));
 const emerging=find('Emerging Topics in Machine Learning');assert(emerging.activities.some(t=>t.includes('一至两篇')));assert(emerging.prerequisites.includes('失去席位'));
 const applied=find('Applied Machine Learning in Medicine and Natural Sciences');assert(!applied.activities.join(' ').includes('每周研讨'));assert(applied.teaching.includes('不一致'));
});
console.log(checks+' course topic detail checks passed');
