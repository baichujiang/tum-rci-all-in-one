/* Public UI shell only; feedback and every mutation require a server-verified session. */
(function(){
'use strict';
const $=id=>document.getElementById(id),login=$('admin-login'),inbox=$('admin-inbox');if(!login||!inbox)return;
const status=$('admin-status'),list=$('admin-feedback-list'),filter=$('admin-filter'),password=$('admin-password');
const labels={pending:'待处理',progress:'处理中',resolved:'已处理'},types={missing:'缺少入口',feature:'功能建议',problem:'使用问题'};
const base=document.querySelector('meta[name="rci-base"]')?.content||'';
const date=new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'});
let csrf='',items=[],nextCursor=null,busy=false,expiryTimer=null,requestVersion=0,loadedFilter='all';
function announce(text,error=false){status.textContent=text;status.dataset.state=error?'error':'';}
function lock(text='请输入管理员密码登录。'){
 requestVersion++;csrf='';items=[];nextCursor=null;list.replaceChildren();$('admin-list-summary').textContent='';login.hidden=false;inbox.hidden=true;password.value='';clearTimeout(expiryTimer);announce(text);
}
function authenticated(session){
 csrf=session.csrf;login.hidden=true;inbox.hidden=false;password.value='';
 clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>lock('登录已过期，请重新登录。'),Math.max(0,session.expiresAt-Date.now()));
}
function pending(value){
 busy=value;inbox.setAttribute('aria-busy',String(value));
 for(const node of inbox.querySelectorAll('button,select'))node.disabled=value;
 if(!value)for(const button of inbox.querySelectorAll('[data-save-status]'))button.disabled=button.dataset.dirty!=='true';
 $('admin-login-button').disabled=value;password.readOnly=value;
}
async function api(path,options={}){
 const response=await fetch(base+path,{...options,credentials:'same-origin',cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{}),...options.headers},signal:AbortSignal.timeout(32000)});
 let result;try{result=await response.json();}catch(_){throw Error('管理服务暂时不可用，请稍后重试。');}
 if(!response.ok){
  if(response.status===401&&options.method!=='POST')lock('登录已过期，请重新登录。');
  const error=Error(result.error||'操作失败，请稍后重试。');error.code=response.status;throw error;
 }
 return result;
}
function element(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function format(value){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?'时间未记录':date.format(parsed);}
function render(){
 list.replaceChildren();const shown=items.filter(item=>filter.value==='all'||item.status===filter.value);
 $('admin-list-summary').textContent=`已显示 ${shown.length} 条${nextCursor?' · 还有更早的反馈':''}`;
 for(const item of shown){
  const card=element('article','admin-feedback-card'),top=element('div','admin-card-top');
  const pill=element('span','admin-state',labels[item.status]||labels.pending);pill.dataset.state=item.status;
  top.append(element('span','admin-type',types[item.type]||'反馈'),pill);
  card.append(top,element('p','admin-feedback-message',item.message));
  const meta=element('div','admin-feedback-meta');meta.append(element('span','',format(item.createdAt)),element('span','','编号：'+String(item.id).slice(0,8)));
  if(typeof item.page==='string'&&/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(item.page)){
   const link=element('a','text-link',item.page==='/'?'来自首页':'相关页面：'+item.page);link.href=base+item.page;link.target='_blank';link.rel='noopener noreferrer';meta.append(link);
  }
  card.append(meta);
  if(item.updatedAt)card.append(element('p','meta admin-updated','状态更新：'+format(item.updatedAt)));
  const actions=element('div','admin-card-actions'),label=element('label','','处理状态'),select=element('select');
  for(const [value,text]of Object.entries(labels)){const option=element('option','',text);option.value=value;select.append(option);}select.value=item.status;
  label.append(select);const save=element('button','button secondary','保存状态');save.type='button';save.disabled=true;save.dataset.saveStatus='';save.dataset.dirty='false';
  select.addEventListener('change',()=>{save.dataset.dirty=String(select.value!==item.status);save.disabled=busy||select.value===item.status;});
  save.addEventListener('click',async()=>{
   if(busy||select.value===item.status)return;pending(true);announce('正在保存状态…');
   try{
    const result=await api('/api/admin-feedback',{method:'PATCH',body:JSON.stringify({key:item.key,status:select.value,version:item.version})});
    Object.assign(item,{status:result.status,version:result.version,updatedAt:result.updatedAt});render();announce('已标记为「'+labels[item.status]+'」。');
   }catch(error){
    select.value=item.status;save.dataset.dirty='false';
    if(error.code===409){pending(false);await load(true);}
    announce(error.message,true);
   }finally{pending(false);}
  });
  actions.append(label,save);card.append(actions);list.append(card);
 }
 if(!shown.length)list.append(element('p','admin-empty',nextCursor?'这批没有符合条件的反馈，可以继续加载更早的反馈。':filter.value==='all'?'暂时没有反馈。':'暂时没有「'+labels[filter.value]+'」的反馈。'));
 $('admin-more').hidden=!nextCursor;
}
async function load(reset){
 if(busy)return;pending(true);const version=++requestVersion;announce('正在加载反馈…');
 const query=new URLSearchParams({status:filter.value});if(!reset&&nextCursor)query.set('cursor',nextCursor);
 try{
  const result=await api('/api/admin-feedback?'+query);
  if(version!==requestVersion)return;
  items=reset?result.items:items.concat(result.items.filter(item=>!items.some(old=>old.key===item.key)));nextCursor=result.nextCursor;loadedFilter=filter.value;render();announce('');
 }catch(error){filter.value=loadedFilter;announce(error.message,true);}finally{pending(false);}
}
async function check(){
 try{const result=await api('/api/admin-session');if(result.authenticated){authenticated(result);await load(true);}else lock();}
 catch(error){lock(error.message);announce(error.message,true);}
}
$('admin-login-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!event.currentTarget.reportValidity())return;pending(true);announce('正在登录…');
 try{const result=await api('/api/admin-session',{method:'POST',body:JSON.stringify({password:password.value})});authenticated(result);pending(false);await load(true);}
 catch(error){password.value='';announce(error.message,true);}finally{pending(false);}
});
filter.addEventListener('change',()=>load(true));$('admin-refresh').addEventListener('click',()=>load(true));$('admin-more').addEventListener('click',()=>load(false));
$('admin-logout').addEventListener('click',async()=>{
 if(busy)return;pending(true);
 try{await api('/api/admin-session',{method:'DELETE'});lock('已退出登录。');}
 catch(error){announce(error.message,true);}finally{pending(false);}
});
window.addEventListener('pagehide',()=>lock('正在检查登录状态…'));
window.addEventListener('pageshow',event=>{if(event.persisted)check();});
check();
})();
