/* Local-only backup format, merge rules and recoverable storage writes. MIT. */
(function(root){
'use strict';
const C=typeof module==='object'&&module.exports?require('../assets/core'):root.RCI;
const keys={plan:'rci:v2:plan',favorites:'rci:v2:saves',history:'rci:v3:import-backups',journal:'rci:v3:import-journal'};
const maxBytes=2000000;
function favorites(value){
 if(!Array.isArray(value)||value.length>2000||value.some(x=>typeof x!=='string'||!x.length||x.length>160||/[\u0000-\u001f]/.test(x)))throw new Error('收藏列表无效，当前数据未修改。');
 return [...new Set(value)];
}
function state(value,courses){return {plan:C.validatePlan(value.plan,courses),favorites:favorites(value.favorites)};}
function create(value,courses,date=new Date().toISOString()){
 return {type:'tum-rci-backup',version:1,createdAt:date,data:state(value,courses)};
}
function parse(text,courses){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>maxBytes)throw new Error('备份文件太大，上限 2 MB。');
 let raw;try{raw=JSON.parse(text.replace(/^\uFEFF/,''));}catch(_){throw new Error('文件不是有效的 JSON，当前数据未修改。');}
 if(raw?.type==='tum-rci-backup'){
  if(raw.version!==1)throw new Error('此备份版本暂不支持，当前数据未修改。');
  if(!raw.data||!Object.hasOwn(raw.data,'plan')||!Object.hasOwn(raw.data,'favorites'))throw new Error('备份缺少计划或收藏，当前数据未修改。');
  return {...state(raw.data,courses),legacy:false};
 }
 return {plan:C.validatePlan(raw,courses),favorites:null,legacy:true};
}
function fingerprint(value){return JSON.stringify({plan:value.plan,favorites:value.favorites});}
function prepare(current,incoming,mode,courses){
 current=state(current,courses);
 if(!['merge','replace'].includes(mode))throw new Error('请选择合并或替换。');
 const other=C.validatePlan(incoming.plan,courses),saves=incoming.favorites===null?null:favorites(incoming.favorites);
 const notes=[];let plan;
 const defaultSettings=C.validatePlan({version:2,cohort:'unknown',conditional:false,items:[]},courses);
 const settingsUntouched=['cohort','conditional','conditionalConfirmed','timeline','preferences','workload','timetable'].every(key=>JSON.stringify(current.plan[key])===JSON.stringify(defaultSettings[key]));
 if(mode==='replace'||!current.plan.items.length&&settingsUntouched){plan=other;if(mode==='merge')notes.push('当前没有课程或个人规划设置，采用备份里的学期、批次与补修设置。');}
 else{
  const p=current.plan,sameSeason=p.timeline.start===other.timeline.start;
  const count=sameSeason?Math.max(p.timeline.count,other.timeline.count):p.timeline.count;
  const items=[...p.items],used=new Set(items.map(x=>x.code));let moved=0,kept=0;
  for(const item of other.items){
   if(used.has(item.code)){kept++;continue;}
   const opposite=item.code==='IN2067'?'ED160028':item.code==='ED160028'?'IN2067':null;
   if(opposite&&used.has(opposite)){notes.push(`${item.code} 与当前选择的 ${opposite} 二选一，保留当前选择。`);continue;}
   const semester=sameSeason?item.semester:0;if(!sameSeason&&item.semester)moved++;
   items.push({...item,semester});used.add(item.code);
  }
  if(kept)notes.push(`${kept} 门重复课程保留当前设备的安排与状态。`);
  if(moved)notes.push(`起始冬夏季节不同，${moved} 门新增课程放入待分配。`);
  plan={...p,timeline:{...p.timeline,count},items};
  notes.push('想选／排除、语言、负担、固定学期及兼容记录保留当前设备设置；替换模式会采用备份的全部设置。');
 }
 const result=state({plan,favorites:saves===null?current.favorites:mode==='merge'?[...new Set([...current.favorites,...saves])]:saves},courses);
 return {...result,notes,legacy:incoming.legacy};
}
function capture(storage){return {plan:storage.getItem(keys.plan),favorites:storage.getItem(keys.favorites),history:storage.getItem(keys.history)};}
function rawValid(value){return value&&['plan','favorites','history'].every(k=>value[k]===null||typeof value[k]==='string');}
function pending(storage){
 const text=storage.getItem(keys.journal);if(text===null)return null;
 let record;try{record=JSON.parse(text);}catch(_){throw new Error('本地恢复记录无法读取，请先导出原始记录。');}
 if(record?.version!==1||!rawValid(record.before))throw new Error('本地恢复记录无效，请先导出原始记录。');
 return record;
}
function restoreRaw(storage,before){
 if(!rawValid(before))throw new Error('本地恢复记录无效。');
 for(const k of ['plan','favorites','history'])before[k]===null?storage.removeItem(keys[k]):storage.setItem(keys[k],before[k]);
}
function recover(storage){
 const record=pending(storage);if(!record)return false;
 restoreRaw(storage,record.before);storage.removeItem(keys.journal);return true;
}
function history(storage){
 const text=storage.getItem(keys.history);if(text===null)return [];
 let records;try{records=JSON.parse(text);}catch(_){throw new Error('之前的备份记录无法读取，当前数据未修改。');}
 if(!Array.isArray(records)||records.length>3||records.some(r=>r?.type!=='tum-rci-backup'||r.version!==1||typeof r.createdAt!=='string'||!r.data))throw new Error('之前的备份记录无效，当前数据未修改。');
 return records;
}
function commit(storage,next,{expected,beforeBackup}){
 if(pending(storage))throw new Error('上次导入尚未恢复，请刷新后再试。');
 const before=capture(storage);
 if(expected&&JSON.stringify(before)!==JSON.stringify(expected))throw new Error('当前数据已在其他页面更新，请重新核对导入预览。');
 const records=[beforeBackup,...history(storage)].slice(0,3);
 const journal={version:1,createdAt:new Date().toISOString(),before};
 if(pending(storage))throw new Error('上次导入尚未恢复，请刷新后再试。');
 if(JSON.stringify(capture(storage))!==JSON.stringify(before))throw new Error('当前数据已在其他页面更新，请重新核对导入预览。');
 try{storage.setItem(keys.journal,JSON.stringify(journal));}catch(_){throw new Error('浏览器无法保存恢复备份。请先导出文件，当前数据未修改。');}
 try{
  storage.setItem(keys.history,JSON.stringify(records));
  storage.setItem(keys.plan,JSON.stringify(next.plan));
  storage.setItem(keys.favorites,JSON.stringify(next.favorites));
  storage.removeItem(keys.journal);
 }catch(_){
  try{restoreRaw(storage,before);storage.removeItem(keys.journal);}catch(_){throw new Error('导入未完成，原始记录仍在恢复备份中。请刷新以恢复，或导出原始记录。');}
  throw new Error('浏览器保存失败，原有计划和收藏已恢复。请先导出文件备份。');
 }
 return next;
}
const api={keys,maxBytes,favorites,state,create,parse,prepare,fingerprint,capture,pending,recover,history,commit};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RCIBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this);
