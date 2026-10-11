/* Build integrity and representative retrieval assertions. Not a student usability study. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),S=require('../site3/search.js');
const index=JSON.parse(fs.readFileSync(path.join(dist,'assets/search-index.json'),'utf8'));
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
const top=q=>S.search(index.docs,q,index.synonyms)[0]?.id;
for(const [q,id] of [['IN2067','course:IN2067'],['in 2067','course:IN2067'],['机器学习','course:IN2064'],['machine learning','course:IN2064'],['machine learning course','course:IN2064'],['ML','course:IN2064'],['实验课怎么选','guide:matching'],['实习课','guide:matching'],['研讨课','guide:matching'],['怎么报名考试','guide:exams'],['考试报名怎么办','guide:exams'],['how do I register for exams','guide:exams'],['找论文','guide:thesis'],['硕士论文','guide:thesis'],['moodle','R031'],['where is moodle','R031'],['TUMonline','R010'],['ROS 2','R069'],['机器人操作系统','R069'],['找房','guide:housing'],['学费','guide:finance'],['实习','guide:career'],['HiWi','guide:career'],['转学分','guide:help'],['深度学习','course:IN2346']])test('retrieval: '+q,()=>assert.equal(top(q),id));
test('ML does not match TUM Live or housing',()=>{const ids=S.search(index.docs,'机器学习',index.synonyms).map(d=>d.id);assert(!ids.includes('R032'));assert(!ids.includes('R112'));});
test('unknown query yields no invented answer',()=>assert.equal(S.search(index.docs,'量子火锅xyz',index.synonyms).length,0));
test('question result prefers guidance over a historic topic',()=>assert.equal(top('实验课怎么选'),'guide:matching'));
test('exact code always resolves to the module',()=>{for(const d of index.docs.filter(d=>d.kind==='course'))assert.equal(top(d.code),d.id);});
test('all main guides unique in search, archives not indexed',()=>{assert.equal(index.docs.filter(d=>d.kind==='guide').length,15);assert(!index.docs.some(d=>d.url.startsWith('/archive/')));assert.equal(new Set(index.docs.map(d=>d.id)).size,index.docs.length);});
test('resource duplicates merged by canonical URL',()=>{const ds=index.docs.filter(d=>d.direct);assert.equal(new Set(ds.map(d=>d.url.replace(/\/$/,''))).size,ds.length);});
test('task filter is enforced',()=>assert(S.search(index.docs,'',index.synonyms,{task:'life'}).every(d=>d.tasks.includes('life'))));
test('kind filter is enforced',()=>assert(S.search(index.docs,'',index.synonyms,{kind:'course'}).every(d=>d.kind==='course')));
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):[path.join(p,x.name)]),html=walk(dist).filter(p=>p.endsWith('.html'));
test('75 prerendered pages and exactly one H1 per page',()=>{assert.equal(html.length,75);for(const p of html)assert.equal((fs.readFileSync(p,'utf8').match(/<h1[ >]/g)||[]).length,1,p);});
test('all local assets and links resolve',()=>{const build=JSON.parse(fs.readFileSync(path.join(dist,'build-info.json'),'utf8'));for(const p of html){const txt=fs.readFileSync(p,'utf8');for(const m of txt.matchAll(/(?:href|src)="([^"]+)"/g)){if(!m[1].startsWith('/'))continue;let u=decodeURIComponent(m[1].split(/[?#]/)[0]);if(build.base){assert(u.startsWith(build.base+'/'));u=u.slice(build.base.length);}let target=path.join(dist,u);if(u.endsWith('/'))target=path.join(target,'index.html');assert(fs.existsSync(target),p+' -> '+u);}}});
test('no raw API credentials, CDN scripts or analytics in emitted markup',()=>{for(const p of html){const txt=fs.readFileSync(p,'utf8');assert(!/src="https?:|ghp_[A-Za-z0-9]+|sk_live_|googletagmanager/.test(txt),p);}});
test('main answers rendered without fetching or JS',()=>{const s=fs.readFileSync(path.join(dist,'guides/exams/index.html'),'utf8');assert(s.includes('选了课，还需要报名考试吗？'));assert(s.includes('先看答案'));assert(s.includes('接下来这样做'));assert(s.includes('IN2106'));});
test('course sources and status retained in static pages',()=>{const s=fs.readFileSync(path.join(dist,'courses/IN2067/index.html'),'utf8');assert(s.includes('2025'));assert(s.includes('历史整理'));assert(s.includes('campus.tum.de'));});
test('old source records retained',()=>{const info=JSON.parse(fs.readFileSync(path.join(dist,'build-info.json'),'utf8'));assert.equal(info.resources,125);assert.equal(info.courses,35);assert.equal(info.topics,58);});

// A public documentation page is not the application itself. Guard real destinations.
const matchingSystem='https://matching-in.cit.tum.de/';
const matchingInfo='https://www.cit.tum.de/en/cit/studies/students/examination-matters-modules/informatics/practical-courses-seminar-courses/';
const matchingGuide=fs.readFileSync(path.join(dist,'guides/matching/index.html'),'utf8');
test('Matching search resource opens the actual platform',()=>{const d=index.docs.find(d=>d.id==='R030');assert(d);assert.equal(d.url,matchingSystem);assert.equal(d.direct,true);assert(d.title.includes('直接进入系统'));});
test('Matching home shortcut does not point at documentation',()=>{const s=fs.readFileSync(path.join(dist,'index.html'),'utf8');const a=[...s.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(m=>/class="shortcut"/.test(m[1])&&m[2].includes('Matching'));assert(a);assert(a[1].includes('href="'+matchingSystem+'"'));});
test('Matching guide offers system first and separate explanation second',()=>{const actions=matchingGuide.match(/<div class="actions">([\s\S]*?)<\/div>/);assert(actions);const links=[...actions[1].matchAll(/href="([^"]+)"/g)].map(m=>m[1]);assert.equal(links[0],matchingSystem);assert.equal(links[1],matchingInfo);assert(actions[1].includes('非报名系统'));});
test('Matching guide records login boundary and independent documentation source',()=>{assert(matchingGuide.includes('TUM login'));assert(matchingGuide.includes('Exchange student login'));assert(matchingGuide.includes('个人实例与当期名额未核验'));assert(matchingGuide.includes('https://collab.dvb.bayern/spaces/TUMdmatching/pages/2205033162/'));});
console.log(count+' site checks passed');
