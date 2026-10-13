/* Dated teaching facts and personal weekly sessions. No network or storage. MIT. */
(function(root){
'use strict';
const C=typeof module==='object'&&module.exports?require('./core'):root.RCI;
function term(plan,semester){
 const match=plan.cohort.match(/^\d{4}/),base=match?Number(match[0]):null;
 const season=C.semesterSeason(plan.timeline,semester);
 const year=base===null?null:base+Math.floor((semester-1+(plan.timeline.start==='winter'?1:0))/2);
 return {season,year,key:year===null?'':`${year}-${season}`,label:year===null?C.semesterLabel(plan.timeline,semester):season==='winter'?`${year}/${String(year+1).slice(2)} 冬季`:`${year} 夏季`};
}
function offering(plan,course,semester,details={}){
 const dated=details[course?.module_code]?.offerings?.[term(plan,semester).key];
 if(dated)return {state:dated.available===false?'conflict':'compatible',label:dated.available===false?'本学期确认不开课':'已核对本学期开课',dated,source:dated.source};
 return {...C.offering(course?{...course,term_legal_annex:course.current_term||course.term_legal_annex}:course,term(plan,semester).season),dated:null};
}
function sessions(plan,code,semester,details={}){
 const manual=plan.timetable.events.filter(x=>x.code===code&&x.semester===semester);
 const replaced=plan.timetable.replaced.some(x=>x.code===code&&x.semester===semester);
 const record=details[code]?.offerings?.[term(plan,semester).key];
 const official=replaced?[]:(record?.sessions??[]).map((x,i)=>({...x,id:`official-${code}-${semester}-${i}`,code,semester,kind:'course',title:x.title||code,allowOverlap:false,source:record.source,checkedOn:record.checkedOn}));
 return [...official,...manual];
}
const overlap=(a,b)=>a.day===b.day&&a.start<b.end&&b.start<a.end&&(!a.dates||!b.dates||a.dates.some(d=>b.dates.includes(d)));
function conflicts(events){
 const result=[];
 for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++)if(overlap(events[i],events[j]))result.push({a:events[i],b:events[j],allowed:!!(events[i].allowOverlap||events[j].allowOverlap)});
 return result;
}
function week(plan,courses,semester,details={},options={}){
 plan=C.validatePlan(plan,courses);
 const selected=plan.items.filter(x=>x.status==='planned'&&x.semester===semester),events=plan.timetable.events.filter(x=>x.semester===semester&&!x.code),missing=[],partial=[];
 for(const item of selected){
  const list=sessions(plan,item.code,semester,details);events.push(...list);
  if(!list.length&&item.code!=='IN2320')missing.push(item.code);
  else if(!plan.timetable.replaced.some(x=>x.code===item.code&&x.semester===semester)&&details[item.code]?.offerings?.[term(plan,semester).key]?.coverage==='partial')partial.push(item.code);
 }
 const visible=options.monday?events.filter(x=>!x.dates||x.dates.some(date=>date>=options.monday&&date<new Date(new Date(options.monday+'T12:00:00Z').getTime()+7*86400000).toISOString().slice(0,10))):events;
 return {term:term(plan,semester),events:visible,conflicts:conflicts(visible),missing,partial};
}
const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const api={term,offering,sessions,overlap,conflicts,week,time};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RCITimetable=api;
})(typeof globalThis!=='undefined'?globalThis:this);
