/* Search real course records using partial, reordered and mixed-language queries. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../assets/core'),S=require('../site3/search'),Picker=require('../site3/course-picker');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const courses=C.csv(read('data/courses_legal_2025.csv')),nav=JSON.parse(read('content/navigation.json')),ed=JSON.parse(read('content/editorial.json'));
const data={courses,names:ed.course_names_zh,synonyms:nav.synonyms};
const plan={version:2,cohort:'unknown',conditional:false,timeline:{count:4,start:'winter'},items:[]};
const docs=courses.map(c=>({id:c.module_code,code:c.module_code,kind:'course',title:c.module_name_legal_2025,summary:data.names[c.module_code],body:c.notes_cn,aliases:[c.module_code,data.names[c.module_code]],tasks:['study']}));
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
for(const [query,code] of [['computer advanced','IN2076'],['advanced architecture','IN2076'],['architecture computer advanced','IN2076'],['3D capture','IN2354'],['business basic','WI000159'],['robotics mobile','IN2404']]){
 test('catalog finds separate or reordered keywords: '+query,()=>assert.equal(S.search(docs,query,nav.synonyms)[0]?.code,code));
 test('semester picker finds the same keywords: '+query,()=>assert.equal(Picker.choices(data,plan,1,{query})[0]?.code,code));
}
test('Spaced module codes still resolve, including a title keyword',()=>{
 assert.equal(S.search(docs,'in 2067',nav.synonyms)[0]?.code,'IN2067');
 assert.equal(S.search(docs,'IN 2076 advanced',nav.synonyms)[0]?.code,'IN2076');
});
test('Existing Chinese, abbreviation and phrase synonyms still resolve',()=>{
 for(const q of ['机器学习','ML','machine learning','what is machine learning'])assert.equal(S.search(docs,q,nav.synonyms)[0]?.code,'IN2064',q);
});
test('Common English course questions do not require the request verb in a course title',()=>{
 for(const [q,code] of [['how do I find machine learning course','IN2064'],['I need advanced computer architecture','IN2076'],['find IN 2067','IN2067']]){
  assert.equal(S.search(docs,q,nav.synonyms)[0]?.code,code,q);assert.equal(Picker.choices(data,plan,1,{query:q})[0]?.code,code,q);
 }
 assert.equal(S.search(docs,'find machine learning 火锅xyz',nav.synonyms).length,0);
});
test('Every meaningful query term must match; unknown terms do not produce a result',()=>{
 assert.equal(S.search(docs,'advanced 火锅xyz',nav.synonyms).length,0);
 assert.equal(S.search(docs,'business robotics basic',nav.synonyms).length,0);
});
test('Punctuation and repeated whitespace do not hide a multi-word match',()=>assert.equal(S.search(docs,'  architecture,   advanced  ',nav.synonyms)[0]?.code,'IN2076'));
test('Short aliases do not split collaborative or laboratory inside a longer word',()=>{
 const topics=C.csv(read('data/topics_ws2026_27.csv')).map(t=>({id:t.id,kind:'topic',title:t.topic,summary:t.module,body:t.course_type,aliases:[t.topic_tag,t.module],tasks:['research']}));
 for(const [query,id] of [['collaborative robotics','S014'],['laboratory design','S028']])assert(S.search(topics,query,nav.synonyms).some(d=>d.id===id),query);
});
test('An abbreviation followed by a digit is not silently treated as the shorter alias',()=>{
 assert.equal(S.search(docs,'ML2',nav.synonyms).length,0);
 const lab={id:'lab',kind:'resource',title:'Research Lab',summary:'',body:'',aliases:[],tasks:[]};
 assert.equal(S.search([lab],'lab2',nav.synonyms).length,0);assert.equal(S.search([lab],'lab',nav.synonyms)[0]?.id,'lab');
});
test('Long aliases and Chinese names do not discard a meaningful numeric suffix',()=>{
 for(const query of ['machine learning2','machinelearning2','robotics2','deep learning2','机器学习2','roboticsx']){
  assert.equal(S.search(docs,query,nav.synonyms).length,0,query);assert.equal(Picker.choices(data,plan,1,{query}).length,0,query);
 }
 assert.equal(S.search(docs,'machine learning',nav.synonyms)[0]?.code,'IN2064');
});
test('Full-width alphabet input receives the same abbreviation normalization',()=>assert.equal(S.search(docs,'ＭＬ',nav.synonyms)[0]?.code,'IN2064'));
test('German accents stay in one word and synonyms cannot consume a noun prefix',()=>{
 const d={id:'CLA21023',code:'CLA21023',kind:'course',title:'Entspannt Prüfungen bestehen',summary:'',body:'',aliases:[],tasks:['study']};
 assert.equal(S.search([d],d.title,nav.synonyms)[0]?.id,d.id);assert.equal(S.search([d],'Prüfungen',nav.synonyms)[0]?.id,d.id);
 assert(S.terms(d.title,nav.synonyms).some(g=>g.includes('prüfungen')));
});
console.log(count+' keyword search checks passed');
