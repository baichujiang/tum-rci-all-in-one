/* Stable dialog shells stay mounted while local plan records update. */
'use strict';
module.exports=function plannerView(studyHelp=''){return `
<div id="planning-controls">
 <header class="plan-page-heading">
  <div><h1>我的计划</h1><p>选好课程，按学期安排。</p></div>
  <div class="plan-primary-actions">
   <button id="plan-add-course" type="button" class="button" data-pick-semester="1" aria-haspopup="dialog">＋ 添加课程</button>
   <button type="button" class="button secondary" data-generate>自动规划</button>
   <button type="button" class="quiet plan-more-button" data-open-tools aria-haspopup="dialog">更多 <span aria-hidden="true">···</span></button>
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
 <dialog id="plan-settings-dialog" class="plan-dialog" aria-labelledby="plan-settings-title">
  <header class="plan-dialog-heading"><div><h2 id="plan-settings-title">计划设置</h2><p>基本信息只需确认一次，之后随时可改。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭计划设置">关闭</button></header>
  <p id="plan-settings-notice" class="notice" role="status" hidden></p>
  <div id="plan-settings-content" class="planning-workflow"></div>
  <footer class="plan-dialog-footer"><span class="meta">基本设置更改后自动保存</span><button type="button" class="button" data-finish-settings>完成</button></footer>
 </dialog>
 <dialog id="course-preferences-dialog" class="plan-dialog" aria-labelledby="course-preferences-title">
  <header class="plan-dialog-heading"><div><h2 id="course-preferences-title">已修与选课偏好</h2><p class="desktop-legacy">已修计入进度，想选与排除用于自动规划。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭已修与选课偏好">完成</button></header>
  <div id="course-preferences-content" class="planning-workflow"></div>
 </dialog>
 <dialog id="plan-tools-dialog" class="plan-dialog plan-tools-dialog" aria-labelledby="plan-tools-title">
  <header class="plan-dialog-heading"><div><h2 id="plan-tools-title">更多操作</h2><p>导出、迁移或继续完善你的计划。</p></div><button type="button" class="quiet" data-close-plan-dialog aria-label="关闭更多操作">关闭</button></header>
  <button type="button" class="plan-tool-row" data-backup-open><span><b>备份与恢复</b><small>保存完整记录，或迁移到另一台设备</small></span><span aria-hidden="true">→</span></button>
  <section id="plan-exports" aria-label="导出与分享"></section>
  <button type="button" class="plan-tool-row" data-open-custom><span><b>添加目录外课程</b><small>自行录入已获学校认可的选修</small></span><span aria-hidden="true">→</span></button>
  <a class="plan-tool-row" href="https://campus.tum.de/" target="_blank" rel="noopener noreferrer"><span><b>在 TUMonline 查看课表</b><small>登录后打开 Terminkalender，查看实际日期与分组</small></span><span aria-hidden="true">↗</span></a>
  <p class="meta plan-storage-note">计划和收藏保存在当前浏览器。换设备或清理浏览器前，请先导出备份。</p>
  <button type="button" class="quiet plan-clear-button" data-clear>清空计划…</button>
 </dialog>
</div>
<div id="planner"><p class="loading-state">正在读取你的课程…</p></div>
<section id="printable-plan" hidden></section>
<dialog id="auto-plan-dialog" class="auto-plan-dialog" aria-labelledby="auto-plan-title">
 <header class="plan-dialog-heading"><div><h2 id="auto-plan-title">自动方案预览</h2><p id="auto-plan-description">先查看安排，采用后才会更新计划。</p></div></header>
 <div id="auto-plan-result" aria-live="polite"></div>
 <div class="dialog-actions"><button type="button" class="quiet" data-edit-auto-settings>调整条件</button><button type="button" class="button secondary" data-cancel-auto>返回计划</button><button type="button" class="button" data-apply-auto hidden>采用这个方案</button></div>
</dialog>`;};
