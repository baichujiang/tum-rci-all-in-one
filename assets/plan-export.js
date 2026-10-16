/* Readable local exports; no dependencies, services or user data uploads. MIT. */
(function(root){
'use strict';
const C=typeof module==='object'&&module.exports?require('./core'):root.RCI;
const T=typeof module==='object'&&module.exports?require('./course-context'):root.RCICourseContext;
const xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const utf8=s=>new TextEncoder().encode(s);
const concat=parts=>{const bytes=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;};
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function zip(files){
 const local=[],central=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const filename=utf8(name),data=utf8(text),sum=crc(data),header=new Uint8Array(30),h=new DataView(header.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,sum,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,filename.length,true);
  local.push(header,filename,data);const c=new Uint8Array(46),v=new DataView(c.buffer);
  v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,sum,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,filename.length,true);v.setUint32(42,offset,true);central.push(c,filename);offset+=header.length+filename.length+data.length;
 }
 const directory=concat(central),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,Object.keys(files).length,true);v.setUint16(10,Object.keys(files).length,true);v.setUint32(12,directory.length,true);v.setUint32(16,offset,true);return concat([...local,directory,end]);
}
const column=n=>{let s='';do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;};
const readingStyleDefinitions={
 title:[7,0,0,'left','center'],head:[5,3,3,'left','center'],numberHead:[5,3,3,'right','center'],
 blueSection:[8,2,0,'left','center'],blueTotal:[9,2,0,'right','center'],blueSummary:[10,2,0,'right','center'],
 tealSection:[8,9,0,'left','center'],tealTotal:[9,9,0,'right','center'],tealSummary:[10,9,0,'right','center'],
 whiteText:[0,8,3,'left','center'],whiteNumber:[0,8,3,'right','center'],whiteMeta:[2,8,3,'left','center'],whiteStatus:[0,8,3,'center','center'],whitePassed:[6,8,3,'center','center'],
 softText:[0,6,3,'left','center'],softNumber:[0,6,3,'right','center'],softMeta:[2,6,3,'left','center'],softStatus:[0,6,3,'center','center'],softPassed:[6,6,3,'center','center'],
 meta:[2,0,0,'left','center'],progress:[3,0,0,'left','center'],centerHead:[5,3,3,'center','center']
};
const readingStyle=Object.fromEntries(Object.keys(readingStyleDefinitions).map((key,i)=>[key,22+i]));
// Shared styles for semester bands, numeric cells and supporting tables.
function workbookStyles(){
 const fonts=[['20352F',11,false],['FFFFFF',20,true],['5C6B64',10,false],['0065BD',13,true],['20352F',12,true],['20352F',11,true],['21614E',11,false],['0065BD',18,true],['FFFFFF',12,true],['FFFFFF',16,true],['FFFFFF',9,false]];
 const fills=['none','gray125','0065BD','EEF4FA','F7F2E7','EDF5FB','F4F8FC','EDF6F0','FFFFFF','21615B'];
 const xf=(font,fill,border=0,align='left',vertical='top')=>`<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${align}" vertical="${vertical}"${vertical==='center'&&align!=='center'?' indent="1"':''} wrapText="1"/></xf>`;
 const styles=[xf(0,0),xf(1,2),xf(2,0),xf(3,0),xf(4,4,1),xf(4,5,1),xf(5,3,1),xf(0,6,1),xf(6,7,1),xf(5,3,1),xf(0,8,1),xf(0,8,1,'right'),xf(2,0),xf(0,6,1),xf(0,6,1,'right'),xf(0,4,1),xf(0,4,1,'right'),xf(0,6,2),xf(0,6,2,'right'),xf(0,4,2),xf(0,4,2,'right'),xf(5,3,1,'right')];
 styles.push(...Object.values(readingStyleDefinitions).map(args=>xf(...args)));
 return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.map(([color,size,bold])=>`<font>${bold?'<b/>':''}<sz val="${size}"/><color rgb="FF${color}"/><name val="Calibri"/></font>`).join('')}</fonts><fills count="${fills.length}">${fills.map((color,i)=>i<2?`<fill><patternFill patternType="${color}"/></fill>`:`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="4"><border><left/><right/><top/><bottom/><diagonal/></border>${[false,true].map(start=>`<border><left style="thin"><color rgb="FFDCE4DE"/></left><right style="thin"><color rgb="FFDCE4DE"/></right><top style="${start?'medium':'thin'}"><color rgb="${start?'FF7294AB':'FFDCE4DE'}"/></top><bottom style="thin"><color rgb="FFDCE4DE"/></bottom><diagonal/></border>`).join('')}<border><left/><right/><top/><bottom style="thin"><color rgb="FFE0E7EB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function xlsx(sheets){
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const files={'[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,'_rels/.rels':`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,'xl/_rels/workbook.xml.rels':`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${rel}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`};
 files['[Content_Types].xml']=files['[Content_Types].xml'].replace('</Types>','<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
 files['xl/_rels/workbook.xml.rels']=files['xl/_rels/workbook.xml.rels'].replace('</Relationships>',`<Relationship Id="rIdStyles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`);
 files['xl/styles.xml']=workbookStyles();
 files['xl/workbook.xml']=files['xl/workbook.xml'].replace('</workbook>',`<definedNames>${sheets.map((s,i)=>{if(!s.repeatRows)return '';const [start,end]=Array.isArray(s.repeatRows)?s.repeatRows:[1,s.repeatRows];return `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xml(s.name.replace(/'/g,"''"))}'!$${start}:$${end}</definedName>`;}).join('')}</definedNames></workbook>`);
 sheets.forEach((s,i)=>{
  const freeze=s.freezeRows??1,freezeColumns=s.freezeColumns??0,widths=s.widths||Array(Math.max(1,...s.rows.map(r=>r.length))).fill(24);
  const pane=freeze||freezeColumns?`<pane${freezeColumns?` xSplit="${freezeColumns}"`:''}${freeze?` ySplit="${freeze}"`:''} topLeftCell="${column(freezeColumns)}${freeze+1}" activePane="${freezeColumns?(freeze?'bottomRight':'topRight'):'bottomLeft'}" state="frozen"/>`:'';
  files[`xl/worksheets/sheet${i+1}.xml`]=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="${s.showGridLines===false?0:1}">${pane}</sheetView></sheetViews><cols>${widths.map((w,k)=>`<col min="${k+1}" max="${k+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${s.rows.map((r,n)=>`<row r="${n+1}"${s.heights?.[n]?` ht="${s.heights[n]}" customHeight="1"`:''}>${r.map((cell,k)=>{
   const c=cell&&typeof cell==='object'?cell:{value:cell},style=c.style??s.defaultStyle??0,ref=`${column(k)}${n+1}`;
   const content=c.runs?c.runs.map(run=>`<r><rPr><rFont val="Calibri"/>${run.bold?'<b/>':''}<color rgb="FF${xml(run.color||'20352F')}"/><sz val="${run.size||11}"/></rPr><t xml:space="preserve">${xml(run.text)}</t></r>`).join(''):`<t xml:space="preserve">${xml(c.value)}</t>`;
   return typeof c.value==='number'&&Number.isFinite(c.value)?`<c r="${ref}" s="${style}"><v>${c.value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is>${content}</is></c>`;
  }).join('')}</row>`).join('')}</sheetData>${s.autoFilter?`<autoFilter ref="${xml(s.autoFilter)}"/>`:''}${s.merges?.length?`<mergeCells count="${s.merges.length}">${s.merges.map(ref=>`<mergeCell ref="${xml(ref)}"/>`).join('')}</mergeCells>`:''}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
 });return zip(files);
}
function planView(p,db,date=new Date().toLocaleDateString('zh-CN')){
 const known=new Map(db.courses.map(c=>[c.module_code,c]));
 const items=p.items.map(x=>{
  const c=x.custom?null:known.get(x.code),group=x.group||c?.section_2025[0]||'';
  return {...x,name:x.custom?x.name:c?.module_name_legal_2025||x.name||x.code,translation:x.custom?'':db.names?.[x.code]||'',ects:Number(c?.ects??x.ects),group,statusLabel:x.status==='passed'?'已通过':'待修',termLabel:x.semester?`第 ${x.semester} 学期 · ${T.term(p,x.semester).label}`:x.status==='passed'?'通过学期未记录':'待分配'};
 });
 const sum=rows=>rows.reduce((n,x)=>n+x.ects,0);
 const summarize=rows=>({items:rows,credits:sum(rows),passedCredits:sum(rows.filter(x=>x.status==='passed')),plannedCredits:sum(rows.filter(x=>x.status!=='passed'))});
 const semesters=Array.from({length:p.timeline.count},(_,i)=>({number:i+1,title:`第 ${i+1} 学期`,label:T.term(p,i+1).label,season:C.semesterSeason(p.timeline,i+1),...summarize(items.filter(x=>x.semester===i+1))}));
 const other=[];
 for(const [title,label,rows] of [
  ['待分配课程','尚未安排学期',items.filter(x=>x.status!=='passed'&&!x.semester)],
  ['其他已通过课程','通过学期未记录或在规划范围外',items.filter(x=>x.status==='passed'&&(!x.semester||x.semester>p.timeline.count))]
 ])if(rows.length)other.push({title,label,...summarize(rows)});
 const settings=[['设置','值'],['入学批次',p.cohort],['学期规划',`${p.timeline.count} 个学期，${p.timeline.start==='winter'?'冬季':'夏季'}开始`],['开始规划',`第 ${p.preferences.startSemester} 学期`],['控制理论补修',p.conditionalConfirmed?(p.conditional?'需要':'不需要'):'尚未确认'],['想选',p.preferences.desired.join(', ')],['排除',p.preferences.excluded.join(', ')],['语言',p.preferences.languages.join('/')],['全局学分',`${p.workload.minECTS}–${p.workload.maxECTS} ECTS / 学期`],['全局考核',`${p.workload.minExams}–${p.workload.maxExams} 项 / 学期（估算）`],...Object.entries(p.workload.semesters).map(([n,limits])=>{const b={...p.workload,...limits};return [`第 ${n} 学期负担`,`${b.minECTS}–${b.maxECTS} ECTS；${b.minExams}–${b.maxExams} 项考核（估算）`];}),['标准进度期限',p.preferences.deadlineException?'仅提示，允许方案超出':'按标准进度规划'],['规则','2024 FPSO + 2025-02-11 修订；模拟结果不等于学校认可'],['数据核验','专业选修2026-10-14；规则2026-10-13；实际开课和个人认定以TUMonline为准']];
 return {cohort:p.cohort,date,items,semesters,other,settings,allocated:C.calculate(p,db.courses).allocated,passed:C.calculate(p,db.courses,true).allocated};
}
const boardNote='学期总额为课程学分之和；毕业进度按类别上限计入。已通过课程保留原学期。';
const summary=v=>`已修 ${v.passed} ECTS · 毕业进度（含待修）${v.allocated} / 120 ECTS`;
function planSheets(v){
 const cell=(value,style)=>({value,style}),groups=[...v.semesters,...v.other];
 const widths=[60,16,10,10,12,30],rows=[],heights=[],merges=[];
 const textWidth=value=>Array.from(String(value)).reduce((n,ch)=>n+(/[\u2e80-\uffff]/.test(ch)?2:1),0);
 const rowHeight=(values,cols,min=30)=>Math.max(min,...values.map((value,k)=>String(value).split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(textWidth(line)/Math.max(8,cols[k]-5))),0)*16+12));
 const add=(values,height)=>{rows.push(values);heights.push(height);};
 const heading=(text,style,height)=>{add([cell(text,style)],height);merges.push(`A${rows.length}:F${rows.length}`);};
 heading('TUM RCI · 我的毕业计划',readingStyle.title,34);
 heading(`${v.cohort} · 导出日期 ${v.date}`,readingStyle.meta,20);
 heading(summary(v),readingStyle.progress,26);
 add([],8);
 add(['课程','模块代码','计入领域','ECTS','状态','说明'].map((value,i)=>cell(value,i>=2&&i<=4?readingStyle.centerHead:readingStyle.head)),26);
 groups.forEach((g,index)=>{
  const header=index%2?'teal':'blue',body=index%2?'soft':'white';
  const label=(g.number?(g.label.startsWith('第 ')?g.label:`${g.title} · ${g.label}`):g.title)+' · 合计';
  add([cell(label,readingStyle[header+'Section']),cell('',readingStyle[header+'Section']),cell('',readingStyle[header+'Section']),cell(g.credits,readingStyle[header+'Total']),cell(`${g.items.length} 门课程 · 已通过 ${g.passedCredits} · 待修 ${g.plannedCredits} ECTS`,readingStyle[header+'Summary']),cell('',readingStyle[header+'Summary'])],40);
  merges.push(`A${rows.length}:C${rows.length}`,`E${rows.length}:F${rows.length}`);
  const items=g.number?g.items:[...g.items].sort((a,b)=>(a.semester||Infinity)-(b.semester||Infinity));
  if(!items.length){heading('尚未安排课程',readingStyle[body+'Meta'],30);}
  for(const x of items){
   const translation=x.translation&&x.translation!==x.name?x.translation:'';
   const name=[x.name,translation].filter(Boolean).join('\n');
   const notes=[!g.number?x.termLabel:'',x.locked?'固定学期':'',x.custom?'自录课程，认定需核对':''].filter(Boolean).join('\n');
   const values=[name,x.code,x.group,x.ects,x.statusLabel,notes];
   const course={...cell(name,readingStyle[body+'Text']),runs:[{text:x.name,bold:true},...(translation?[{text:'\n'+translation,color:'5C6B64',size:9}]:[])]};
   add([course,cell(x.code,readingStyle[body+'Meta']),cell(x.group,readingStyle[body+'Status']),cell(x.ects,readingStyle[body+'Number']),cell(x.statusLabel,readingStyle[body+(x.status==='passed'?'Passed':'Status')]),cell(notes,readingStyle[body+'Meta'])],rowHeight(values,widths,42));
  }
  add([],8);
 });
 heading(boardNote,readingStyle.meta,28);
 // A separate plain table keeps sorting/filtering from breaking the reading layout.
 const detailWidths=[34,18,52,30,10,12,14,14,22],detailRows=[['学期','模块代码','原文名称','中文参考名','ECTS','计入领域','状态','固定学期','记录说明'].map((value,i)=>cell(value,i===4?21:9))],detailHeights=[28];
 const band=(index,first=false)=>13+(index%2)*2+(first?4:0);
 groups.forEach((g,index)=>{
  const items=g.number?g.items:[...g.items].sort((a,b)=>(a.semester||Infinity)-(b.semester||Infinity));
  items.forEach((x,i)=>{
   const values=[x.termLabel,x.code,x.name,x.translation,x.ects,x.group,x.statusLabel,x.locked?'是':'否',x.custom?'自录课程，认定需核对':''];
   detailRows.push(values.map(value=>cell(value,band(index,i===0)+(typeof value==='number'?1:0))));detailHeights.push(rowHeight(values,detailWidths));
  });
 });
 const details={name:'课程明细',rows:detailRows,widths:detailWidths,heights:detailHeights,freezeRows:1,freezeColumns:1,repeatRows:1,autoFilter:`A1:I${detailRows.length}`,showGridLines:false};
 const settingWidths=[26,105],settings={name:'规划条件',rows:v.settings.map((r,i)=>r.map(value=>cell(value,i===0?9:10))),widths:settingWidths,heights:v.settings.map((r,i)=>i===0?28:rowHeight(r,settingWidths)),freezeRows:1,repeatRows:1,showGridLines:false};
 return [{name:'课程计划',rows,widths,heights,merges,freezeRows:5,repeatRows:[5,5],showGridLines:false},details,settings];
}
function printPlan(v){
 const e=C.esc;
 const card=x=>`<article class="print-course${x.status==='passed'?' is-passed':''}"><div class="print-course-title">${e(x.name)}</div>${x.translation?`<div class="print-course-translation">${e(x.translation)}</div>`:''}<div class="print-course-code">${e(x.code)} · ${e(x.group)}${x.custom?' · 自录认定':''}</div><div class="print-course-bottom"><b>${x.ects} ECTS</b><span>${x.statusLabel}${x.locked?' · 固定学期':''}</span></div></article>`;
 // Balance groups (e.g. 5 semesters => 3 + 2) and repeat headings on overflow pages.
 const groupSize=Math.ceil(v.semesters.length/Math.ceil(v.semesters.length/4)),boards=[];
 for(let offset=0;offset<v.semesters.length;offset+=groupSize){
  const groups=v.semesters.slice(offset,offset+groupSize);
  boards.push(`<section class="print-board-section${offset?' print-new-page':''}"><h2>学期安排${v.semesters.length>groupSize?` · 第 ${groups[0].number}–${groups.at(-1).number} 学期`:''}</h2><table class="print-semester-board"><thead><tr>${groups.map(g=>`<th scope="col" class="${g.season}"><span class="print-term-title">${g.title}</span><span class="print-term-label">${e(g.label)}</span><strong>${g.credits} ECTS · ${g.items.length} 门</strong><small>已通过 ${g.passedCredits} · 待修 ${g.plannedCredits} ECTS</small></th>`).join('')}</tr></thead><tbody>${Array.from({length:Math.max(1,...groups.map(g=>g.items.length))},(_,i)=>`<tr>${groups.map(g=>`<td>${g.items[i]?card(g.items[i]):i===0?'<p class="print-empty">还没有安排课程</p>':''}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`);
 }
 const other=v.other.map(g=>`<section class="print-other"><h2>${g.title} <small>${g.credits} ECTS · ${g.items.length} 门</small></h2><p>${g.label}</p><table class="print-history"><thead><tr><th>课程</th><th>ECTS</th><th>状态与学期</th></tr></thead><tbody>${g.items.map(x=>`<tr><td><b>${e(x.name)}</b>${x.translation?`<br>${e(x.translation)}`:''}<br><small>${e(x.code)} · ${e(x.group)}${x.custom?' · 自录认定':''}</small></td><td>${x.ects}</td><td>${x.statusLabel}<br>${e(x.termLabel)}</td></tr>`).join('')}</tbody></table></section>`).join('');
 return `<header class="print-plan-heading"><h1>TUM RCI · 我的毕业计划</h1><p>${e(v.cohort)} · 导出日期 ${e(v.date)}</p><div class="print-summary">${summary(v)}</div></header><p class="print-board-note">${boardNote}</p>${boards.join('')}<div class="print-appendix print-new-page">${other}<section class="print-settings"><h2>规划条件</h2><table><tbody>${v.settings.slice(1).map(([k,value])=>`<tr><th scope="row">${e(k)}</th><td>${e(value)||'未设置'}</td></tr>`).join('')}</tbody></table></section><p class="print-footnote">独立学生项目，规则、名额、时间与学分认定请核对学校记录。</p></div>`;
}
function download(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const api={xlsx,download,planView,planSheets,printPlan};if(typeof module==='object'&&module.exports)module.exports=api;else root.RCIExports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
