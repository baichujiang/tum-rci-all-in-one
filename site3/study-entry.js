/* Desktop study help is read-only and remains usable without loading plan data. */
(function(){
'use strict';
if(!window.matchMedia?.('(min-width: 961px)')?.matches)return;
const guide=document.getElementById('plan-study-dialog');
if(guide){
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-open-study]')&&!guide.open)guide.showModal();
  if(event.target.closest('[data-close-study]'))guide.close();
 });
 if(new URLSearchParams(window.location.search).get('guide')==='study')guide.showModal();
 return;
}
const base=document.querySelector('meta[name="rci-base"]').content;
window.location.replace(base+'/planner/?guide=study');
})();
