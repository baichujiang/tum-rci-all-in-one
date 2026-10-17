/* Shared academic rules stay readable without loading or changing personal plans. */
(function(){
'use strict';
const guide=document.getElementById('plan-study-dialog');
if(guide){
 const creditCheck=document.getElementById('credit-check-dialog');
 let returnToCreditCheck=false;
 function jump(section){
  if(!['credits','deadlines','registration','sources'].includes(section))return;
  const target=document.getElementById('study-'+section);if(!target)return;
  target.open=true;
  target.scrollIntoView({block:'start'});
  target.querySelector('summary')?.focus({preventScroll:true});
 }
 function open(section){
  if(creditCheck?.open){returnToCreditCheck=true;creditCheck.close();}
  if(!guide.open)guide.showModal();
  if(section)jump(section);
 }
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-open-study]');
  if(trigger)open(trigger.dataset.studySection);
  const chapter=event.target.closest('[data-study-jump]');
  if(chapter)jump(chapter.dataset.studyJump);
  if(event.target.closest('[data-close-study]'))guide.close();
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
