/* Private statistics are fetched only after the existing admin login succeeds. */
(function(){
'use strict';
window.RCIAdminAnalytics={create({api}){
 const $=id=>document.getElementById(id),panel=$('admin-analytics'),range=$('analytics-range'),refresh=$('analytics-refresh'),status=$('analytics-status'),results=$('analytics-results');
 const number=new Intl.NumberFormat('zh-CN'),stamp=new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'});
 let version=0,busy=false,loadedDays='7';
 function element(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
 function reset(){version++;busy=false;panel.hidden=true;results.hidden=true;range.value='7';loadedDays='7';refresh.disabled=false;range.disabled=false;panel.setAttribute('aria-busy','false');status.textContent='';$('analytics-visitors').textContent='—';$('analytics-pageviews').textContent='—';$('analytics-trend').replaceChildren();$('analytics-pages').replaceChildren();$('analytics-daily').replaceChildren();$('analytics-updated').textContent='';}
 function render(data){
  $('analytics-visitors').textContent=number.format(data.totals.visitors);$('analytics-pageviews').textContent=number.format(data.totals.pageviews);
  const trend=$('analytics-trend'),bars=element('div','analytics-bars');trend.replaceChildren();
  const max=Math.max(1,...data.trend.map(row=>row.pageviews));bars.style.setProperty('--analytics-days',String(data.trend.length));bars.style.setProperty('--analytics-column-width',Math.max(32,number.format(max).length*8)+'px');
  for(const row of data.trend){
   const day=element('div','analytics-day'),track=element('div','analytics-bar-track'),bar=element('div','analytics-bar');
   day.title=`${row.date}：${number.format(row.visitors)} 位访客，${number.format(row.pageviews)} 次浏览`;day.setAttribute('role','img');day.setAttribute('aria-label',day.title);
   bar.style.height=String(row.pageviews/max*124)+'px';bar.append(element('span','analytics-value',number.format(row.pageviews)));track.append(bar);
   day.append(track,element('span','analytics-date',row.date.slice(5).replace('-','/')));bars.append(day);
  }
  trend.append(bars);trend.scrollLeft=0;
  $('analytics-empty').hidden=data.totals.pageviews!==0;
  const body=$('analytics-daily');body.replaceChildren();for(const row of data.trend){const tr=element('tr');tr.append(element('th','',row.date),element('td','',number.format(row.visitors)),element('td','',number.format(row.pageviews)));tr.firstChild.scope='row';body.append(tr);}
  const pages=$('analytics-pages');pages.replaceChildren();for(const row of data.topPages){const tr=element('tr'),cell=element('th'),link=element('a','text-link',row.path);cell.scope='row';link.href=row.path;link.target='_blank';link.rel='noopener noreferrer';cell.append(link);tr.append(cell,element('td','',number.format(row.visitors)),element('td','',number.format(row.pageviews)));pages.append(tr);}
  $('analytics-no-pages').hidden=!!data.topPages.length;$('analytics-pages-table').hidden=!data.topPages.length;
  $('analytics-updated').textContent='更新于 '+stamp.format(new Date(data.updatedAt))+'（柏林时间）';results.hidden=false;
 }
 async function load(){
  if(busy||panel.hidden)return;busy=true;const request=++version;refresh.disabled=true;range.disabled=true;panel.setAttribute('aria-busy','true');status.textContent='正在加载访客统计…';status.dataset.state='';
  try{const data=await api('/api/admin-analytics?days='+range.value);if(request!==version)return;render(data);loadedDays=String(data.days);status.textContent='';}
  catch(error){if(request!==version)return;range.value=loadedDays;status.textContent=error.message+(results.hidden?'':' 下方保留上次成功加载的数据。');status.dataset.state='error';}
  finally{if(request===version){busy=false;refresh.disabled=false;range.disabled=false;panel.setAttribute('aria-busy','false');}}
 }
 range.addEventListener('change',load);refresh.addEventListener('click',load);
 return {reset,load,show(){panel.hidden=false;}};
}};
})();
