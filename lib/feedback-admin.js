/* Server-only helpers. Passwords, sessions and inbox contents never enter static output. */
'use strict';
const crypto=require('node:crypto'),{promisify}=require('node:util'),blob=require('@vercel/blob');
const scrypt=promisify(crypto.scrypt),ttl=8*60*60;
const keyPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{64}\.json$/i;
const statuses=new Set(['pending','progress','resolved']);
function fail(code,message){const error=Error(message);error.status=code;throw error;}
function headers(res){res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Cookie');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');}
function sameOrigin(req,env=process.env){
 const origin=req.headers.origin,host=req.headers.host;
 const scheme=req.socket?.encrypted||env.VERCEL?'https':'http';
 if(req.headers['sec-fetch-site']==='cross-site'||origin!==`${scheme}://${host}`)fail(403,'请从本站管理页操作。');
}
function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))fail(415,'请求格式不正确，请刷新后重试。');
 if(Number(req.headers['content-length'])>4096)fail(413,'请求过长。');
 let data;try{data=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch(_){fail(400,'请求格式不正确。');}
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'请求格式不正确。');
 if(Buffer.byteLength(JSON.stringify(data))>4096)fail(413,'请求过长。');
 return data;
}
async function hashPassword(password){
 const salt=crypto.randomBytes(16).toString('hex');
 const value=await scrypt(password,salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024});
 return `scrypt:${salt}:${value.toString('hex')}`;
}
async function verifyPassword(password,hash){
 if(typeof password!=='string'||password.length>256||!/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/.test(hash||''))return false;
 const [,salt,value]=hash.split(':'),derived=await scrypt(password,salt,32,{N:131072,r:8,p:1,maxmem:256*1024*1024});
 return crypto.timingSafeEqual(derived,Buffer.from(value,'hex'));
}
function createAdmin({store=blob,env=process.env,now=Date.now}={}){
 const configured=()=>/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/.test(env.FEEDBACK_ADMIN_PASSWORD_HASH||'')&&(env.FEEDBACK_ADMIN_SESSION_SECRET||'').length>=32&&!!env.FEEDBACK_RATE_LIMIT_SECRET&&!!(env.BLOB_READ_WRITE_TOKEN||(env.BLOB_STORE_ID&&env.VERCEL_OIDC_TOKEN));
 const version=()=>crypto.createHash('sha256').update(env.FEEDBACK_ADMIN_PASSWORD_HASH).digest('hex');
 const options=()=>({access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',abortSignal:AbortSignal.timeout(10000)});
 async function read(pathname){
  let result;try{result=await store.get(pathname,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(10000)});}catch(error){if(error instanceof blob.BlobNotFoundError)return null;throw error;}
  if(!result)return null;
  if(result.statusCode!==200)throw Error('Unexpected private response');
  return {data:JSON.parse(await new Response(result.stream).text()),etag:result.blob.etag};
 }
 async function cookie(req,res){
  const {getIronSession}=await import('iron-session');
  const secure=!!env.VERCEL||!!req.socket?.encrypted;
  return getIronSession(req,res,{cookieName:secure?'__Host-rci-feedback-admin':'rci-feedback-admin-local',password:env.FEEDBACK_ADMIN_SESSION_SECRET,ttl,cookieOptions:{secure,httpOnly:true,sameSite:'strict',path:'/',maxAge:ttl-60}});
 }
 async function session(req,res,required=true){
  if(!configured())fail(503,'管理登录暂未配置，请联系维护者。');
  const sealed=await cookie(req,res);
  let record=null;
  if(/^[a-f0-9]{64}$/.test(sealed.sid||'')&&sealed.version===version())record=await read('admin-sessions/'+sealed.sid+'.json');
  if(!record||!Number.isFinite(record.data.expiresAt)||record.data.expiresAt<=now()||record.data.version!==version()||!/^[0-9a-f]{64}$/.test(record.data.csrf||'')){
   if(required)fail(401,'登录已过期，请重新登录。');
   return {sealed,record:null};
  }
  return {sealed,record:record.data};
 }
 function csrf(req,record){if(!record||req.headers['x-csrf-token']!==record.csrf)fail(403,'操作校验失败，请刷新管理页后重试。');}
 async function limitLogin(req){
  const bucket=Math.floor(now()/900000),ip=env.VERCEL?req.headers['x-vercel-forwarded-for']:req.socket?.remoteAddress;
  const network=crypto.createHmac('sha256',env.FEEDBACK_RATE_LIMIT_SECRET).update(`${bucket}:${ip||'unknown'}`).digest('hex');
  for(let slot=0;slot<5;slot++){
   const key=`admin-login-rate/${bucket}-${network}-${slot}.json`;
   try{await store.put(key,JSON.stringify({expiresAt:now()+86400000}),options());return;}
   catch(error){if(!await read(key))throw error;}
  }
  fail(429,'登录尝试较多，请 15 分钟后再试。');
 }
 return {store,env,now,configured,version,options,read,cookie,session,csrf,limitLogin};
}
module.exports={createAdmin,headers,sameOrigin,body,fail,hashPassword,verifyPassword,keyPattern,statuses,ttl};
