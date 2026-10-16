'use strict';
const blob=require('@vercel/blob');
const {createAdmin,headers,sameOrigin,body,fail,keyPattern,statuses}=require('../lib/feedback-admin');
const pageSize=20,scanLimit=100;
const rank=b=>new Date(b.uploadedAt).toISOString()+'|'+b.pathname;
function createHandler(deps={}){
 const admin=createAdmin(deps),log=deps.log||console.error;
 async function readItem(meta){
  const key=meta.pathname.slice('feedback/'.length),[entry,state]=await Promise.all([admin.read(meta.pathname),admin.read('feedback-status/'+key)]);
  if(!entry)return null;
  const value=entry.data;
  if(typeof value.message!=='string'||!['missing','feature','problem'].includes(value.type))throw Error('Invalid feedback record');
  return {key,id:value.id,type:value.type,message:value.message,page:value.page,createdAt:value.createdAt,status:state?.data.status||'pending',updatedAt:state?.data.updatedAt||null,version:state?.etag||null};
 }
 return async function handler(req,res){
  headers(res);
  try{
   if(!['GET','PATCH'].includes(req.method)){res.setHeader('Allow','GET, PATCH');fail(405,'不支持此操作。');}
   const {record}=await admin.session(req,res);
   if(req.method==='PATCH'){
    sameOrigin(req,admin.env);admin.csrf(req,record);const input=body(req);
    if(typeof input.key!=='string'||!keyPattern.test(input.key)||!statuses.has(input.status)||!(input.version===null||(typeof input.version==='string'&&input.version.length<200)))fail(400,'处理状态格式不正确。');
    if(!await admin.read('feedback/'+input.key))fail(404,'这条反馈不存在。');
    const key='feedback-status/'+input.key,current=await admin.read(key);
    if((current?.etag||null)!==input.version)fail(409,'这条反馈已在其他页面更新，请刷新后再试。');
    const value={status:input.status,updatedAt:new Date(admin.now()).toISOString()};
    try{
     const saved=await admin.store.put(key,JSON.stringify(value),{...admin.options(),allowOverwrite:!!current,...(current?{ifMatch:current.etag}:{})});
     return res.status(200).json({...value,key:input.key,version:saved.etag});
    }catch(error){
     if(error instanceof blob.BlobPreconditionFailedError||(!current&&await admin.read(key)))fail(409,'这条反馈已在其他页面更新，请刷新后再试。');
     throw error;
    }
   }
   const query=new URL(req.url,'http://localhost').searchParams,status=query.get('status')||'all',cursor=query.get('cursor');
   if(status!=='all'&&!statuses.has(status))fail(400,'筛选状态不正确。');
   let before='';if(cursor){try{before=Buffer.from(cursor,'base64url').toString('utf8');if(cursor.length>400||!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|feedback\//.test(before)||!keyPattern.test(before.split('|feedback/')[1]))throw Error();}catch(_){fail(400,'分页位置不正确，请刷新。');}}
   let metadata=[],next;
   do{
    const result=await admin.store.list({prefix:'feedback/',limit:1000,cursor:next});
    metadata.push(...result.blobs.filter(b=>keyPattern.test(b.pathname.slice('feedback/'.length))));next=result.hasMore?result.cursor:null;
    if(metadata.length>10000)fail(503,'反馈较多，暂时无法加载，请联系维护者。');
   }while(next);
   metadata.sort((a,b)=>rank(a)<rank(b)?1:rank(a)>rank(b)?-1:0);if(before)metadata=metadata.filter(b=>rank(b)<before);
   const items=[];let scanned=0,last;
   // Scan filtered pages in small batches, with an explicit continuation if more remain.
   while(scanned<metadata.length&&scanned<scanLimit&&items.length<pageSize){
    const batch=metadata.slice(scanned,scanned+Math.min(5,pageSize-items.length,scanLimit-scanned));
    const records=await Promise.all(batch.map(readItem));
    for(let i=0;i<batch.length;i++){scanned++;last=batch[i];const item=records[i];if(item&&(status==='all'||item.status===status))items.push(item);}
   }
   return res.status(200).json({items,nextCursor:scanned<metadata.length?Buffer.from(rank(last)).toString('base64url'):null});
  }catch(error){
   if(!error.status)log('Feedback inbox unavailable');
   return res.status(error.status||503).json({error:error.status?error.message:'反馈暂时无法加载，当前显示内容未改变，请稍后重试。'});
  }
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
