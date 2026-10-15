/* Compressed share links and printable plans. All transformation happens locally. */
(async function(){
'use strict';
const U=window.RCIUI,C=window.RCI,T=window.RCICourseContext,e=C.esc,box=document.getElementById('plan-exports');if(!box)return;
let db;try{db=await U.data();}catch(_){return;}
box.innerHTML='<div class="plan-export-actions"><button class="plan-tool-row" type="button" data-plan-xlsx><span><b>导出 Excel</b><small>课程、学分和学期安排</small></span><span aria-hidden="true">↓</span></button><button class="plan-tool-row" type="button" data-plan-print><span><b>打印／保存 PDF</b><small>生成可打印的完整计划</small></span><span aria-hidden="true">↓</span></button><button class="plan-tool-row" type="button" data-plan-link><span><b>生成分享链接</b><small>分享当前计划，不包含收藏</small></span><span aria-hidden="true">↗</span></button></div><div id="plan-share-output" hidden><label>分享链接（含课程、已修和选课偏好）<textarea readonly rows="3" aria-label="个人计划分享链接"></textarea></label><p class="meta">任何得到链接的人都可读取其中的计划。链接内容在浏览器解码，不上传到本站服务器；收藏不会包含在链接中。</p></div>';
const getName=(code,p)=>p.items.find(x=>x.code===code&&x.custom)?.name||db.courses.find(c=>c.module_code===code)?.module_name_legal_2025||p.items.find(x=>x.code===code)?.name||code;
function sheets(p){
 const rows=[['模块代码','原文名称','中文参考名','ECTS','计入领域','状态','学期','固定学期']];
 for(const x of p.items){const c=x.custom?null:db.courses.find(c=>c.module_code===x.code);rows.push([x.code,getName(x.code,p),x.custom?'':db.names[x.code]||'',Number(c?.ects??x.ects),x.group||c?.section_2025[0],x.status==='passed'?'已修通过':'未来计划',x.status==='passed'?'已修':x.semester?T.term(p,x.semester).label:'待分配',x.locked?'是':'否']);}
 const settings=[['设置','值'],['入学批次',p.cohort],['控制理论补修',p.conditional?'是':'否'],['想选',p.preferences.desired.join(', ')],['排除',p.preferences.excluded.join(', ')],['语言',p.preferences.languages.join('/')],['全局学分',`${p.workload.minECTS}–${p.workload.maxECTS}`],['全局考核',`${p.workload.minExams}–${p.workload.maxExams}`],['规则','2024 FPSO + 2025-02-11 修订；模拟结果不等于学校认可'],['数据核验','专业选修2026-10-14；规则2026-10-13；实际开课和个人认定以TUMonline为准']];
 return [{name:'毕业计划',rows},{name:'规划条件',rows:settings}];
}
box.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
 const p=await U.plan();
 if(b.hasAttribute('data-plan-xlsx'))window.RCIExports.download(window.RCIExports.xlsx(sheets(p)),'rci-study-plan.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 if(b.hasAttribute('data-plan-print')){const print=document.getElementById('printable-plan');print.innerHTML=`<h1>TUM RCI · 我的毕业计划</h1><p>${e(p.cohort)} · ${new Date().toLocaleDateString('zh-CN')} · 已修 ${C.calculate(p,db.courses,true).allocated}，规划 ${C.calculate(p,db.courses).allocated} / 120 ECTS</p>${sheets(p).map(s=>`<h2>${s.name}</h2><table><thead><tr>${s.rows[0].map(x=>`<th>${e(x)}</th>`).join('')}</tr></thead><tbody>${s.rows.slice(1).map(r=>`<tr>${r.map(x=>`<td>${e(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}<p>独立学生项目，规则、名额、时间与学分认定请核对学校记录。</p>`;window.print();}
 if(b.hasAttribute('data-plan-link')){
  if(typeof CompressionStream==='undefined')throw new Error('浏览器不支持压缩分享，请使用完整 JSON 备份迁移。');
  const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify({...p,timetable:{events:[],replaced:[]}})]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const value=btoa(Array.from(bytes,x=>String.fromCharCode(x)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(value.length>60000)throw new Error('计划过大，不适合链接分享，请导出完整备份。');
  const target=box.querySelector('#plan-share-output');target.hidden=false;target.querySelector('textarea').value=location.origin+U.base+'/planner/#plan='+value;target.querySelector('textarea').focus();target.querySelector('textarea').select();
 }
 }catch(error){U.toast(error.message);}});
const shared=location.hash.startsWith('#plan=')?location.hash.slice(6):'';
if(shared)try{
 if(shared.length>60000||!/^[A-Za-z0-9_-]+$/.test(shared)||typeof DecompressionStream==='undefined')throw new Error('无法读取分享链接；可使用 JSON 备份导入。');
 const bytes=Uint8Array.from(atob(shared.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)),reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 let chunks=[],size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw new Error('分享内容超出 2 MB');}chunks.push(value);}
 const p=C.validatePlan(JSON.parse(await new Blob(chunks).text()),db.courses),calc=C.calculate(p,db.courses),before=JSON.stringify(await U.plan());
 if(await U.confirmAction('查看到一份分享计划',`${p.cohort}，${p.items.length} 门课程，已修 ${C.calculate(p,db.courses,true).allocated} ECTS，规划 ${calc.allocated} / 120 ECTS。导入将替换计划，收藏保留，并自动保存当前数据供恢复。`,'导入并保留恢复备份')){
  const snapshot=await U.backupSnapshot();if(JSON.stringify(snapshot.data.plan)!==before)throw new Error('计划已更新，请重新打开链接核对。');
  await U.importBackup({plan:p,favorites:null,legacy:true},'replace',snapshot);U.toast('分享计划已导入；原计划可在备份与恢复中找回。');
 }
 history.replaceState(null,'',location.pathname+location.search);
}catch(error){U.toast(error.message);}
})();
