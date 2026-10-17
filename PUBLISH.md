# 第三版公开发布

## Vercel：主发布方式

使用账号已授权的 Git 连接，关联 `baichujiang/tum-rci-all-in-one` 的 main 分支。配置读取根目录 `vercel.json`，先运行核心测试、生成静态站、运行站点测试，再发布 `dist/`。

正常生产域名应无需登录。Preview 域名可能有部署保护，不能把临时绕过保护链接当作群公告中的公开网址。发布后检查首页、课程与指南深链接、资源文件、错误页面状态及匿名访问。

反馈接收端为 `api/feedback.js`，由 Vercel 单独部署；安装阶段执行 `npm ci --omit=dev`。发布前为 Production 连接独立的 Frankfurt 私有 Blob store，设置服务端 `FEEDBACK_RATE_LIMIT_SECRET`。Preview / Development 使用另一个私有 store，避免预览访问生产反馈。先在非生产环境核对实际提交回执、私有存储写入及匿名读取返回 403；生产烟测只读检查接口，不自动写入测试反馈。未配置接收端时返回 503 并保留原文。管理员页面为 `/admin/feedback/`，另需配置 `FEEDBACK_ADMIN_PASSWORD_HASH` 与 `FEEDBACK_ADMIN_SESSION_SECRET`；公开访客访问收件箱 API 应返回 401，登录后才可查看及修改状态。发布前验证实际登录、改状态、刷新保留及退出后原会话被拒绝。

`SITE_URL` 可设置为已确认的正式源站，例如 `https://实际域名`（无结尾斜杠）。未设置时使用 Vercel 提供的 `VERCEL_PROJECT_PRODUCTION_URL`。只有确认源站时才生成 canonical 与 sitemap，不能猜测域名。未知源站的本地构建不生成 sitemap。

## 本地

管理员访客统计另需在 Production 配置项目专用 `ANALYTICS_VERCEL_TOKEN` Secret，然后重新部署。不要共享到预览环境。管理员 API 必须先验证现有会话才查询 Vercel；匿名请求应返回 401。登录后检查 7 天／30 天切换、总量、趋势、热门页面和退出清空。统计查询只读，不改变原有 Web Analytics 采集。

```sh
node scripts/build_site.js
node tests/site.test.js
python3 -m http.server 8000 --directory dist
```

## GitHub Pages 备用方式

第三版需要先构建。不要再选择 main 仓库根目录直接发布旧 index.html；应通过 Pages 构建工作流发布 dist。生成项目子路径站点时设置 `BASE_PATH=/tum-rci-all-in-one` 和已确认的 `SITE_URL`。当前验证工作流只上传构建 artifact，不自动启用 Pages。

## 历史与隐私

原 v2 提交为 `7094aec8e5cf1a3218779e8823c0c7e0bb4d609c`。保留历史，不强制覆盖 main。个人计划只在当前 origin 的浏览器存储中；跨域迁移请先导出，不上传到 Git。
