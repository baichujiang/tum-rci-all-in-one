/* End-to-end domain contracts for migration, solver, course offerings and exports. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../assets/core'),E=require('../assets/planning-engine'),T=require('../assets/course-context'),B=require('../site3/backup-core'),X=require('../assets/plan-export');
const courses=require('../scripts/load-courses')(),details=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/teaching-offerings.json')));
const draft=()=>C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,items:[]},courses);
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
test('Old plans migrate losslessly into v5 while future formats fail closed',()=>{const old={version:2,cohort:'2026/27冬季',conditional:false,items:[{code:'IN2064',status:'passed'},{code:'OWN1',name:'研究',ects:5.5,group:'G',custom:true,status:'planned'}]};const p=C.validatePlan(old,courses);assert.equal(p.version,5);assert.equal(p.items[1].ects,5.5);assert.equal(p.items[0].status,'passed');assert.equal(C.schedule(p,courses).unassigned.credits,5.5);assert.throws(()=>C.validatePlan({...old,version:8},courses));});
test('All personal planning fields survive full backup, replacement and recovery payload',()=>{const p=draft();p.preferences.desired=['IN2346'];p.preferences.excluded=['IN2060'];p.preferences.languages=['EN'];p.workload.semesters[1]={maxECTS:24};p.timetable.events=[{id:'work',semester:1,day:1,start:840,end:960,title:'工作',kind:'blocked',allowOverlap:false,room:''}];p.items=[{code:'IN2067',status:'planned',semester:1,locked:true}];const value=B.state({plan:p,favorites:['R031']},courses),backup=B.create(value,courses),parsed=B.parse(JSON.stringify(backup),courses);assert.deepEqual(parsed.plan,value.plan);assert.deepEqual(B.prepare({plan:draft(),favorites:[]},parsed,'replace',courses).plan,value.plan);});
test('Merging into a course-empty plan preserves local preferences and time constraints',()=>{const current=draft();current.preferences.excluded=['IN2060'];current.workload.maxECTS=24;const incoming=draft();incoming.items=[{code:'IN2346',status:'planned',semester:2}];const result=B.prepare({plan:current,favorites:[]},{plan:incoming,favorites:[],legacy:false},'merge',courses);assert.equal(result.plan.workload.maxECTS,24);assert.deepEqual(result.plan.preferences.excluded,['IN2060']);assert.equal(result.plan.items[0].code,'IN2346');assert(result.notes.some(x=>x.includes('保留当前设备')));});
test('Invalid preferences, bounds, event IDs and times cannot enter local storage',()=>{for(const patch of [{preferences:{desired:['IN2060'],excluded:['IN2060']}},{workload:{minECTS:40,maxECTS:32}},{workload:{minExams:1.5}},{timetable:{events:[{id:'x',title:'时间',semester:1,day:1,start:600,end:500}]}},{timetable:{events:[{id:'x',title:'时间',semester:1,day:1,start:600,end:700},{id:'x',title:'时间',semester:1,day:1,start:600,end:700}]}}])assert.throws(()=>C.validatePlan({...draft(),...patch},courses));});
test('Winter/summer years match actual cohorts, including a summer start',()=>{const p=draft();assert.equal(T.term(p,1).key,'2026-winter');assert.equal(T.term(p,2).key,'2027-summer');p.cohort='2026夏季';p.timeline.start='summer';assert.equal(T.term(p,1).key,'2026-summer');assert.equal(T.term(p,2).key,'2026-winter');});
test('Unconfirmed entry never guesses winter, hides summer courses or reports false offering conflicts',()=>{
 const P=require('../site3/course-picker'),p=draft();p.cohort='unknown';p.items=[{code:'IN2228',status:'planned',semester:1}];
 assert.equal(C.hasAcademicTerm(p),false);assert.equal(T.term(p,1).key,'');assert.equal(T.term(p,1).season,null);assert.match(C.planSemesterLabel(p,1),/待确认/);
 assert(C.schedule(p,courses).semesters.every(x=>x.season===null&&x.conflicts.length===0));
 const data={courses,names:{},offerings:details},codes=()=>P.choices(data,p,1).map(x=>x.code);
 assert(codes().includes('IN2228'));assert(codes().includes('IN2064'));assert.equal(T.offering(p,courses.find(c=>c.module_code==='IN2346'),1,details).state,'unknown');
 p.cohort='2027夏季';p.timeline.start='summer';assert(codes().includes('IN2228'));assert(!codes().includes('IN2064'));
 p.cohort='2026/27冬季';p.timeline.start='winter';assert(!codes().includes('IN2228'));assert(codes().includes('IN2064'));
 p.timeline.start='summer';assert.equal(C.hasAcademicTerm(p),false);assert.equal(T.term(p,1).season,null);
});
test('Dated IN2346 winter teaching overrides summer appendix without mutating it',()=>{const c=courses.find(c=>c.module_code==='IN2346'),p=draft();assert.equal(c.term_legal_annex,'SoSe');assert.equal(T.offering(p,c,1,details).state,'compatible');assert(T.offering(p,c,1,details).dated);assert.equal(T.offering(p,c,3,details).dated,null);assert.equal(c.term_legal_annex,'SoSe');});
test('Default automatic plan completes all buckets and progression in four semesters',()=>{const p=draft(),before=JSON.stringify(p),r=E.generate(p,courses,details);assert(r.ok,JSON.stringify(r.reasons));assert.equal(r.calculation.allocated,120);assert.equal(r.calculation.complete,true);assert.equal(r.finish,4);assert(C.progression(r.plan,courses).every(x=>x.met));assert.equal(JSON.stringify(p),before);const thesis=r.plan.items.find(x=>x.code==='IN2320');assert(r.plan.items.every(x=>x.code==='IN2320'||x.semester<thesis.semester));for(const n of C.schedule(r.plan,courses).semesters){assert(n.credits<=32);assert(n.items.length<=6);}});
test('Passed courses are preserved; feasible wanted courses are included and exclusions remain strict',()=>{const p=draft();p.items=[{code:'IN2064',status:'passed',semester:0}];p.preferences.desired=['IN2346'];p.preferences.excluded=['IN2060'];const r=E.generate(p,courses,details);assert(r.ok,JSON.stringify(r.reasons));assert.equal(r.passed.allocated,8);assert.equal(r.plan.items.find(x=>x.code==='IN2064').status,'passed');assert(r.plan.items.some(x=>x.code==='IN2346'));assert(!r.plan.items.some(x=>x.code==='IN2060'));assert.equal(C.schedule(r.plan,courses).semesters.reduce((n,x)=>n+x.credits,0),112);});
test('Per-semester credit cap is honored and a pinned course stays in its semester',()=>{const p=draft();p.workload.semesters[1]={maxECTS:24};p.items=[{code:'IN2067',status:'planned',semester:1,locked:true}];const r=E.generate(p,courses,details);assert(r.ok,JSON.stringify(r.reasons));assert(C.schedule(r.plan,courses).semesters[0].credits<=24);assert.equal(r.plan.items.find(x=>x.code==='IN2067').semester,1);});
test('Remediation contributes K=5, professional=36 and never covers I minimum',()=>{const p=draft();p.conditional=true;const r=E.generate(p,courses,details);assert(r.ok,JSON.stringify(r.reasons));assert.equal(r.calculation.totals.K,5);assert(r.calculation.totals.I>=5);assert.equal(r.calculation.buckets[1][2],36);assert.equal(r.calculation.allocated,120);});
test('Remediation conflicts identify selected, desired and passed records without editing personal settings or history',()=>{
 for(const kind of ['planned','desired','passed']){
  const p=draft();if(kind==='desired')p.preferences.desired=['ED140014'];else p.items=[{code:'ED140014',status:kind,semester:kind==='passed'?0:1}];
  const before=JSON.stringify(p),r=E.generate(p,courses,details);
  assert.equal(r.ok,false);assert.equal(r.issue,'remediation-conflict');assert.equal(JSON.stringify(p),before);
 }
});
test('Language, required exclusions and thesis capacity failures are explained',()=>{let p=draft();p.preferences.languages=['DE'];let r=E.generate(p,courses,details);assert(!r.ok&&r.reasons.some(x=>x.includes('授课语言')));p=draft();p.preferences.excluded=['IN2064'];r=E.generate(p,courses,details);assert(!r.ok&&r.reasons.some(x=>x.includes('必修')));p=draft();p.workload.maxECTS=24;r=E.generate(p,courses,details);assert(!r.ok&&r.reasons.some(x=>x.includes('30 ECTS')));});
test('Exhausted search never claims mathematical infeasibility or mutates the source',()=>{const p=draft(),before=JSON.stringify(p),r=E.generate(p,courses,details,{nodeLimit:1});assert(!r.ok&&r.exhausted);assert(r.reasons[0].includes('不代表一定排不出来'));assert.equal(JSON.stringify(p),before);});
test('XLSX is a real local ZIP workbook and treats formulas as literal user text',()=>{const bytes=X.xlsx([{name:'计划',rows:[['模块','ECTS'],['=HYPERLINK("x")',5.5],['中文',6]]}]);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);const text=new TextDecoder().decode(bytes);assert(text.includes('xl/worksheets/sheet1.xml'));assert(text.includes('t="inlineStr"'));assert(!text.includes('<f>'));fs.writeFileSync('/tmp/rci-test-export.xlsx',bytes);});
test('Expanded official catalog keeps cross-category modules single-counted',()=>{const extended=courses;const p=C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,items:[{code:'CIT433050',group:'I',status:'passed',semester:0}]},extended);assert.equal(C.calculate(p,extended,true).totals.I,5);assert.equal(C.calculate(p,extended,true).totals.H,0);p.preferences.desired=['IN2410'];const r=E.generate(p,extended,details);assert(r.ok,JSON.stringify(r.reasons));assert(r.plan.items.some(x=>x.code==='IN2410'));assert.equal(r.plan.items.filter(x=>x.code==='CIT433050').length,1);assert.equal(r.calculation.complete,true);});
test('Rule versions, unknown personal remediation and inconsistent start are explicit',()=>{let p=draft();p.cohort='2024夏季';p.timeline.start='summer';let r=E.generate(p,courses,details);assert(r.ok);assert.equal(r.calculation.buckets[1][2],41);p.conditional=true;r=E.generate(p,courses,details);assert(!r.ok&&r.reasons[0].includes('2024'));p=draft();p.conditionalConfirmed=false;r=E.generate(p,courses,details);assert(!r.ok&&r.reasons[0].includes('录取'));assert(!C.calculate(p,courses).complete);p=draft();p.timeline.start='summer';r=E.generate(p,courses,details);assert(!r.ok&&r.reasons[0].includes('季节'));});
test('Excluding an already selected elective removes it in the preview but cannot erase a pinned course',()=>{const p=draft();p.items=[{code:'IN2060',semester:1,status:'planned',locked:false}];p.preferences.excluded=['IN2060'];let r=E.generate(p,courses,details);assert(r.ok,JSON.stringify(r.reasons));assert.deepEqual(r.removed,['IN2060']);assert(!r.plan.items.some(x=>x.code==='IN2060'));assert.equal(p.items.length,1);p.items[0].locked=true;r=E.generate(p,courses,details);assert(!r.ok&&r.reasons[0].includes('固定'));});
test('A shorter future board never discards the historical semester of passed courses',()=>{const p=draft();p.items=[{code:'IN2064',status:'passed',semester:5}];p.timeline.count=2;const normalized=C.validatePlan(p,courses);assert.equal(normalized.items[0].semester,5);assert.equal(C.calculate(normalized,courses,true).allocated,8);assert.equal(C.schedule(normalized,courses).semesters.reduce((sum,n)=>sum+n.credits,0),0);assert.equal(B.parse(JSON.stringify(B.create({plan:normalized,favorites:[]},courses)),courses).plan.items[0].semester,5);});

test('Retired time fields round-trip in backups but cannot affect course planning',()=>{
 const p=draft();p.items=[{code:'IN2067',status:'planned',semester:1,locked:true}];
 const reference=E.generate(p,courses,details);assert(reference.ok);
 p.preferences.allowOverlap=false;p.preferences.allowUnknownTimes=false;p.timetable.events=[{id:'old',title:'旧时间',semester:1,day:1,start:0,end:1440,kind:'blocked'}];
 const result=E.generate(p,courses,details);assert(result.ok,JSON.stringify(result.reasons));assert.deepEqual(result.plan.items,reference.plan.items);assert.equal(result.plan.timetable.events[0].id,'old');assert(!result.warnings.some(x=>/课表|时段/.test(x)));
});
test('Known passed semesters cannot satisfy earlier foundation or credit deadlines',()=>{
 const p=draft();p.items=[{code:'IN2064',status:'passed',semester:4}];let rows=C.progression(p,courses);
 assert.equal(rows.find(x=>x.semester===2).met,false);assert.equal(rows.find(x=>x.semester===3).value,0);assert.equal(rows.find(x=>x.semester===4).value,8);
 const invalid=E.generate(p,courses,details);assert(!invalid.ok);assert(invalid.reasons[0].includes('已修记录包含第 4 学期'));
 p.timeline.count=6;p.preferences.startSemester=5;rows=C.progression(p,courses);assert.equal(rows.find(x=>x.semester===2).value,0);assert.equal(rows.find(x=>x.semester===4).value,8);
 p.items[0].semester=0;rows=C.progression(p,courses);assert.equal(rows.find(x=>x.semester===2).unknown,true);assert.equal(rows.find(x=>x.semester===2).met,false);assert.equal(rows.find(x=>x.semester===5).value,8);
});
test('An unallocated desired cross-category module can fill I while earning credit once',()=>{
 const extended=courses;
 const p=C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,items:[]},extended);p.preferences.desired=['CIT433050'];p.preferences.excluded=extended.filter(c=>c.module_code!=='CIT433050'&&(c.allowed_groups||[c.section_2025[0]]).includes('I')).map(c=>c.module_code);
 const r=E.generate(p,extended,details);assert(r.ok,JSON.stringify(r.reasons));assert.equal(r.plan.items.find(x=>x.code==='CIT433050').group,'I');assert.equal(r.plan.items.filter(x=>x.code==='CIT433050').length,1);assert.equal(r.calculation.totals.I,5);assert(r.calculation.complete);
 p.items=[{code:'CIT433050',status:'planned',semester:1,group:'H'}];const fixed=E.generate(p,extended,details);assert(!fixed.ok,'An explicit H allocation cannot be silently rewritten');
});
test('Unavailable wanted electives are explained without blocking a valid replacement plan',()=>{
 const limited=courses.map(c=>c.module_code==='IN2060'?{...c,automatic_recommendation_eligible:false,current_catalog_status:'needs_review'}:c),p=draft();let r=E.generate(p,limited,details);assert(r.ok);assert(!r.plan.items.some(x=>x.code==='IN2060'));
 p.preferences.desired=['IN2060'];const before=JSON.stringify(p);r=E.generate(p,limited,details);assert(r.ok,JSON.stringify(r.reasons));assert(!r.plan.items.some(x=>x.code==='IN2060'));assert(r.desired.omitted.some(x=>x.code==='IN2060'&&x.reason.includes('暂不自动推荐')));assert.equal(JSON.stringify(p),before);
});
test('Hint-only standard deadlines permit a seventh-semester simulation without asserting administrative approval',()=>{
 const baseline=E.generate(draft(),courses,details);assert(baseline.ok);
 const subset=courses.filter(c=>baseline.plan.items.some(x=>x.code===c.module_code)),p=draft();p.timeline.count=7;
 p.items=baseline.plan.items.map(x=>x.code==='IN2320'?{...x,semester:7,locked:true}:{...x,status:'passed',semester:0,locked:false});
 const strict=E.generate(p,subset,details);assert(!strict.ok);
 p.preferences.deadlineException=true;const before=JSON.stringify(p),r=E.generate(p,subset,details);assert(r.ok,JSON.stringify(r.reasons));assert.equal(r.finish,7);assert.equal(JSON.stringify(p),before);
 assert.equal(C.progression(r.plan,subset).find(x=>x.semester===6).met,false);assert(r.warnings.some(x=>x.includes('可能没达到学校的进度要求')));assert(!r.warnings.some(x=>x.includes('获批延期')));
});
test('Manual display order survives generation without changing the selected courses or assignments',()=>{
 const generated=E.generate(draft(),courses,details);assert(generated.ok,JSON.stringify(generated.reasons));
 const p={...generated.plan,items:generated.plan.items.map(x=>({...x,locked:true}))},semester=C.schedule(p,courses).semesters.find(n=>n.items.length>1),order=semester.items.map(x=>x.code).reverse();
 const baseline=E.generate(p,courses,details);assert(baseline.ok,JSON.stringify(baseline.reasons));
 const sorted=C.reorderSemester(p,semester.number,order),result=E.generate(sorted,courses,details);assert(result.ok,JSON.stringify(result.reasons));
 assert.deepEqual(result.plan.items,baseline.plan.items);assert.deepEqual(result.calculation,baseline.calculation);assert.deepEqual(result.plan.courseOrder[semester.number],order);
 assert.deepEqual(C.semesterItems(result.plan,semester.number).map(x=>x.code),order);
});
test('Wanted courses replace unlocked existing electives without changing passed and locked records',()=>{
 const p=draft();p.items=[['IN2067',1],['IN2064',1],['IN2107',1],['CIT433039',1],['ED120117',1],['IN2228',2],['IN2257',2],['IN2406',3],['CIT323007',3],['CIT433050',3,'H'],['IN2060',3,'I'],['IN2210',3],['IN2320',4]].map(([code,semester,group])=>({code,semester,status:'planned',locked:false,...(group?{group}:{})}));
 p.preferences.desired=['IN2067','IN2228','IN2406','IN2064','IN2107','CIT3330000','IN2292'];const before=JSON.stringify(p),r=E.generate(p,courses,details);
 assert(r.ok,JSON.stringify(r.reasons));assert.equal(r.finish,4);assert(r.plan.items.some(x=>x.code==='CIT3330000'));assert(r.plan.items.some(x=>x.code==='IN2292'));assert(r.replaced.length>0);assert(r.replaced.every(code=>p.items.some(x=>x.code===code&&!x.locked)));assert.deepEqual(r.desired.omitted,[]);assert(C.schedule(r.plan,courses).semesters.every(n=>n.credits<=32&&n.items.length<=6));assert(r.calculation.complete);assert.equal(JSON.stringify(p),before);
 const protectedPlan=C.validatePlan({...p,items:p.items.map(x=>x.code==='CIT433039'?{...x,status:'passed',semester:0}:x.code==='ED120117'?{...x,locked:true}:x)},courses),protectedResult=E.generate(protectedPlan,courses,details);assert(protectedResult.ok,JSON.stringify(protectedResult.reasons));for(const code of ['CIT433039','ED120117'])assert.deepEqual(protectedResult.plan.items.find(x=>x.code===code),protectedPlan.items.find(x=>x.code===code));
});
test('An impossible wanted summer course is reported as omitted while a winter-only plan can still complete',()=>{
 const baseline=E.generate(draft(),courses,details);assert(baseline.ok);const p=draft();p.timeline.count=1;p.preferences.deadlineException=true;
 p.items=baseline.plan.items.filter(x=>x.code!=='IN2320').map(x=>({...x,status:'passed',semester:0,locked:false}));p.preferences.desired=['IN2410'];const before=JSON.stringify(p),r=E.generate(p,courses,details);
 assert(r.ok,JSON.stringify(r.reasons));assert(r.plan.items.some(x=>x.code==='IN2320'));assert(!r.plan.items.some(x=>x.code==='IN2410'));assert(r.desired.omitted.some(x=>x.code==='IN2410'&&x.reason.includes('开课季节')));assert.equal(JSON.stringify(p),before);
});
test('A fixed summer course in winter names the actual conflict rather than search candidate traces',()=>{
 const p=draft();p.items=[{code:'IN2228',semester:1,status:'planned',locked:true}];const before=JSON.stringify(p),r=E.generate(p,courses,details);assert(!r.ok);assert(r.reasons.some(x=>x.includes('Computer Vision II')&&x.includes('固定在第 1 学期')&&x.includes('夏季')));assert(!r.reasons.some(x=>x.includes('可用学期／开课条件不满足')));assert.equal(JSON.stringify(p),before);
});
test('Insufficient total capacity and overloaded fixed semesters give concrete numbers',()=>{
 const p=draft();p.timeline.count=3;let r=E.generate(p,courses,details);assert(!r.ok);assert(r.reasons.some(x=>x.includes('120 ECTS')&&x.includes('96 ECTS')));
 p.timeline.count=4;p.items=[{code:'IN2067',semester:1,status:'planned',locked:true},{code:'IN2064',semester:1,status:'planned',locked:true}];p.workload.semesters[1]={maxECTS:10};r=E.generate(p,courses,details);assert(!r.ok);assert(r.reasons.some(x=>x.includes('第 1 学期')&&x.includes('14 ECTS')&&x.includes('10 ECTS')));
});
console.log(`${count} planning checks passed`);
