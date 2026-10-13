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
test('every indexed item can be found by its displayed title',()=>{
 for(const d of index.docs)assert(S.search(index.docs,d.title,index.synonyms,{kind:d.kind}).some(found=>found.id===d.id),d.id+' '+d.title);
});
test('all main guides unique in search, archives not indexed',()=>{assert.equal(index.docs.filter(d=>d.kind==='guide').length,15);assert(!index.docs.some(d=>d.url.startsWith('/archive/')));assert.equal(new Set(index.docs.map(d=>d.id)).size,index.docs.length);});
test('resource duplicates merged by canonical URL',()=>{const ds=index.docs.filter(d=>d.direct);assert.equal(new Set(ds.map(d=>d.url.replace(/\/$/,''))).size,ds.length);});
test('Merged directories use the broad destination name while retaining historical IDs',()=>{
 const matching=index.docs.find(d=>d.resource_ids?.includes('R029')),labs=index.docs.find(d=>d.resource_ids?.includes('R055'));
 assert.equal(matching.title,'Matching 官方说明与余位（非报名系统）');assert.equal(matching.id,'R044');
 assert.equal(labs.title,'MIRMI Research Labs');assert.equal(labs.id,'R059');
 assert(labs.summary.includes('Flying/Ground/Underwater'));assert(matching.summary.includes('不是系统登录页'));
});
test('merged resource entries remain searchable by every original title',()=>{
 const original=require('../assets/core').csv(fs.readFileSync(path.join(root,'data/resources.csv'),'utf8')),canonical=url=>url.replace(/\/$/,'');
 for(const r of original.filter(r=>original.filter(other=>canonical(other.url)===canonical(r.url)).length>1)){
  const found=S.search(index.docs,r.title,index.synonyms,{kind:'resource'})[0];assert.equal(found&&canonical(found.url),canonical(r.url),r.id+' '+r.title);
 }
});
test('merged resource entries retain their original descriptions and task categories',()=>{
 const lab=S.search(index.docs,'Flying Ground',index.synonyms,{kind:'resource'})[0];assert(lab?.resource_ids.includes('R055'));
 const language=index.docs.find(d=>d.id==='R122');assert(language.tasks.includes('life'));assert(language.tasks.includes('exams'));
});
test('task filter is enforced',()=>assert(S.search(index.docs,'',index.synonyms,{task:'life'}).every(d=>d.tasks.includes('life'))));
test('kind filter is enforced',()=>assert(S.search(index.docs,'',index.synonyms,{kind:'course'}).every(d=>d.kind==='course')));
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):[path.join(p,x.name)]),html=walk(dist).filter(p=>p.endsWith('.html'));
test('focused study entry and exactly one H1 per page',()=>{assert(fs.existsSync(path.join(dist,'study/index.html')));assert.equal(html.length,78);for(const p of html)assert.equal((fs.readFileSync(p,'utf8').match(/<h1[ >]/g)||[]).length,1,p);});
test('every page can resolve historical favorite IDs before loading search data',()=>{
 for(const p of html){const match=fs.readFileSync(p,'utf8').match(/<meta name="rci-favorite-groups" content="([^"]+)">/);assert(match,p);
  const groups=JSON.parse(match[1].replace(/&quot;/g,'"'));
  for(const d of index.docs.filter(d=>d.resource_ids?.length>1))assert(groups.some(keys=>keys.length===d.resource_ids.length&&d.resource_ids.every(id=>keys.includes(id))),p+' '+d.id);
 }
});
test('all local assets and links resolve',()=>{const build=JSON.parse(fs.readFileSync(path.join(dist,'build-info.json'),'utf8'));for(const p of html){const txt=fs.readFileSync(p,'utf8');for(const m of txt.matchAll(/(?:href|src)="([^"]+)"/g)){if(!m[1].startsWith('/'))continue;let u=decodeURIComponent(m[1].split(/[?#]/)[0]);if(build.base){assert(u.startsWith(build.base+'/'));u=u.slice(build.base.length);}let target=path.join(dist,u);if(u.endsWith('/'))target=path.join(target,'index.html');assert(fs.existsSync(target),p+' -> '+u);}}});
test('no raw API credentials, CDN scripts or analytics in emitted markup',()=>{for(const p of html){const txt=fs.readFileSync(p,'utf8');assert(!/src="https?:|ghp_[A-Za-z0-9]+|sk_live_|googletagmanager/.test(txt),p);}});
test('Local backup UI is reachable from favorites and planner, with its dependencies loaded in order',()=>{
 for(const p of html){
  const s=fs.readFileSync(p,'utf8');assert.equal((s.match(/id="backup-dialog"/g)||[]).length,1,p);
  const scripts=[...s.matchAll(/<script defer src="([^"]+)"/g)].map(m=>path.basename(m[1]));
  assert(scripts.indexOf('core.js')<scripts.indexOf('backup-core.js'),p);
  assert(scripts.indexOf('backup-core.js')<scripts.indexOf('site.js'),p);
  assert(scripts.indexOf('site.js')<scripts.indexOf('backup-ui.js'),p);
 }
 for(const p of ['index.html','favorites/index.html'])assert(fs.readFileSync(path.join(dist,p),'utf8').includes('data-backup-open'),p);
 const planner=fs.readFileSync(path.join(dist,'assets/planner.js'),'utf8');assert(planner.includes('data-backup-open'));assert(!planner.includes('plan-import'));
});
test('main answers rendered without fetching or JS',()=>{const s=fs.readFileSync(path.join(dist,'guides/exams/index.html'),'utf8');assert(s.includes('选了课，还需要报名考试吗？'));assert(s.includes('先看答案'));assert(s.includes('接下来这样做'));assert(s.includes('IN2106'));});
test('course sources and status retained in static pages',()=>{const s=fs.readFileSync(path.join(dist,'courses/IN2067/index.html'),'utf8');assert(s.includes('2025'));assert(s.includes('历史整理'));assert(s.includes('campus.tum.de'));});
test('old source records retained with separate library destinations',()=>{const info=JSON.parse(fs.readFileSync(path.join(dist,'build-info.json'),'utf8'));assert.equal(info.resources,144);assert.equal(info.courses,35);assert.equal(info.topics,58);assert(index.docs.some(d=>d.id==='R042'));});

// A public documentation page is not the application itself. Guard real destinations.
const matchingSystem='https://matching-in.cit.tum.de/';
const matchingInfo='https://www.cit.tum.de/en/cit/studies/students/examination-matters-modules/informatics/practical-courses-seminar-courses/';
const matchingGuide=fs.readFileSync(path.join(dist,'guides/matching/index.html'),'utf8');
test('Matching search resource opens the actual platform',()=>{const d=index.docs.find(d=>d.id==='R030');assert(d);assert.equal(d.url,matchingSystem);assert.equal(d.direct,true);assert(d.title.includes('直接进入系统'));});
test('Matching home shortcut does not point at documentation',()=>{const s=fs.readFileSync(path.join(dist,'index.html'),'utf8');const a=[...s.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(m=>/data-portal-link="R030"/.test(m[1]));assert(a);assert(a[1].includes('href="'+matchingSystem+'"'));});
test('library shortcuts separate book search from actual seat reservation',()=>{const s=fs.readFileSync(path.join(dist,'index.html'),'utf8'),links=[...s.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];const books=links.find(m=>/data-portal-link="R126"/.test(m[1])),seats=links.find(m=>/data-portal-link="R127"/.test(m[1]));assert(books);assert(seats);assert(books[2].includes('查找图书'));assert(books[1].includes('href="https://search.ub.tum.de/vufind/?lng=en"'));assert(seats[2].includes('预约自习座位'));assert(seats[1].includes('href="https://auth.anny.eu/start-session?'));const destination=new URL(seats[1].match(/href="([^"]+)"/)[1].replace(/&amp;/g,'&'));assert.equal(destination.searchParams.get('entityId'),'https://tumidp.lrz.de/idp/shibboleth');assert.equal(destination.searchParams.get('target'),'https://anny.eu/explore/university-library-technical-university-of-munich/resources?o-v=list');assert(!links.some(m=>/data-portal-link="R042"/.test(m[1])));});
test('Matching guide offers system first and separate explanation second',()=>{const actions=matchingGuide.match(/<div class="actions">([\s\S]*?)<\/div>/);assert(actions);const links=[...actions[1].matchAll(/href="([^"]+)"/g)].map(m=>m[1]);assert.equal(links[0],matchingSystem);assert.equal(links[1],matchingInfo);assert(actions[1].includes('非报名系统'));});
test('Matching guide records login boundary and independent documentation source',()=>{assert(matchingGuide.includes('TUM login'));assert(matchingGuide.includes('Exchange student login'));assert(matchingGuide.includes('个人实例与当期名额未核验'));assert(matchingGuide.includes('https://collab.dvb.bayern/spaces/TUMdmatching/pages/2205033162/'));});


test('two primary destinations remain visible without JavaScript',()=>{const s=fs.readFileSync(path.join(dist,'index.html'),'utf8');assert(s.includes('常用网站，一步直达。'));assert(s.includes('选课规划，心里有数。'));assert(s.includes('data-portal-link="R010"'));assert(s.includes('data-portal-link="R031"'));assert(s.includes('href="/study/"'));assert(!s.includes('按你要做的事找'));});
test('bookmarked cards are inline above expanded website modules',()=>{
 const s=fs.readFileSync(path.join(dist,'index.html'),'utf8');
 assert(s.includes('id="bookmarks"'));
 assert(s.indexOf('id="favorites-app"')<s.indexOf('id="websites"'));
 const pinned=s.slice(s.indexOf('id="bookmarks"'),s.indexOf('id="websites"'));
 assert(pinned.includes('data-favorites-surface'));
 assert(pinned.includes('data-portal-link="R031" href="https://www.moodle.tum.de/"'));
 assert(pinned.includes('data-save="R031"'));
 assert(!s.includes('href="/favorites/"'));
 for(const label of ['上课与选课','图书馆与校园','咨询与支持'])assert(s.includes(label));
 assert(!s.includes('data-favorites-entry'));
 assert(!s.includes('data-portal-filter'));
 assert(!s.includes('我常用的'));
 for(const p of html){const markup=fs.readFileSync(p,'utf8');assert(markup.includes('class="header-favorites" href="/#bookmarks"'),p);}
 const f=fs.readFileSync(path.join(dist,'favorites/index.html'),'utf8');
 assert(f.includes('id="favorites-app"'));assert(f.includes('id="favorites-empty"'));assert(f.includes('启用 JavaScript'));
});
test('study journey separates personal planning from school registration',()=>{const s=fs.readFileSync(path.join(dist,'study/index.html'),'utf8');assert(s.includes('先看懂这 120 ECTS'));assert(s.includes('href="/courses/"'));assert(s.includes('href="/planner/"'));assert(s.includes(matchingSystem));assert(s.includes('课程位置和考试登记要分别在学校系统确认'));assert(s.includes('2025'));});
test('Feedback is reachable beside the directory and from every page footer',()=>{
 const home=fs.readFileSync(path.join(dist,'index.html'),'utf8');assert(home.includes('缺少入口？'));
 for(const p of html)assert(fs.readFileSync(p,'utf8').includes('快速反馈'),p);
 const feedback=fs.readFileSync(path.join(dist,'feedback/index.html'),'utf8');assert(feedback.includes('需要 GitHub 账号'));assert(feedback.includes('内容会公开'));assert(feedback.includes('id="feedback-message"'));
 const F=require('../site3/feedback');const d=F.draft('missing','增加测试平台 https://example.org/?x=1&y=2','/planner/');const u=new URL(d.url);
 assert.equal(u.origin,'https://github.com');assert.equal(u.pathname,'/baichujiang/tum-rci-all-in-one/issues/new');assert(u.searchParams.get('body').includes('x=1&y=2'));assert(u.searchParams.get('body').endsWith('/planner/'));
 assert(F.draft('feature','test','/search/?private=secret').body.endsWith('/'));assert(!F.draft('feature','test','/search/?private=secret').body.includes('secret'));
});
test('Homepage search retains every original resource name behind its shorter card label',()=>{
 const nav=JSON.parse(fs.readFileSync(path.join(root,'content/navigation.json'),'utf8')),C=require('../assets/core'),resources=C.csv(fs.readFileSync(path.join(root,'data/resources.csv'),'utf8')),home=fs.readFileSync(path.join(dist,'index.html'),'utf8');
 const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"},decode=text=>text.replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>entities[entity]);
 const cards=[...home.matchAll(/<article class="portal-card" data-portal="([^"]+)"[^>]*data-keywords="([^"]*)"/g)].map(match=>{const shortcut=nav.shortcuts.find(s=>s.id===match[1]);return {id:match[1],kind:'resource',title:shortcut.label,summary:shortcut.hint,body:decode(match[2]),aliases:[],tasks:[]};});
 for(const shortcut of nav.shortcuts){const original=resources.find(r=>r.id===shortcut.id);assert(S.search(cards,original.title).some(card=>card.id===shortcut.id),original.id+' '+original.title);}
});
test('Course directory can target a semester while static links remain available',()=>{
 const s=fs.readFileSync(path.join(dist,'courses/index.html'),'utf8');assert(s.includes('id="course-target-semester"'));assert(s.includes('先选课，稍后分配'));assert(s.includes('TUMonline'));
});
const Picker=require('../site3/course-picker'),Core=require('../assets/core'),pickerData=JSON.parse(fs.readFileSync(path.join(dist,'assets/planner-data.json'),'utf8'));
const pickerPlan={version:2,cohort:'unknown',conditional:false,timeline:{count:4,start:'winter'},items:[]};
test('Planner embeds a continuous course picker with explicit close and undo',()=>{
 const s=fs.readFileSync(path.join(dist,'planner/index.html'),'utf8');assert(s.includes('id="course-picker"'));assert(s.includes('aria-labelledby="picker-title"'));assert(s.includes('id="picker-query"'));assert(s.includes('id="picker-undo"'));assert(s.includes('assets/course-picker.js'));assert(!fs.readFileSync(path.join(dist,'courses/index.html'),'utf8').includes('id="course-picker"'));
});
test('Picker defaults to the target season, includes flexible and unconfirmed terms',()=>{
 const ids=Picker.choices(pickerData,pickerPlan,1).map(x=>x.code);assert(ids.includes('IN2067'));assert(!ids.includes('ED160028'));assert(ids.includes('IN2107'));assert(ids.includes('IN2320'));assert(ids.includes('IN9010'));
 const summer=Picker.choices(pickerData,pickerPlan,2).map(x=>x.code);assert(!summer.includes('IN2067'));assert(summer.includes('ED160028'));
});
test('Picker searches course names, spaced codes and existing ML synonyms',()=>{
 for(const q of ['机器学习','ML','in 2064'])assert.equal(Picker.choices(pickerData,pickerPlan,1,{query:q})[0]?.code,'IN2064');
 assert.equal(Picker.choices(pickerData,pickerPlan,1,{query:'量子火锅xyz'}).length,0);
});
test('Other-season option reveals conflicts and domain filtering remains scoped',()=>{
 assert(Picker.choices(pickerData,pickerPlan,1,{otherTerms:true}).some(x=>x.code==='ED160028'));
 assert(Picker.choices(pickerData,pickerPlan,2,{group:'I'}).every(x=>x.course.section_2025[0]==='I'));
 assert(Picker.choices(pickerData,pickerPlan,1,{group:'core'}).every(x=>'ABCDE'.includes(x.course.section_2025[0])));
});
test('Searching a known course reveals it across seasons without an extra filter step',()=>{
 const d=Picker.choices(pickerData,pickerPlan,1,{query:'IN2228'})[0];assert.equal(d.code,'IN2228');assert.equal(Core.offering(d.course,'winter').state,'conflict');
});
test('Picker identifies previously selected and unassigned courses without duplicate records',()=>{
 const p={...pickerPlan,items:[{code:'IN2064',status:'passed',semester:0}]},result=Picker.choices(pickerData,p,1,{query:'机器学习'});
 assert.equal(result.length,1);assert.deepEqual(result[0].assignment,p.items[0]);assert.equal(Core.calculate(p,pickerData.courses).raw,8);
 assert.throws(()=>Picker.choices(pickerData,p,5),/有效的学期/);
});

require('./community.test.js');
console.log(count+' site checks passed');
