/* Public head counts advertised by eat-api; capacity percentages have no documented scale. */
'use strict';
const SOURCES=Object.freeze({
 'mensa-lothstr':'MENSA_LOTHSTR',
 'mensa-pasing':'MENSA_PASING',
 'stucafe-pasing':'STUCAFE_PASING'
});
const MAX_AGE=30*60*1000;
function createCrowding({fetch:request=globalThis.fetch,now=Date.now}={}){
 return async canteen=>{
  const base={version:1,canteen,state:'unavailable'};
  if(!Object.hasOwn(SOURCES,canteen))return {...base,state:'unsupported'};
  const response=await request('https://api.redcube.dev/v1/capacity/'+SOURCES[canteen],{
   signal:AbortSignal.timeout(5000),redirect:'error',headers:{Accept:'application/json'}
  });
  if(!response.ok)throw Error('Crowding source unavailable');
  const body=await response.text();
  if(body.length>10000)throw Error('Invalid crowding response');
  const data=JSON.parse(body),updated=typeof data?.updated==='string'?Date.parse(data.updated):NaN;
  if(!data||Array.isArray(data)||data.enum_name!==SOURCES[canteen]||
   !Number.isSafeInteger(data.current)||data.current<0||!Number.isFinite(updated)||
   !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.updated))throw Error('Invalid crowding reading');
  if(now()-updated>=MAX_AGE||updated-now()>60000)return base;
  return {...base,state:'available',current:data.current,updated_at:new Date(updated).toISOString(),expires_at:new Date(updated+MAX_AGE).toISOString()};
 };
}
module.exports={SOURCES,MAX_AGE,createCrowding};
