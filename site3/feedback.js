/* Submit directly to the site's private feedback inbox. */
(function(root){
'use strict';
const types={missing:'缺少网站入口',feature:'功能建议',problem:'使用问题'};
function draft(type,message,path){
 const page=typeof path==='string'&&path.length<=160&&/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(path)?path:'/';
 const text=String(message||'').trim().slice(0,2000),kind=Object.hasOwn(types,type)?type:'feature';
 return {type:kind,message:text,page,body:`反馈类型：${types[kind]}\n\n${text}\n\n相关页面：${page}`};
}
if(typeof module!=='undefined'&&module.exports)module.exports={draft};
else root.RCIFeedback={draft};
if(typeof document==='undefined')return;
const form=document.getElementById('feedback-form');if(!form)return;
const type=document.getElementById('feedback-type'),message=document.getElementById('feedback-message'),submit=document.getElementById('feedback-submit'),status=document.getElementById('feedback-status');
const params=new URLSearchParams(location.search),page=params.get('from')||'/';
if(Object.hasOwn(types,params.get('type')))type.value=params.get('type');
const path=draft(type.value,'',page).page;
document.getElementById('feedback-context').textContent=path==='/'?'首页':path;
let pending=false,submission=null;
const announce=(text,state='')=>{status.textContent=text;status.dataset.state=state;};
const update=()=>{submission=null;submit.disabled=false;submit.textContent='提交反馈';announce('');message.setCustomValidity('');};
type.addEventListener('change',update);message.addEventListener('input',update);
form.addEventListener('submit',async ev=>{
 ev.preventDefault();if(pending||submit.disabled)return;
 message.setCustomValidity(message.value.trim().length<4?'请至少填写 4 个字。':'');
 if(!form.reportValidity())return;
 if(!submission)submission={...draft(type.value,message.value,path),id:crypto.randomUUID(),website:document.getElementById('feedback-website').value};
 const {body,...payload}=submission;
 pending=true;submit.disabled=true;submit.textContent='正在提交…';type.disabled=true;message.readOnly=true;form.setAttribute('aria-busy','true');announce('正在提交反馈…');
 try{
  const response=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  const result=await response.json();
  if(!response.ok||result.ok!==true||result.id!==submission.id)throw Error(typeof result.error==='string'?result.error:'暂时无法确认提交结果，请重试。');
  message.value='';submit.textContent='已提交';submission=null;
  announce('反馈已收到，谢谢！编号：'+result.id.slice(0,8),'success');
 }catch(error){
  submit.disabled=false;submit.textContent='重新提交';
  announce(error.name==='TimeoutError'||error instanceof TypeError||error instanceof SyntaxError?'暂时无法确认提交结果，内容已保留，请重试。':error.message,'error');
 }finally{pending=false;type.disabled=false;message.readOnly=false;form.removeAttribute('aria-busy');}
});
document.getElementById('feedback-copy').addEventListener('click',async()=>{
 if(!form.reportValidity())return;
 const text=draft(type.value,message.value,path).body;
 try{await navigator.clipboard.writeText(text);announce('已复制反馈文字，尚未提交。');}
 catch(_){const field=document.getElementById('feedback-copy-fallback');field.hidden=false;field.value=text;field.focus();field.select();announce('可以手动复制下方文字，尚未提交。');}
});
})(typeof globalThis!=='undefined'?globalThis:this);
