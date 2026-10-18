/* One set of readings and one refresh loop feed the list and selected menu title. */
(function(root){
 'use strict';
 const MAX_AGE=30*60*1000;
 const updatedTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Europe/Berlin',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 function validReading(data,canteen,now){
  if(data?.version!==1||data.canteen!==canteen||data.state!=='available'||!Number.isSafeInteger(data.current)||data.current<0)return false;
  const updated=Date.parse(data.updated_at),expires=Date.parse(data.expires_at);
  return Number.isFinite(updated)&&Number.isFinite(expires)&&updated-now<=60000&&now-updated<MAX_AGE&&expires-updated===MAX_AGE&&expires>now;
 }
 function create({catalog,node,list,document:doc=root.document,fetch:request=root.fetch?.bind(root),now=Date.now,setTimeout:later=root.setTimeout.bind(root),clearTimeout:cancel=root.clearTimeout.bind(root)}){
  if(!node||!catalog.crowding_url)return null;
  const states=new Map((catalog.crowding_canteens||[]).map(id=>[id,{reading:null,loading:!doc.hidden,controller:null}]));
  let selected='',generation=0,timer=null,nextPoll=0,destroyed=false;
  function paint(target,id){
   const state=states.get(id);target.hidden=!state;if(!state)return;
   const available=validReading(state.reading,id,now());
   const text=available?state.reading.current.toLocaleString('zh-CN')+' 人':state.loading?'读取中':'暂无数据';
   target.dataset.state=available?'available':'unavailable';
   if(target.textContent!==text)target.textContent=text;
   target.title=available?'第三方人数统计 · 更新于 '+updatedTime.format(new Date(state.reading.updated_at))+'（柏林时间）；表示当前人数，与菜单日期无关。':'当前人数暂未提供或数据已过期。';
   target.setAttribute('aria-label',available?'当前人数：'+text:'拥挤度'+text);
  }
  function syncList(){for(const badge of list?.querySelectorAll('[data-crowding-canteen]')||[])paint(badge,badge.dataset.crowdingCanteen);}
  function render(){paint(node,selected);syncList();}
  function schedule(){
   cancel(timer);if(destroyed||doc.hidden||!states.size)return;
   let next=nextPoll;
   for(const [id,state] of states)if(validReading(state.reading,id,now()))next=Math.min(next,Date.parse(state.reading.expires_at));
   timer=later(()=>{render();if(now()>=nextPoll)refresh();else schedule();},Math.max(1,next-now()));
  }
  async function read(id,state,token){
   cancel(state.timeout);state.controller?.abort();const controller=new AbortController();state.controller=controller;
   const timeout=later(()=>controller.abort(),6500);state.timeout=timeout;
   try{
    const url=new URL(catalog.crowding_url,root.location?.href||'http://localhost');url.searchParams.set('canteen',id);
    const response=await request(url.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error('Crowding unavailable');
    const data=await response.json();
    if(token===generation)state.reading=validReading(data,id,now())?data:null;
   }catch(_){if(token===generation)state.reading=null;}
   finally{cancel(timeout);if(token===generation){state.loading=false;render();schedule();}}
  }
  function refresh(){
   const token=++generation;nextPoll=now()+60000;
   for(const [id,state] of states)read(id,state,token);
   render();schedule();
  }
  function stop(){
   ++generation;cancel(timer);
   for(const state of states.values()){state.controller?.abort();cancel(state.timeout);state.loading=false;}
  }
  function visibility(){stop();render();if(!doc.hidden)refresh();}
  doc.addEventListener('visibilitychange',visibility);
  if(!doc.hidden)refresh();else render();
  return {syncList,select(id){selected=id;paint(node,id);},destroy(){destroyed=true;stop();doc.removeEventListener('visibilitychange',visibility);}};
 }
 const api={validReading,create};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MensaCrowding=api;
})(typeof globalThis!=='undefined'?globalThis:this);
