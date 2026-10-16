'use strict';
const {createAdmin,headers,fail}=require('../lib/feedback-admin');
const {createAnalytics}=require('../lib/admin-analytics');
function createHandler(deps={}){
 const admin=createAdmin(deps),read=createAnalytics(deps),log=deps.log||console.error;
 return async function handler(req,res){
  headers(res);
  try{
   if(req.method!=='GET'){res.setHeader('Allow','GET');fail(405,'不支持此操作。');}
   await admin.session(req,res);
   const params=new URL(req.url,'http://localhost').searchParams,days=params.get('days')||'7';
   if(!['7','30'].includes(days)||[...params.keys()].some(key=>key!=='days')||params.getAll('days').length>1)fail(400,'请选择近 7 天或近 30 天。');
   return res.status(200).json(await read(Number(days)));
  }catch(error){
   if(!error.status)log('Admin analytics unavailable');
   return res.status(error.status||503).json({error:error.status?error.message:'访客统计暂时无法更新，请稍后重试。'});
  }
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
