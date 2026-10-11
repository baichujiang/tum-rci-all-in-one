/* Deterministic local search. No remote queries, tracking or generated answers. MIT. */
(function(root){
'use strict';
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu,'');
const stop=/^(怎么|如何|什么|哪里|我要|我想|请问|可以|需要|一个|有没有|找到|want|how|where|what|the|to|for|is|a|i)$/i;
function terms(query,groups){
 const q=normalize(query);let rest=normalize(String(query).replace(/\b(how|do|does|i|we|where|what|is|are|the|a|an|to|can|please|course|courses|module)\b/gi,' '));const out=[];
 [...groups].sort((a,b)=>Math.max(...b.map(x=>normalize(x).length))-Math.max(...a.map(x=>normalize(x).length))).forEach(g=>{
  const ns=g.map(normalize).filter(Boolean);const hits=ns.filter(x=>rest.includes(x) && (x.length>2 || !/^[a-z]+$/.test(x) || new RegExp('(^|[^a-z])'+x+'([^a-z]|$)','i').test(query)));
  if(hits.length){out.push(ns);hits.forEach(x=>{rest=rest.split(x).join(' ');});}
 });
 rest=rest.replace(/(请问|我想要|我想|我要|怎样|怎么|如何|哪里|在哪|什么|需要|可以|能不能|有没有|找到|一下|请|的|了|吗|呢|是)/g,' ');
 const parts=rest.match(/[a-z0-9._-]+|[\u3400-\u9fff]+/gi)||[];
 for(const x of parts)if(!stop.test(x)&&x.length>1)out.push([x]);
 return out.length?out:[[q]];
}
function search(docs,query,groups=[],filter={}){
 const q=normalize(query);if(!q)return docs.filter(d=>(!filter.kind||d.kind===filter.kind)&&(!filter.task||d.tasks.includes(filter.task)));
 const gs=terms(query,groups),exactCode=q.match(/^(in|ed|mw|ei|wi)\d+$/i);
 const scored=[];
 const has=(text,t)=>/^[a-z]{1,3}$/.test(t)?new RegExp('(^|[^a-z0-9])'+t+'([^a-z0-9]|$)','i').test(String(text||'')):normalize(text).includes(t);
 for(const d of docs){
  if(filter.kind&&d.kind!==filter.kind || filter.task&&!d.tasks.includes(filter.task))continue;
  const title=normalize(d.title), aliases=(d.aliases||[]).map(normalize), all=[d.title,d.summary,d.body,...(d.aliases||[])].join(' ');
  if(exactCode && normalize(d.code)!==q && !normalize(all).includes(q))continue;
  let score=0,matched=0;
  for(const g of gs){const hit=g.some(t=>has(all,t));if(!hit)continue;matched++;score+=g.some(t=>has(d.title,t))?35:g.some(t=>(d.aliases||[]).some(a=>has(a,t)))?27:g.some(t=>has(d.summary,t))?12:3;}
  if(!matched || (gs.length>1 && matched<gs.length))continue;
  if(normalize(d.code)===q)score+=1000;
  if(title===q||aliases.includes(q))score+=100;
  else if(title.includes(q))score+=55;
  if(d.kind==='guide')score+=8;
  if(d.direct && (title===q||aliases.includes(q)))score+=90;
  if(d.historical)score-=20;
  scored.push({...d,score});
 }
 return scored.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
const api={normalize,terms,search};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RCISearch=api;
})(typeof globalThis!=='undefined'?globalThis:this);
