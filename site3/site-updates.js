/* Dismiss only this announcement; never touch the student's plan or favorites. */
(()=>{
 'use strict';
 const banner=document.querySelector('[data-site-update]');
 if(!banner)return;
 const details=banner.querySelector('details'),summary=banner.querySelector('summary'),dismiss=banner.querySelector('[data-site-update-dismiss]');
 const key='rci.site-updates.dismissed',version=banner.dataset.siteUpdate;
 let closed=false;
 try{closed=localStorage.getItem(key)===version;}catch(_){}
 function reveal(){
  banner.hidden=false;
  details.open=true;
  banner.scrollIntoView({block:'start'});
  summary.focus({preventScroll:true});
 }
 function restore(){
  if(location.hash==='#site-updates')reveal();
  else banner.hidden=closed;
 }
 dismiss.hidden=false;
 dismiss.addEventListener('click',()=>{
  closed=true;
  try{localStorage.setItem(key,version);}catch(_){}
  banner.hidden=true;
  details.open=false;
  if(location.hash==='#site-updates')history.replaceState(history.state,'',location.pathname+location.search);
  const heading=document.querySelector('.entry-hero h1');
  if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
 });
 document.querySelectorAll('[data-site-updates-open]').forEach(link=>link.addEventListener('click',()=>{
  // Also handle a second click when the URL already contains this hash.
  reveal();
 }));
 window.addEventListener('hashchange',restore);
 window.addEventListener('pageshow',restore);
 restore();
})();
