/* Grouped Excel tables and PDF boards preserve numeric detail and personal history. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../assets/core'),X=require('../assets/plan-export');
const courses=require('../scripts/load-courses')(),names=require('../content/editorial.json').course_names_zh,db={courses,names};
const draft=(items=[],count=4)=>C.validatePlan({version:2,cohort:'2026/27冬季',conditional:false,timeline:{count,start:'winter'},items},courses);
const values=sheet=>sheet.rows.map(r=>r.map(c=>c&&typeof c==='object'?c.value:c));
const courseHeader=sheet=>Number(sheet.autoFilter.match(/^A(\d+):/)[1]);
const courseRows=sheet=>values(sheet).slice(courseHeader(sheet));
const readingCourses=sheet=>values(sheet).filter(r=>r.length===6&&r[1]&&typeof r[3]==='number');
const semesterRows=sheet=>values(sheet).filter(r=>r.length===6&&!r[1]&&typeof r[3]==='number');
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
 await test('Each course has one grouped row, with semester totals, passed history and custom identity intact',()=>{
  const p=draft([{code:'IN2064',status:'passed',semester:1},{code:'IN2228',status:'planned',semester:1,locked:true},{code:'IN2060',group:'I',status:'planned',semester:2},{code:'OWN1',custom:true,name:'历史认定',group:'H',ects:7.5,status:'passed',semester:6},{code:'IN2067',status:'planned',semester:0},{code:'IN2107',status:'passed',semester:0},{code:'CIT433050',custom:true,name:'原有个人认定',group:'J',ects:2.5,status:'passed',semester:2}]);
  const before=JSON.stringify(p),v=X.planView(p,db,'2026/10/16'),all=[...v.semesters,...v.other].flatMap(g=>g.items);
  assert.deepEqual(all.map(x=>x.code).sort(),p.items.map(x=>x.code).sort());assert.equal(all.length,p.items.length);
  assert.equal(v.semesters[0].credits,16);assert.equal(v.semesters[0].passedCredits,8);assert.equal(v.semesters[0].plannedCredits,8);
  assert.equal(v.semesters[1].items.find(x=>x.code==='IN2060').group,'I');
  const custom=all.find(x=>x.code==='CIT433050');assert.equal(custom.name,'原有个人认定');assert.equal(custom.ects,2.5);assert.equal(custom.translation,'');assert.equal(custom.group,'J');
  assert(v.other.find(g=>g.title==='其他已通过课程').items.find(x=>x.code==='OWN1').termLabel.startsWith('第 6 学期'));
  const sheets=X.planSheets(v),sheet=sheets[0],detail=courseRows(sheets[1]),reading=readingCourses(sheet),totals=semesterRows(sheet);
  assert.deepEqual(sheets.map(s=>s.name),['课程计划','课程明细','规划条件']);assert.equal(detail.length,p.items.length);assert.deepEqual(detail.map(r=>r[1]).sort(),p.items.map(x=>x.code).sort());
  assert.equal(reading.length,p.items.length);assert.deepEqual(reading.map(r=>r[1]),detail.map(r=>r[1]));
  assert.equal(totals[0][3],16);assert(totals[0][4].includes('2 门课程'));assert(totals[0][4].includes('已通过 8 · 待修 8 ECTS'));assert.equal(totals.length,6);
  assert(detail.some(r=>r[1]==='IN2228'&&r[4]===8&&r[6]==='待修'&&r[7]==='是'));
  assert(detail.some(r=>r[1]==='OWN1'&&r[4]===7.5&&r[0].startsWith('第 6 学期')&&r[8].includes('自录')));
  assert(detail.some(r=>r[1]==='CIT433050'&&r[2]==='原有个人认定'&&r[3]===''&&r[4]===2.5&&r[5]==='J'));
  assert(detail.some(r=>r[1]==='IN2067'&&r[0]==='待分配'));assert(detail.some(r=>r[1]==='IN2107'&&r[0]==='通过学期未记录'));
  assert(detail.slice(0,2).every(r=>r[0].startsWith('第 1 学期')));assert(detail.slice(2,4).every(r=>r[0].startsWith('第 2 学期')));
  assert(reading.some(r=>r[1]==='OWN1'&&r[3]===7.5&&r[5].includes('第 6 学期')&&r[5].includes('自录')));
  assert(reading.some(r=>r[1]==='IN2228'&&r[0].includes('Computer Vision II')&&r[0].includes(names.IN2228)&&r[5]==='固定学期'));
  const courseIndexes=new Set(sheet.rows.flatMap((r,i)=>r[1]?.value&&typeof r[3]?.value==='number'?[i+1]:[]));
  assert(sheet.merges.every(ref=>!courseIndexes.has(Number(ref.match(/\d+/)[0]))));assert(!sheets[1].merges?.length);
  assert.equal(JSON.stringify(p),before);
 });
 await test('Empty and summer-start plans keep all semester summaries while PDF boards paginate at most four columns',()=>{
  for(const count of [1,4,5,6,12]){
   const p=draft([],count),v=X.planView(p,db),html=X.printPlan(v),sheet=X.planSheets(v)[0];
   assert.equal(v.semesters.length,count);assert.equal(semesterRows(sheet).length,count);assert(semesterRows(sheet).every(r=>r[3]===0&&r[4].includes('0 门课程')));
   assert.equal(readingCourses(sheet).length,0);assert.equal(courseRows(X.planSheets(v)[1]).length,0);assert.equal(sheet.widths.length,6);assert.equal(sheet.freezeRows,5);
   assert(values(sheet).some(r=>r[0]==='尚未安排课程'));
   const sections=[...html.matchAll(/<table class="print-semester-board">([\s\S]*?)<\/table>/g)];assert.equal(sections.length,Math.ceil(count/4));
   for(const section of sections)assert((section[1].match(/scope="col"/g)||[]).length<=4);
   for(let n=1;n<=count;n++)assert(html.includes(`<span class="print-term-title">第 ${n} 学期</span>`));
   assert(html.includes('还没有安排课程'));
  }
  const p=draft();p.cohort='2026夏季';p.timeline.start='summer';const v=X.planView(p,db);assert.equal(v.semesters[0].label,'2026 夏季');assert.equal(v.semesters[1].label,'2026/27 冬季');
  const sheet=X.planSheets(v)[0];assert(semesterRows(sheet)[0][0].includes('2026 夏季'));assert(semesterRows(sheet)[1][0].includes('2026/27 冬季'));
 });
 await test('Semester banners show their own totals beside courses; the supporting table keeps semester filtering',()=>{
  const p=draft([{code:'IN2060',group:'I',status:'planned',semester:3},{code:'IN2228',status:'planned',semester:2},{code:'IN2064',status:'passed',semester:1},{code:'IN2067',status:'planned',semester:1}]);
  const v=X.planView(p,db),sheets=X.planSheets(v),sheet=sheets[0],rows=courseRows(sheets[1]),exported=new TextDecoder().decode(X.xlsx(sheets));
  const styles=[...exported.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*fillId="(\d+)"[^>]*borderId="(\d+)"/g)].map(m=>({fill:m[1],border:m[2]}));
  assert.deepEqual(rows.map(r=>r[1]),['IN2064','IN2067','IN2228','IN2060']);assert.equal(rows[0][0],rows[1][0]);
  const headers=sheet.rows.filter(r=>r.length===6&&!r[1]?.value&&typeof r[3]?.value==='number'),meta=headers.map(r=>styles[r[0].style]);
  assert.notEqual(meta[0].fill,meta[1].fill);assert.notEqual(meta[1].fill,meta[2].fill);assert.equal(headers[0][3].value,14);assert.equal(headers[1][3].value,8);assert.equal(headers[2][3].value,6);
  const reading=readingCourses(sheet);assert.deepEqual(reading.map(r=>r[1]),rows.map(r=>r[1]));
  assert(!sheet.autoFilter);assert.equal(sheets[1].autoFilter,'A1:I5');assert.equal(sheets[1].freezeColumns,1);
  assert(!values(sheet).some(r=>String(r[0]).startsWith('学期汇总')));
 });
 await test('Credit caps are distinct from semester sums; historical and unconfirmed planning conditions are explicit',()=>{
  const p=draft([{code:'OWNJ',custom:true,name:'跨学科',group:'J',ects:8.5,status:'passed',semester:1}]);p.conditionalConfirmed=false;p.workload.semesters[2]={maxECTS:24};
  const v=X.planView(p,db),html=X.printPlan(v);assert.equal(v.semesters[0].credits,8.5);assert.equal(v.allocated,6);assert.equal(v.passed,6);
  assert(html.includes('毕业进度（含待修）6 / 120 ECTS'));assert(html.includes('8.5 ECTS'));assert(html.includes('尚未确认'));assert(html.includes('第 2 学期负担'));assert(html.includes('0–24 ECTS'));
 });
 await test('Hostile course names remain literal text in PDF HTML and real styled XLSX cells',()=>{
  const p=draft([{code:'OWN1',custom:true,name:'=HYPERLINK("x") <img src=x onerror=alert(1)> & 测试',group:'G',ects:5.5,status:'planned',semester:1}]);
  const v=X.planView(p,db),html=X.printPlan(v),sheets=X.planSheets(v),bytes=X.xlsx(sheets),text=new TextDecoder().decode(bytes);
  assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  assert(text.includes('xl/styles.xml'));assert(text.includes('state="frozen"'));assert(text.includes('xSplit="1"'));assert(text.includes('topLeftCell="B2"'));assert(text.includes('ySplit="5"'));assert(text.includes('<mergeCells'));assert(text.includes(`<autoFilter ref="${sheets[1].autoFilter}"/>`));assert(text.includes('orientation="landscape"'));assert(text.includes('!$5:$5'));assert(text.includes('<v>5.5</v>'));assert(!text.includes('<f>'));assert(text.includes('&lt;img'));assert(text.includes('<rPr>'));
 });
 await test('Browser export buttons use the latest plan, emit the board, and never write personal data',async()=>{
  let p=draft([{code:'IN2064',status:'passed',semester:1}]),handler,downloads=[],prints=0;const printable={innerHTML:''},box={innerHTML:'',addEventListener:(key,fn)=>{if(key==='click')handler=fn;}};
  const U={data:async()=>db,plan:async()=>p,toast:message=>{throw Error(message);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../site3/plan-sharing'),'utf8'),{window:{RCIUI:U,RCI:C,RCIExports:{...X,download:(...args)=>downloads.push(args)},print:()=>prints++},document:{getElementById:id=>id==='plan-exports'?box:printable},location:{hash:''}});
  await new Promise(resolve=>setImmediate(resolve));
  const click=async attribute=>handler({target:{closest:()=>({hasAttribute:key=>key===attribute})}});
  await click('data-plan-print');assert.equal(prints,1);assert(printable.innerHTML.includes('print-semester-board'));assert(printable.innerHTML.includes('Machine Learning'));
  p=draft([{code:'IN2228',status:'planned',semester:2}]);await click('data-plan-xlsx');assert.equal(downloads.length,1);const text=new TextDecoder().decode(downloads[0][0]);assert(text.includes('Computer Vision II'));assert(!text.includes('Machine Learning'));assert.equal(downloads[0][1],'rci-study-plan.xlsx');
 });
 await test('Excel and PDF course groups follow the same saved order as the board',()=>{
  const p=draft(['IN2064','IN2228','IN2406'].map(code=>({code,status:code==='IN2228'?'passed':'planned',semester:1}))),sorted=C.reorderSemester(p,1,['IN2406','IN2228','IN2064']),view=X.planView(sorted,db),sheet=X.planSheets(view)[0];
  assert.deepEqual(view.semesters[0].items.map(x=>x.code),['IN2406','IN2228','IN2064']);assert.deepEqual(readingCourses(sheet).map(row=>row[1]),['IN2406','IN2228','IN2064']);assert.equal(view.allocated,X.planView(p,db).allocated);
 });
 await test('Exports leave unconfirmed entry seasons neutral instead of exporting default winter as fact',()=>{
  const p={...draft([{code:'IN2228',status:'planned',semester:1}]),cohort:'unknown'},view=X.planView(p,db);
  assert(view.semesters.every(x=>x.season===null&&x.label.includes('待确认')));assert.equal(view.items[0].termLabel,'第 1 学期 · 季节待确认');
  assert.match(view.settings.find(x=>x[0]==='学期规划')[1],/待确认/);assert(!X.printPlan(view).includes('冬季开始'));
 });
 console.log(`${checks} plan export checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
