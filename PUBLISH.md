# 第二版发布与本地阅读

## GitHub Pages

第二版仍为零构建静态站。仓库的 `index.html`、`assets/`、`content/`、`data/`、`guides/` 都要保留。

仓库 Settings → Pages → Deploy from a branch → `main` / `/(root)`。已有此配置时无需换部署方式；普通 Git 提交后由 Pages 的实际构建结果决定何时上线。本站不声称仅提交成功就代表网站部署成功。

入口预期为 `https://baichujiang.github.io/tum-rci-all-in-one/`。使用 `#/courses` 等 hash 路由，可刷新和直接分享，也可部署到仓库子路径。`.nojekyll` 已保留。

参考：[GitHub 官方发布配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 本地

运行 `python3 -m http.server 8000` 后打开 `http://localhost:8000`。直接双击在线版 `index.html` 可能因 file:// 跨文件读取限制无法加载。

离线：运行 `python3 scripts/build_offline.py`，再双击 `offline.html`。`offline.html` 和 `assets/offline-data.js` 只由源文件生成，不提交到 Git；发布包可以附带这两个文件。数据更新后重建。

## 回退与数据

v1 基线提交：`19bbbddbe3a8624ead05fa5c3db388ce22366065`。回退使用新的 revert 提交，避免强制覆盖 main 历史。

备份自己的学分计划再清理浏览器。换域名、端口、协议或设备后 localStorage 不共享。不要为了“同步”把个人计划上传到公开仓库。
