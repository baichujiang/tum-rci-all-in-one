/* Compressed share links and printable plans. All transformation happens locally. */
(async function(){
'use strict';
const U=window.RCIUI,C=window.RCI,X=window.RCIExports,box=document.getElementById('plan-exports');if(!box)return;
let db;try{db=await U.data();}catch(_){return;}
box.innerHTML='<div class="plan-export-actions"><button class="plan-tool-row" type="button" data-plan-xlsx><span><b>导出 Excel</b><small>课程与学分合计按学期分段展示</small></span><span aria-hidden="true">↓</span></button><button class="plan-tool-row" type="button" data-plan-print><span><b>打印／保存 PDF</b><small>横向学期看板，含每学期学分与状态</small></span><span aria-hidden="true">↓</span></button><button class="plan-tool-row" type="button" data-plan-link><span><b>生成分享链接</b><small>分享当前计划，不包含收藏</small></span><span aria-hidden="true">↗</span></button></div><div id="plan-share-output" hidden><label>分享链接（含课程、已修和选课偏好）<textarea readonly rows="3" aria-label="个人计划分享链接"></textarea></label><p class="meta">任何得到链接的人都可读取其中的计划。链接内容在浏览器解码，不上传到本站服务器；收藏不会包含在链接中。</p></div>';
box.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
 const p=await U.plan();
 if(b.hasAttribute('data-plan-xlsx'))X.download(X.xlsx(X.planSheets(X.planView(p,db))),'rci-study-plan.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 if(b.hasAttribute('data-plan-print')){document.getElementById('printable-plan').innerHTML=X.printPlan(X.planView(p,db));window.print();}
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
