'use strict';
const {createMensa,weekKey}=require('../lib/mensa-sync');
function createHandler({service=createMensa(),log=console.error}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'不支持此操作。'});}
  const params=new URL(req.url,'http://localhost').searchParams,id=params.get('canteen'),date=params.get('date');
  try{weekKey(id,date);}catch(_){return res.status(400).json({error:'请选择有效的食堂和日期。'});}
  try{
   const data=await service.publicWeek(id,date);
   res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
   return res.status(200).json(data);
  }catch(_){log('Menu translation cache unavailable');return res.status(503).json({error:'中文参考暂时无法读取。'});}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
