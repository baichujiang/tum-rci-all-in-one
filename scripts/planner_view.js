/* Stable dialog shells stay mounted while local plan records update. */
'use strict';
module.exports=function plannerView(studyHelp=''){return `
<div id="planning-controls">
 <header class="plan-page-heading">
  <div><h1>我的计划</h1><p>选好课程，按学期安排。</p></div>
  <div class="plan-primary-actions">
   <button id="plan-add-course" type="button" class="button plan-action-button plan-add-button" data-pick-semester="1" aria-haspopup="dialog" aria-controls="course-picker"><svg class="plan-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg><span>添加课程</span></button>
   <button type="button" class="button secondary plan-action-button plan-auto-button" data-generate aria-haspopup="dialog" aria-controls="auto-plan-dialog"><svg class="plan-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/><path d="M14 7h3a3 3 0 0 1 3 3v1M10 17H7a3 3 0 0 1-3-3v-1"/></svg><span>自动规划</span></button>
   <button type="button" class="button secondary plan-action-button plan-more-button" data-open-tools aria-haspopup="dialog" aria-controls="plan-tools-dialog"><svg class="plan-action-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg><span>更多</span></button>
  </div>
 </header>
 <div id="plan-context" class="plan-context"><p class="loading-state">正在读取计划…</p></div>
 <dialog id="plan-study-dialog" class="plan-dialog plan-study-dialog" aria-labelledby="plan-study-title">
  <header class="plan-dialog-heading"><h2 id="plan-study-title">选课与学分说明</h2><button type="button" class="quiet" data-close-study aria-label="关闭选课与学分说明">关闭</button></header>
  ${studyHelp}
 </dialog>
 <dialog id="credit-check-dialog" class="plan-dialog credit-check-dialog" aria-labelledby="credit-check-title" aria-describedby="credit-check-description">
  <header class="plan-dialog-heading"><div><h2 id="credit-check-title">学分检查</h2><p id="credit-check-description">按当前计划计算，包含待修和已通过课程。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭学分检查">关闭</button></header>
  <div id="credit-check-content"></div>
 </dialog>
 <dialog id="plan-settings-dialog" class="plan-dialog" aria-labelledby="plan-settings-title" aria-describedby="plan-settings-description">
  <header class="plan-dialog-heading"><div><h2 id="plan-settings-title">计划设置</h2><p id="plan-settings-description">调整学期节奏和每学期负担。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭计划设置">关闭</button></header>
  <p id="plan-settings-notice" class="notice" role="status" hidden></p>
  <div id="plan-settings-error" class="notice settings-error" role="alert" hidden><p id="plan-settings-error-message"></p><button id="plan-settings-reload" type="button" class="quiet" data-reload-settings hidden>载入已保存设置</button></div>
  <div id="plan-settings-content" class="planning-workflow"></div>
  <footer class="plan-dialog-footer"><p id="plan-settings-save-state" class="meta settings-save-note" role="status">所有设置统一在点击保存后生效。</p><button type="button" class="button" data-finish-settings>保存设置</button></footer>
 </dialog>
 <dialog id="planning-rules-dialog" class="plan-dialog" aria-labelledby="planning-rules-title">
  <header class="plan-dialog-heading"><h2 id="planning-rules-title">规划说明</h2><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭规划说明">返回设置</button></header>
  <div id="planning-rules-content" class="planning-workflow"></div>
 </dialog>
 <dialog id="course-preferences-dialog" class="plan-dialog" aria-labelledby="course-preferences-title">
  <header class="plan-dialog-heading"><div><h2 id="course-preferences-title">已修与选课偏好</h2><p class="desktop-legacy">已修计入进度，想选与排除用于自动规划。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭已修与选课偏好">完成</button></header>
  <div id="course-preferences-content" class="planning-workflow"></div>
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
<dialog id="auto-plan-dialog" class="auto-plan-dialog" aria-labelledby="auto-plan-title" aria-describedby="auto-plan-description">
 <header class="plan-dialog-heading"><div><h2 id="auto-plan-title">自动方案预览</h2><p id="auto-plan-description">先查看安排，采用后才会更新计划。</p></div><button type="button" class="quiet auto-preview-close" data-cancel-auto aria-label="关闭方案预览" title="关闭方案预览"><span aria-hidden="true">×</span></button></header>
 <div id="auto-plan-result" aria-live="polite"></div>
 <footer class="dialog-actions"><button type="button" class="button secondary" data-edit-auto-settings>返回调整条件</button><button type="button" class="button" data-apply-auto hidden>采用方案</button></footer>
</dialog>`;};
