/* One maintained announcement, readable without JavaScript. */
'use strict';
module.exports=function siteUpdatesView(update,{e,url}){
 if(!update||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(update.id||'')||!['draft','published'].includes(update.status))throw new Error('Invalid site update identity or status');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(update.date||'')||!Number.isFinite(Date.parse(update.date))||new Date(update.date).toISOString().slice(0,10)!==update.date)throw new Error('Invalid site update date');
 if(typeof update.summary!=='string'||!update.summary.trim()||!Array.isArray(update.changes)||!update.changes.length||update.changes.length>4)throw new Error('Site update needs a summary and 1–4 changes');
 for(const change of update.changes){
  if(!['title','text','label'].every(key=>typeof change[key]==='string'&&change[key].trim())||!/^\/(?:[a-zA-Z0-9_-]+\/)+$/.test(change.href||''))throw new Error('Invalid site update change');
 }
 const date=update.date.split('-'),status=update.status==='draft'?'待发布':'更新';
 return `<section id="site-updates" class="site-update" aria-label="网站更新" data-site-update="${e(update.id+':'+update.status)}">
  <details class="site-update-details" id="site-update-details">
   <summary class="site-update-summary"><span class="site-update-meta"><span class="site-update-badge">${status}</span><time datetime="${e(update.date)}">${Number(date[1])}月${Number(date[2])}日</time></span><span class="site-update-title">${e(update.summary)}</span><span class="site-update-toggle" aria-hidden="true"><span class="site-update-more">查看变化</span><span class="site-update-less">收起详情</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg></span></summary>
   <div class="site-update-body">${update.status==='draft'?'<p class="site-update-note">本地预览 · 以下变化尚未发布</p>':''}<ul>${update.changes.map(change=>`<li><b>${e(change.title)}</b><p>${e(change.text)}</p><a class="text-link" href="${e(url(change.href))}">${e(change.label)} <span aria-hidden="true">→</span></a></li>`).join('')}</ul></div>
  </details>
  <button type="button" class="quiet icon-button site-update-dismiss" data-site-update-dismiss aria-label="关闭本次更新通知" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
 </section>`;
};
