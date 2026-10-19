'use strict';
module.exports=()=>`<div class="admin-heading"><p class="eyebrow">仅管理员可见</p><h1>网站管理</h1><p class="lead">查看网站访问情况与同学反馈，记录处理进展。</p></div>
<section id="admin-login" class="admin-login panel" aria-labelledby="admin-login-title" hidden>
 <h2 id="admin-login-title">管理员登录</h2><p>使用专属管理员密码登录。</p>
 <form id="admin-login-form"><label for="admin-password">管理员密码</label><input id="admin-password" type="password" autocomplete="current-password" required maxlength="256"><button class="button" type="submit" id="admin-login-button">登录</button></form>
</section>
<section id="admin-analytics" class="admin-analytics" aria-labelledby="analytics-title" hidden>
 <div class="analytics-heading"><div><p class="eyebrow">访问概览</p><h2 id="analytics-title">访客统计</h2></div><div class="analytics-controls"><label class="sr-only" for="analytics-range">统计时间范围</label><select id="analytics-range"><option value="7">近 7 天</option><option value="30">近 30 天</option></select><button type="button" class="button secondary" id="analytics-refresh">刷新统计</button></div></div>
 <p id="analytics-status" class="analytics-status" role="status" aria-live="polite"></p>
 <div id="analytics-results" hidden>
  <div class="analytics-totals"><div class="analytics-metric"><span>访客数</span><strong id="analytics-visitors">—</strong><small>所选期间内的独立访客</small></div><div class="analytics-metric"><span>页面浏览量</span><strong id="analytics-pageviews">—</strong><small>所有页面的浏览次数</small></div></div>
  <div class="analytics-chart"><h3>每日浏览量</h3><div id="analytics-trend" role="region" aria-label="每日浏览量，单位：次；日期按 UTC，可横向滚动查看" tabindex="0"></div><p id="analytics-empty" class="meta" hidden>这个时间段还没有访问记录。</p><details class="analytics-details"><summary>查看每日明细</summary><div class="analytics-table-wrap"><table><thead><tr><th scope="col">日期（UTC）</th><th scope="col">访客</th><th scope="col">浏览</th></tr></thead><tbody id="analytics-daily"></tbody></table></div></details></div>
  <div class="analytics-popular"><h3>热门页面</h3><p class="meta">按浏览量排序 · 最多显示 8 个页面</p><div class="analytics-table-wrap" id="analytics-pages-table"><table><thead><tr><th scope="col">页面</th><th scope="col">访客</th><th scope="col">浏览</th></tr></thead><tbody id="analytics-pages"></tbody></table></div><p id="analytics-no-pages" class="meta" hidden>暂无页面访问记录。</p></div>
  <p class="meta analytics-note">数据来自 Vercel Web Analytics，仅统计正式网站。日期按 UTC 划分，包含今天；访客按 Vercel 的匿名识别口径去重，每日访客数不能相加作为总访客数。数据可能延迟，刷新最多每分钟更新一次。</p><p id="analytics-updated" class="meta analytics-updated"></p>
 </div>
</section>
<section id="admin-inbox" aria-label="反馈列表" hidden>
 <h2 class="admin-inbox-title">反馈收件箱</h2>
 <div class="admin-toolbar"><label>处理状态<select id="admin-filter"><option value="all">全部反馈</option><option value="pending">待处理</option><option value="progress">处理中</option><option value="resolved">已处理</option></select></label><div class="admin-tools"><button type="button" class="button secondary" id="admin-refresh">刷新</button><button type="button" class="quiet" id="admin-logout">退出登录</button></div></div>
 <p id="admin-list-summary" class="meta"></p><div id="admin-feedback-list" class="admin-feedback-list"></div>
 <button type="button" class="button secondary" id="admin-more" hidden>加载更早的反馈</button><p class="meta admin-time-note">时间按柏林时区显示 · 登录最长保持 8 小时</p>
</section><p id="admin-status" class="admin-status" role="status" aria-live="polite" aria-atomic="true">正在检查登录状态…</p><noscript><p>网站管理需要启用 JavaScript。</p></noscript>`;
