/* Public page counts only; local records and URL parameters stay in the browser. */
(function(){
'use strict';
function isPublicPath(pathname,basePath=''){
 const path=basePath&&pathname.startsWith(basePath+'/')?pathname.slice(basePath.length):pathname;
 return !/^\/(?:admin|api)(?:\/|$)/.test(path);
}
function sanitizeEvent(event,origin,basePath=''){
 if(event?.type!=='pageview')return null;
 try{
  const url=new URL(event.url);
  if(url.origin!==origin||!isPublicPath(url.pathname,basePath))return null;
  return {type:'pageview',url:url.origin+url.pathname};
 }catch(_){return null;}
}
function eligible(options){
 return !!options.productionOrigin&&options.origin===options.productionOrigin&&options.origin.startsWith('https://')&&isPublicPath(options.pathname,options.basePath);
}
function install(inject,options){
 if(!eligible(options))return false;
 inject({mode:'production',debug:false,beforeSend:event=>sanitizeEvent(event,options.origin,options.basePath)});
 return true;
}
if(typeof module!=='undefined'&&module.exports){module.exports={sanitizeEvent,install};return;}
const script=document.currentScript;
const options={origin:location.origin,pathname:location.pathname,productionOrigin:script?.dataset.productionOrigin||'',basePath:script?.dataset.basePath||''};
if(!eligible(options))return;
import('./analytics-sdk.js').then(({inject})=>install(inject,options)).catch(()=>{});
})();
