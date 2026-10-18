'use strict';
const {timingSafeEqual}=require('node:crypto'),{createMensa}=require('../lib/mensa-sync');
function createHandler({service=createMensa(),env=process.env,log=console.error}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const expected=env.CRON_SECRET&&Buffer.from('Bearer '+env.CRON_SECRET),actual=Buffer.from(typeof req.headers.authorization==='string'?req.headers.authorization:'');
  if(!expected||expected.length!==actual.length||!timingSafeEqual(expected,actual))return res.status(401).json({error:'Unauthorized'});
  try{
   const force=new URL(req.url,'http://localhost').searchParams.get('force')==='1',result=await service.sync({force});
   if(!result.ok)log('Daily menu translation incomplete');
   return res.status(result.ok?200:503).json(result);
  }catch(_){log('Daily menu sync failed');return res.status(503).json({ok:false,error:'Menu synchronization unavailable'});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
