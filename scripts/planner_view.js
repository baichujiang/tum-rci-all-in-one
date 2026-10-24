/* Stable dialog shells stay mounted while local plan records update. */
'use strict';
module.exports=function plannerView(studyHelp=''){return `
<div id="planning-controls">
 <header class="plan-page-heading">
  <div><h1>我的计划</h1><p>选好课程，按学期安排。</p></div>
  <div class="plan-heading-tools"><div class="plan-primary-actions">
   <button id="plan-add-course" type="button" class="button secondary plan-action-button plan-add-button" data-pick-semester="1" aria-haspopup="dialog" aria-controls="course-picker"><svg class="plan-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg><span>添加课程</span></button>
   <div class="plan-auto-actions" role="group" aria-label="一键规划与可选条件"><button id="plan-quick-button" type="button" class="button plan-action-button plan-auto-button" data-generate aria-describedby="plan-quick-help"><svg class="plan-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/><path d="M14 7h3a3 3 0 0 1 3 3v1M10 17H7a3 3 0 0 1-3-3v-1"/></svg><span id="plan-quick-label">一键规划</span></button><button id="plan-conditions-button" type="button" class="button plan-condition-button" data-open-auto-conditions aria-label="调整规划条件" title="调整规划条件（可选）" aria-haspopup="dialog" aria-controls="auto-conditions-dialog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></svg></button></div>
   <button type="button" class="button secondary plan-action-button plan-more-button" data-open-tools aria-haspopup="dialog" aria-controls="plan-tools-dialog"><svg class="plan-action-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg><span>更多</span></button>
  </div><p id="plan-quick-help" class="plan-quick-help sr-only">按当前条件生成并更新看板，可撤销。</p></div>
 </header>
 <div class="plan-context-row"><div class="plan-context-details"><div id="plan-context" class="plan-context"><p class="loading-state">正在读取计划…</p></div><span id="plan-save-state" class="plan-save-state" role="status">正在读取保存状态…</span></div><button type="button" class="plan-context-button plan-study-entry" data-open-study aria-haspopup="dialog" aria-controls="plan-study-dialog"><svg class="plan-context-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/><path d="M12 6v14"/></svg><span>帮助说明</span><span class="plan-context-chevron" aria-hidden="true">›</span></button></div>
 <section id="plan-quick-result" class="plan-quick-result" aria-live="polite" hidden></section>
 <dialog id="plan-study-dialog" class="plan-dialog plan-study-dialog" aria-labelledby="plan-study-title">
  <header class="plan-dialog-heading"><h2 id="plan-study-title">学分与规划说明</h2><button type="button" class="quiet" data-close-study aria-label="关闭帮助说明">关闭</button></header>
  ${studyHelp}
 </dialog>
 <dialog id="credit-check-dialog" class="plan-dialog credit-check-dialog" aria-labelledby="credit-check-title" aria-describedby="credit-check-description">
  <header class="plan-dialog-heading"><div><h2 id="credit-check-title">学分检查</h2><p id="credit-check-description">按当前计划计算，包含待修和已通过课程。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭学分检查">关闭</button></header>
  <div id="credit-check-content"></div>
 </dialog>
 <dialog id="plan-settings-dialog" class="plan-dialog" aria-labelledby="plan-settings-title" aria-describedby="plan-settings-description">
  <header class="plan-dialog-heading"><div><h2 id="plan-settings-title">补充学业信息</h2><p id="plan-settings-description">确认一次，之后即可直接一键规划。</p></div><button id="plan-settings-close" type="button" class="quiet" data-close-plan-dialog aria-label="关闭自动规划">关闭</button></header>
  <p id="plan-settings-notice" class="notice" role="status" hidden></p>
  <div id="plan-settings-error" class="notice settings-error" role="alert" hidden><p id="plan-settings-error-message"></p><button id="plan-settings-reload" type="button" class="quiet" data-reload-settings hidden>载入已保存设置</button></div>
  <div id="plan-settings-content" class="planning-workflow"></div>
  <footer class="plan-dialog-footer"><p id="plan-settings-save-state" class="meta settings-save-note" role="status">入学与补修要求请按录取通知填写。</p><div class="plan-footer-actions"><button id="plan-settings-cancel" type="button" class="button secondary" data-close-plan-dialog>取消</button><button type="button" class="button" data-finish-settings>开始规划</button></div></footer>
 </dialog>
 <dialog id="auto-conditions-dialog" class="plan-dialog auto-conditions-dialog" aria-labelledby="auto-conditions-title" aria-describedby="auto-conditions-description">
  <header class="plan-dialog-heading"><div><h2 id="auto-conditions-title">规划条件</h2><p id="auto-conditions-description">可选设置，未调整时沿用当前条件。</p></div><button type="button" class="quiet" data-close-auto-conditions aria-label="关闭自动规划">关闭</button></header>
  <div id="auto-conditions-error" class="notice" role="alert" hidden></div>
  <div id="auto-conditions-content" class="planning-workflow"></div>
  <footer class="plan-dialog-footer"><p class="meta">规划成功后更新看板，可撤销。</p><div class="plan-footer-actions"><button type="button" class="button secondary" data-close-auto-conditions>取消</button><button type="button" class="button" data-run-auto>一键规划</button></div></footer>
 </dialog>
 <dialog id="plan-tools-dialog" class="plan-dialog plan-tools-dialog" aria-labelledby="plan-tools-title">
  <header class="plan-dialog-heading"><div><h2 id="plan-tools-title">更多操作</h2><p>导出、迁移或继续完善你的计划。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭更多操作">关闭</button></header>
  <div class="plan-tools-content">
  <button type="button" class="plan-tool-row" data-backup-open><span><b>备份与恢复</b><small>保存完整记录，或迁移到另一台设备</small></span><span aria-hidden="true">→</span></button>
  <section id="plan-exports" aria-label="导出与分享"></section>
  <button type="button" class="plan-tool-row" data-open-custom><span><b>添加目录外课程</b><small>自行录入已获学校认可的选修</small></span><span aria-hidden="true">→</span></button>
  <a class="plan-tool-row" href="https://campus.tum.de/" target="_blank" rel="noopener noreferrer"><span><b>在 TUMonline 查看课表</b><small>登录后打开 Terminkalender，查看实际日期与分组</small></span><span aria-hidden="true">↗</span></a>
  <p class="meta plan-storage-note">计划和收藏保存在当前浏览器。换设备或清理浏览器前，请先导出备份。</p>
  </div>
  <footer class="plan-tools-footer" data-clear-area>
   <button type="button" class="plan-clear-button" data-clear aria-describedby="plan-clear-description">清空计划…</button>
   <p id="plan-clear-description">包括已修记录和计划设置，清空前会再次确认。</p>
  </footer>
 </dialog>
</div>
<div id="planner"><p class="loading-state">正在读取你的课程…</p></div>
<section id="printable-plan" hidden></section>
<dialog id="planning-error-dialog" class="plan-dialog planning-error-dialog" aria-labelledby="planning-error-title" aria-describedby="planning-error-description">
 <header class="plan-dialog-heading"><div><h2 id="planning-error-title">规划未完成</h2><p id="planning-error-description">当前课程安排已保留。</p></div><button type="button" class="quiet" data-close-planning-error aria-label="关闭规划说明">关闭</button></header>
 <div id="planning-error-content"></div>
 <footer class="plan-dialog-footer"><button type="button" class="button" data-edit-auto-settings>调整条件</button></footer>
</dialog>`;};
