/* File backups stay on the student's device. No account or remote storage. MIT. */
(function(){
'use strict';
const U=window.RCIUI,B=window.RCIBackup,dialog=document.getElementById('backup-dialog');if(!U||!B||!dialog)return;
const $=s=>dialog.querySelector(s),file=$('#backup-file'),mode=$('#backup-mode'),preview=$('#backup-preview'),apply=$('#backup-apply'),status=$('#backup-status');
let db,incoming=null,expected=null,serial=0,busy=false,sourceName='',restoring=false;
const say=(message,error=false)=>{status.textContent=message;status.classList.toggle('backup-error',error);};
function download(value,raw=false){
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=`rci-${raw?'raw-records':'backup'}-${date}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function resetPreview(){incoming=null;expected=null;preview.hidden=true;apply.disabled=true;sourceName='';restoring=false;file.value='';}
function dateLabel(value){const date=new Date(value);return Number.isNaN(date.valueOf())?'未记录时间':date.toLocaleString('zh-CN',{timeZone:'Europe/Berlin',hour12:false});}
async function refresh(){
 db=await U.data();
 const snap=await U.backupSnapshot();$('#backup-current').textContent=`当前保存 ${snap.data.plan.items.length} 门课程、${snap.data.favorites.length} 个收藏。`;
 const records=U.getBackupHistory(),select=$('#backup-recovery-select');select.replaceChildren();
 records.forEach((r,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${dateLabel(r.createdAt)} · ${r.data.plan?.items?.length??'?'} 门课程 · ${r.data.favorites?.length??'?'} 个收藏`;select.append(option);});
 $('#backup-recovery').hidden=!records.length;
 return snap;
}
async function showPreview(){
 const request=++serial;apply.disabled=true;if(!incoming){preview.hidden=true;return;}
 try{
  const snap=await U.backupSnapshot(),next=B.prepare(snap.data,incoming,mode.value,db.courses);if(request!==serial)return;
  expected=snap;$('#backup-file-name').textContent=sourceName;
  $('#backup-preview-counts').textContent=`当前：${snap.data.plan.items.length} 门课程、${snap.data.favorites.length} 个收藏；导入后：${next.plan.items.length} 门课程、${next.favorites.length} 个收藏。`;
  const explanation=mode.value==='merge'?'合并时保留已有课程的安排与状态，收藏去重合并。':'使用备份里的计划和收藏；当前数据先保存为恢复备份。';
  $('#backup-preview-notes').textContent=[explanation,...next.notes,incoming.legacy?'这是旧版计划文件，当前收藏保持不变。':''].filter(Boolean).join(' ');
  apply.textContent=restoring?(mode.value==='merge'?'确认合并恢复':'确认恢复'):mode.value==='merge'?'确认合并导入':'确认替换导入';preview.hidden=false;apply.disabled=false;
  say('核对预览后再确认。导入前会保留当前数据，最近 3 次记录可在下方恢复。');
 }catch(err){if(request===serial){preview.hidden=true;expected=null;say(err.message,true);}}
}
document.addEventListener('click',async event=>{
 const trigger=event.target.closest('[data-backup-open]');if(!trigger)return;
 event.preventDefault();if(dialog.open)return;
 resetPreview();mode.value='merge';say('');dialog.showModal();
 try{await refresh();}catch(err){$('#backup-current').textContent='当前记录暂时无法读取。';say(err.message+' 可先导出原始记录保留副本。',true);}
});
$('[data-backup-close]').addEventListener('click',()=>{if(!busy)dialog.close();});
dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
dialog.addEventListener('close',()=>{serial++;resetPreview();});
$('#backup-export').addEventListener('click',async()=>{
 try{const snapshot=await U.backupSnapshot(),d=db||await U.data();download(B.create(snapshot.data,d.courses));say('备份文件已生成，包含学分计划、学期安排和收藏。请保存在自己的设备。');}catch(err){say(err.message+' 可使用下方的原始记录导出。',true);}
});
$('#backup-export-raw').addEventListener('click',()=>{try{download(U.rawBackup(),true);say('原始本地记录已导出，原有数据未修改。');}catch(_){say('浏览器暂时无法读取本地记录，请不要清理缓存。',true);}});
file.addEventListener('change',async()=>{
 const selected=file.files?.[0];if(!selected)return;const request=++serial;incoming=null;expected=null;preview.hidden=true;apply.disabled=true;restoring=false;
 try{
  if(selected.size>B.maxBytes)throw new Error('文件太大，上限 2 MB。');
  const d=db||await U.data(),parsed=B.parse(await selected.text(),d.courses);if(request!==serial)return;
  db=d;incoming=parsed;sourceName=selected.name;await showPreview();
 }catch(err){if(request===serial){file.value='';say(err.message,true);}}
});
mode.addEventListener('change',showPreview);
$('#backup-recovery-preview').addEventListener('click',async()=>{
 try{
  const record=U.getBackupHistory()[Number($('#backup-recovery-select').value)];if(!record)throw new Error('没有找到这份恢复备份，请重新打开面板。');
  db=db||await U.data();incoming=B.parse(JSON.stringify(record),db.courses);sourceName='导入前备份：'+dateLabel(record.createdAt);restoring=true;mode.value='replace';await showPreview();
 }catch(err){say(err.message,true);}
});
apply.addEventListener('click',async()=>{
 if(busy||!incoming||!expected)return;busy=true;apply.disabled=true;
 const controls=[file,mode,$('#backup-recovery-select'),$('#backup-recovery-preview')];controls.forEach(el=>{el.disabled=true;});
 try{
  await U.importBackup(incoming,mode.value,expected);const recovered=restoring;resetPreview();await refresh();say(recovered?'原有计划和收藏已恢复，恢复前的数据也已备份。':'导入完成，计划和收藏已保存在当前浏览器。导入前的数据可在下方恢复。');
 }catch(err){expected=null;apply.disabled=true;say(err.message,true);}
 finally{busy=false;controls.forEach(el=>{el.disabled=false;});}
});
})();
