/* Shared navigation control; links keep their ordinary URL and browser history. */
'use strict';
const e=require('../assets/core').esc;
const backIcon='<svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';
function backLink(href,label,{id='',classes='',detail=false}={}){
 return `<a class="back-button${classes?' '+e(classes):''}"${id?` id="${e(id)}"`:''}${detail?' data-detail-back':''} href="${e(href)}">${backIcon}<span>${e(label)}</span></a>`;
}
module.exports={backLink};
