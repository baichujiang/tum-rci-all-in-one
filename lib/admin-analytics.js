/* Server-only, bounded queries of the existing Vercel Web Analytics dataset. */
'use strict';
const projectId='prj_kKIaE5FAphsU2C7hdC93F9KBIzVH',teamId='team_oF7mkDKDywaaYzrHLxxfZfrc';
const day=86400000;
function count(row){
 if(!row||!Number.isSafeInteger(row.visitors)||row.visitors<0||!Number.isSafeInteger(row.pageviews)||row.pageviews<0)throw Error('Invalid analytics counts');
 return {visitors:row.visitors,pageviews:row.pageviews};
}
function publicPath(value){return typeof value==='string'&&value.length<=500&&/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(value)&&!/^\/(admin|api)(\/|$)/.test(value);}
function createAnalytics({env=process.env,fetch:request=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 return async function read(days){
  const token=env.ANALYTICS_VERCEL_TOKEN;
  if(!token){const error=Error('访客统计尚未连接，请联系维护者完成配置。');error.status=503;throw error;}
  const time=now(),end=Math.floor(time/day)*day+day,start=end-days*day,key=days+':'+end;
  if(cache.get(key)?.expiresAt>time)return cache.get(key).data;
  if(pending.has(key))return pending.get(key);
  async function query(endpoint,by){
   const url=new URL('https://api.vercel.com/v1/query/web-analytics/visits/'+endpoint);
   // Count rounds the upper bound down to midnight; aggregate rounds up.
   // Give both the same complete UTC-day window, including the current day.
   url.search=new URLSearchParams({projectId,teamId,since:new Date(start).toISOString(),until:new Date(by?end-1:end).toISOString(),filter:"environment eq 'production' and not startswith(requestPath, '/admin') and not startswith(requestPath, '/api')",...(by?{by,limit:by==='day'?'31':'8'}:{})}).toString();
   const response=await request(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!response.ok)throw Error('Analytics upstream unavailable');
   const result=await response.json();
   if(!result||!('data'in result))throw Error('Invalid analytics response');
   return result.data;
  }
  const job=(async()=>{
   const [total,daily,pages]=await Promise.all([query('count'),query('aggregate','day'),query('aggregate','requestPath')]);
   if(!Array.isArray(daily)||daily.length>31||!Array.isArray(pages)||pages.length>9)throw Error('Invalid analytics groups');
   const buckets=new Map();
   for(const row of daily){const timestamp=Date.parse(row.timestamp);if(!Number.isFinite(timestamp)||timestamp<start||timestamp>=end||timestamp%day!==0||buckets.has(timestamp))throw Error('Invalid analytics day');buckets.set(timestamp,count(row));}
   const trend=[];for(let timestamp=start;timestamp<end;timestamp+=day)trend.push({date:new Date(timestamp).toISOString().slice(0,10),...(buckets.get(timestamp)||{visitors:0,pageviews:0})});
   const topPages=pages.map(row=>({...count(row),path:publicPath(row.requestPath)?row.requestPath:null})).filter(row=>row.path).sort((a,b)=>b.pageviews-a.pageviews).slice(0,8);
   const data={days,since:new Date(start).toISOString(),until:new Date(end).toISOString(),updatedAt:new Date(time).toISOString(),timezone:'UTC',totals:count(total),trend,topPages};
   for(const [entry,value]of cache)if(value.expiresAt<=time)cache.delete(entry);
   cache.set(key,{expiresAt:time+60000,data});return data;
  })();
  pending.set(key,job);
  try{return await job;}finally{pending.delete(key);}
 };
}
module.exports={createAnalytics};
