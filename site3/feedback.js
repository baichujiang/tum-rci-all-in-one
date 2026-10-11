/* Student-authored feedback is a draft; only the student submits it on GitHub. */
(function(root){
'use strict';
const types={missing:'缺少网站入口',feature:'功能建议',problem:'使用问题'};
function draft(type,message,path){
 const label=types[type]||types.feature,text=String(message||'').trim().slice(0,600);
 const page=/^\/[a-zA-Z0-9/_-]*$/.test(path||'')?path:'/';
 const title='['+label+'] '+text.replace(/\s+/g,' ').slice(0,60);
 const body=`反馈类型：${label}\n\n${text}\n\n相关页面：${page}`;
 const params=new URLSearchParams({title,body});
 return {body,title,page,url:'https://github.com/baichujiang/tum-rci-all-in-one/issues/new?'+params};
}
if(typeof module!=='undefined'&&module.exports)module.exports={draft};
else root.RCIFeedback={draft};
if(typeof document==='undefined')return;
const form=document.getElementById('feedback-form');if(!form)return;
const type=document.getElementById('feedback-type'),message=document.getElementById('feedback-message'),submit=document.getElementById('feedback-submit'),status=document.getElementById('feedback-status');
const params=new URLSearchParams(location.search),page=params.get('from')||'/';
if(types[params.get('type')])type.value=params.get('type');
const path=draft(type.value,'',page).page;
document.getElementById('feedback-context').textContent=path==='/'?'首页':path;
const update=()=>{submit.href=draft(type.value,message.value,path).url;status.textContent='';};
type.addEventListener('change',update);message.addEventListener('input',update);update();
submit.addEventListener('click',ev=>{if(!form.reportValidity())ev.preventDefault();});
form.addEventListener('submit',ev=>{ev.preventDefault();if(form.reportValidity())submit.click();});
document.getElementById('feedback-copy').addEventListener('click',async()=>{
 if(!form.reportValidity())return;
 const text=draft(type.value,message.value,path).body;
 try{await navigator.clipboard.writeText(text);status.textContent='已复制反馈文字，尚未提交。';}
 catch(_){const field=document.getElementById('feedback-copy-fallback');field.hidden=false;field.value=text;field.focus();field.select();status.textContent='可以手动复制下方文字，尚未提交。';}
});
})(typeof globalThis!=='undefined'?globalThis:this);
