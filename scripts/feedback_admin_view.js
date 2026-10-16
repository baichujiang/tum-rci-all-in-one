'use strict';
module.exports=()=>`<div class="admin-heading"><p class="eyebrow">仅管理员可见</p><h1>反馈收件箱</h1><p class="lead">查看同学的反馈，记录处理进展。</p></div>
<section id="admin-login" class="admin-login panel" aria-labelledby="admin-login-title" hidden>
 <h2 id="admin-login-title">管理员登录</h2><p>使用专属管理员密码登录。</p>
 <form id="admin-login-form"><label for="admin-password">管理员密码</label><input id="admin-password" type="password" autocomplete="current-password" required maxlength="256"><button class="button" type="submit" id="admin-login-button">登录</button></form>
</section>
<section id="admin-inbox" aria-label="反馈列表" hidden>
 <div class="admin-toolbar"><label>处理状态<select id="admin-filter"><option value="all">全部反馈</option><option value="pending">待处理</option><option value="progress">处理中</option><option value="resolved">已处理</option></select></label><div class="admin-tools"><button type="button" class="button secondary" id="admin-refresh">刷新</button><button type="button" class="quiet" id="admin-logout">退出登录</button></div></div>
 <p id="admin-list-summary" class="meta"></p><div id="admin-feedback-list" class="admin-feedback-list"></div>
 <button type="button" class="button secondary" id="admin-more" hidden>加载更早的反馈</button><p class="meta admin-time-note">时间按柏林时区显示 · 登录最长保持 8 小时</p>
</section><p id="admin-status" class="admin-status" role="status" aria-live="polite" aria-atomic="true">正在检查登录状态…</p><noscript><p>反馈管理需要启用 JavaScript。</p></noscript>`;
