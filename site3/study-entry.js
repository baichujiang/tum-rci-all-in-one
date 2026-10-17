/* Shared academic rules stay readable without loading or changing personal plans. */
(function(){
'use strict';
const guide=document.getElementById('plan-study-dialog');
if(guide){
 const creditCheck=document.getElementById('credit-check-dialog');
 const sections=['credits','deadlines','registration','sources'];
 const content=document.getElementById('study-rule-panels');
 document.getElementById('study-rule-nav').setAttribute('role','tablist');
 for(const section of sections){
  const tab=document.getElementById('study-tab-'+section),panel=document.getElementById('study-'+section);
  tab.setAttribute('role','tab');
  panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.tabIndex=0;
 }
 let returnToCreditCheck=false;
 function select(section,focus=false){
  if(!sections.includes(section))return;
  for(const key of sections){
   const selected=key===section,tab=document.getElementById('study-tab-'+key);
   tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
   document.getElementById('study-'+key).hidden=!selected;
  }
  content.scrollTop=0;
  if(focus)document.getElementById('study-tab-'+section).focus({preventScroll:true});
 }
 select('credits');
 function open(section){
  if(creditCheck?.open){returnToCreditCheck=true;creditCheck.close();}
  if(!guide.open)guide.showModal();
  select(sections.includes(section)?section:'credits');
 }
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-open-study]');
  if(trigger)open(trigger.dataset.studySection);
  const chapter=event.target.closest('[data-study-tab]');
  if(chapter)select(chapter.dataset.studyTab);
  if(event.target.closest('[data-close-study]'))guide.close();
 });
 document.addEventListener('keydown',event=>{
  const tab=event.target.closest('[data-study-tab]');if(!tab)return;
  const index=sections.indexOf(tab.dataset.studyTab);if(index<0)return;
  const next={ArrowRight:(index+1)%sections.length,ArrowLeft:(index+sections.length-1)%sections.length,Home:0,End:sections.length-1}[event.key];
  if(next===undefined)return;
  event.preventDefault();select(sections[next],true);
 });
 guide.addEventListener('close',()=>{
  if(!returnToCreditCheck)return;
  returnToCreditCheck=false;creditCheck.showModal();
  creditCheck.querySelector('[data-open-study]')?.focus({preventScroll:true});
 });
 const params=new URLSearchParams(window.location.search);
 if(params.get('guide')==='study')open(params.get('section'));
 return;
}
const base=document.querySelector('meta[name="rci-base"]').content;
window.location.replace(base+'/planner/?guide=study');
})();
