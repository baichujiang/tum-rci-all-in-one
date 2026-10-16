/* Anonymous feedback is stored privately. No student data is sent to GitHub. */
'use strict';
const {createHash,createHmac}=require('node:crypto');
const blob=require('@vercel/blob');
const types=new Set(['missing','feature','problem']);
const maxBytes=12000;

function createHandler({store=blob,env=process.env,now=Date.now,log=console.error}={}){
 return async function feedback(req,res){
  res.setHeader('Cache-Control','no-store');
  const reply=(code,data)=>res.status(code).json(data);
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,{error:'请在反馈表单中提交。'});}
  // JSON and a same-origin browser request prevent cross-site form submissions.
  const host=req.headers.host,origin=req.headers.origin;
  if(req.headers['sec-fetch-site']==='cross-site'||(origin&&origin!==`https://${host}`&&origin!==`http://${host}`))return reply(403,{error:'请从本站反馈页面提交。'});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return reply(415,{error:'反馈格式不正确，请刷新后重试。'});
  if(Number(req.headers['content-length'])>maxBytes)return reply(413,{error:'反馈过长，请缩短后重试。'});
  let input;
  try{input=req.body;if(typeof input==='string')input=JSON.parse(input);}
  catch(_){return reply(400,{error:'反馈格式不正确，请刷新后重试。'});}
  if(!input||typeof input!=='object'||Array.isArray(input))return reply(400,{error:'请填写反馈内容。'});
  if(Buffer.byteLength(JSON.stringify(input))>maxBytes)return reply(413,{error:'反馈过长，请缩短后重试。'});
  const {id,type}=input,message=typeof input.message==='string'?input.message.trim():'';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||'')||!types.has(type)||message.length<4||message.length>2000)return reply(400,{error:'请选择反馈类型，并填写 4–2000 字的描述。'});
  if(input.website)return reply(400,{error:'提交未通过，请刷新后重试。'});
  const page=typeof input.page==='string'&&input.page.length<=160&&/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(input.page)?input.page:'/';
  if(!env.FEEDBACK_RATE_LIMIT_SECRET||!(env.BLOB_READ_WRITE_TOKEN||(env.BLOB_STORE_ID&&env.VERCEL_OIDC_TOKEN)))return reply(503,{error:'反馈暂时无法接收，内容仍在，请稍后重试。'});
  const timestamp=now(),digest=createHash('sha256').update(JSON.stringify({type,message,page})).digest('hex');
  const pathname=`feedback/${id}-${digest}.json`;
  const options={access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',abortSignal:AbortSignal.timeout(8000)};
  const exists=async name=>{try{await store.head(name,{abortSignal:options.abortSignal});return true;}catch(error){if(error instanceof blob.BlobNotFoundError)return false;throw error;}};
  try{
   if(await exists(pathname))return reply(200,{ok:true,id});
   // Only Vercel's trusted forwarding header is used in deployment; raw IPs are never saved.
   const ip=env.VERCEL?req.headers['x-vercel-forwarded-for']:req.socket?.remoteAddress;
   const bucket=Math.floor(timestamp/10000);
   const network=createHmac('sha256',env.FEEDBACK_RATE_LIMIT_SECRET).update(`${bucket}:${ip||'unknown'}`).digest('hex');
   const ratePath=`feedback-rate/${bucket}-${network}.json`;
   try{await store.put(ratePath,JSON.stringify({expiresAt:timestamp+86400000}),options);}
   catch(error){
    if(!await exists(ratePath))throw error;
    if(await exists(pathname))return reply(200,{ok:true,id});
    res.setHeader('Retry-After','10');return reply(429,{error:'提交较频繁，请等 10 秒再试，内容仍在。'});
   }
   try{await store.put(pathname,JSON.stringify({id,type,message,page,createdAt:new Date(timestamp).toISOString()}),options);}
   catch(error){if(!await exists(pathname))throw error;}
   return reply(201,{ok:true,id});
  }catch(_){
   // Do not log feedback text, network identifiers or storage credentials.
   log('Feedback storage unavailable');
   return reply(503,{error:'暂时无法确认提交结果，请重试；同一条反馈不会重复保存。'});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
