/* Academic semester identity and evidence of course offerings. MIT. */
(function(root){
'use strict';
const C=typeof module==='object'&&module.exports?require('./core'):root.RCI;
function term(plan,semester){
 if(!C.hasAcademicTerm(plan))return {season:null,year:null,key:'',label:C.planSemesterLabel(plan,semester)};
 const match=plan.cohort.match(/^\d{4}/),base=match?Number(match[0]):null;
 const season=C.semesterSeason(plan.timeline,semester);
 const year=base===null?null:base+Math.floor((semester-1+(plan.timeline.start==='winter'?1:0))/2);
 return {season,year,key:year===null?'':`${year}-${season}`,label:year===null?C.semesterLabel(plan.timeline,semester):season==='winter'?`${year}/${String(year+1).slice(2)} 冬季`:`${year} 夏季`};
}
function offering(plan,course,semester,offerings={}){
 if(course?.custom)return {...C.offering(null,term(plan,semester).season),dated:null};
 const dated=offerings[course?.module_code]?.offerings?.[term(plan,semester).key];
 if(dated)return {state:dated.available===false?'conflict':'compatible',label:dated.available===false?'本学期确认不开课':'已核对本学期开课',dated,source:dated.source};
 return {...C.offering(course,term(plan,semester).season),dated:null};
}
const api={term,offering};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RCICourseContext=api;
})(typeof globalThis!=='undefined'?globalThis:this);
