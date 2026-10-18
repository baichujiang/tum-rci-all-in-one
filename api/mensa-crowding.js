'use strict';
const {createCrowding}=require('../lib/mensa-crowding');
const canteens=new Set(require('../content/canteens.json').canteens.map(c=>c.id));
function createHandler({read=createCrowding()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const canteen=new URL(req.url,'http://localhost').searchParams.get('canteen');
  if(!canteens.has(canteen))return res.status(400).json({error:'请选择有效食堂。'});
  try{
   const data=await read(canteen);
   if(data.state==='available')res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
   if(data.state==='unsupported')res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');
   return res.status(200).json(data);
  }catch(_){return res.status(503).json({version:1,canteen,state:'unavailable'});}
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
