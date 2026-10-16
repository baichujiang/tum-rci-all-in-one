'use strict';
const {randomBytes}=require('node:crypto');
const {createAdmin,headers,sameOrigin,body,fail,verifyPassword,ttl}=require('../lib/feedback-admin');
function createHandler(deps={}){
 const admin=createAdmin(deps),log=deps.log||console.error;
 return async function handler(req,res){
  headers(res);
  try{
   if(!['GET','POST','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, DELETE');fail(405,'不支持此操作。');}
   if(!admin.configured())fail(503,'管理登录暂未配置，请联系维护者。');
   if(req.method==='GET'){
    const {record}=await admin.session(req,res,false);
    return res.status(200).json(record?{authenticated:true,csrf:record.csrf,expiresAt:record.expiresAt}:{authenticated:false});
   }
   sameOrigin(req,admin.env);
   if(req.method==='POST'){
    const input=body(req);if(typeof input.password!=='string'||input.password.length<1||input.password.length>256)fail(400,'请输入管理员密码。');
    await admin.limitLogin(req);
    if(!await verifyPassword(input.password,admin.env.FEEDBACK_ADMIN_PASSWORD_HASH))fail(401,'管理员密码不正确。');
    const {sealed,record:old}=await admin.session(req,res,false);
    if(old)await admin.store.del('admin-sessions/'+sealed.sid+'.json');
    sealed.sid=randomBytes(32).toString('hex');sealed.version=admin.version();
    const record={csrf:randomBytes(32).toString('hex'),expiresAt:admin.now()+ttl*1000,version:admin.version()};
    await admin.store.put('admin-sessions/'+sealed.sid+'.json',JSON.stringify(record),admin.options());
    await sealed.save();return res.status(200).json({authenticated:true,csrf:record.csrf,expiresAt:record.expiresAt});
   }
   const {sealed,record}=await admin.session(req,res);admin.csrf(req,record);
   await admin.store.del('admin-sessions/'+sealed.sid+'.json');sealed.destroy();
   return res.status(200).json({authenticated:false});
  }catch(error){
   if(!error.status)log('Feedback admin session unavailable');
   if(error.status===429)res.setHeader('Retry-After','900');
   return res.status(error.status||503).json({error:error.status?error.message:'管理服务暂时不可用，请稍后重试。'});
  }
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
