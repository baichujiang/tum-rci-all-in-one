/* Refresh the invitation at the deadline, including pages left open or restored. */
(function(){
'use strict';
const entry=document.querySelector('[data-community]');
if(!entry)return;
const card=entry.closest('.community-card');
const hero=card.parentElement;
const desktopSlot=document.querySelector('[data-community-slot]');
if(desktopSlot){
 const desktop=window.matchMedia('(min-width:721px)');
 function placeCard(){
  const destination=desktop.matches?desktopSlot:hero;
  if(card.parentElement!==destination)destination.append(card);
 }
 desktop.addEventListener('change',placeCard);
 placeCard();
}
const expiresAt=Date.parse(entry.dataset.expiresAt);
const active=entry.querySelector('[data-community-active]');
const contact=entry.querySelector('[data-community-contact]');
const status=entry.querySelector('[data-community-status]');
const image=entry.querySelector('[data-community-qr]');
let timer;
function refresh(){
 clearTimeout(timer);
 const remaining=expiresAt-Date.now(),available=remaining>0;
 active.hidden=!available;
 contact.hidden=available;
 if(available){
  image.src=image.dataset.src;
  timer=setTimeout(refresh,Math.min(remaining,2147483647));
 }else{
  image.removeAttribute('src');
  status.textContent='二维码已过期，请联系开发者获取入群方式。';
 }
}
entry.addEventListener('toggle',refresh);
window.addEventListener('pageshow',refresh);
document.addEventListener('visibilitychange',refresh);
refresh();
})();
