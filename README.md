# TUM RCI All-in-One · 学生办事与知识导航

## [打开学生网站 → tum-rci-all-in-one.vercel.app](https://tum-rci-all-in-one.vercel.app/)

一个面向同名学生社群的中文优先网站：**搜索问题 → 查看答案 → 到官方入口办理**。独立学生项目，不隶属于 TUM。

学生直接使用上面的固定网址，不需要注册或下载资料包。GitHub 仅供维护。

## 从这里开始

[搜索整个知识库](https://tum-rci-all-in-one.vercel.app/search/) · [查课程](https://tum-rci-all-in-one.vercel.app/courses/) · [实验课怎么选](https://tum-rci-all-in-one.vercel.app/guides/matching/) · [考试报名](https://tum-rci-all-in-one.vercel.app/guides/exams/) · [我的学分计划](https://tum-rci-all-in-one.vercel.app/planner/)

首页提供六类任务：申请与入学、选课与学分、考试与办事、论文与科研、学习资料与工具、生活与就业。也可以直接搜索中文问题、原名、缩写或课程代码。Moodle、TUMonline 和原始资料直接打开；需要解释的问题进入独立中文答案页。

正式网站由 Vercel 从本仓库 main 构建发布。正式环境公开，预览环境保留登录保护；不要用临时预览网址代替群公告中的固定入口。

## 第三版内容

15 个主要问答、35 门课程独立页面、六类任务、125 条保留资源（按链接合并后 120 个入口）、58 条历史课题，共 229 条搜索记录。原有 9 篇长指南保留为对应主题的补充阅读，不要求学生选择资料版本。

学分计划、收藏和材料勾选保存在当前浏览器；沿用 v2 计划格式，可自行导入导出。更换网址或设备不会自动迁移，不要将个人计划上传到公开仓库。

## 维护与构建

```sh
node tests/core.test.js
node scripts/build_site.js
node tests/site.test.js
python3 -m http.server 8000 --directory dist
```

浏览器打开 `http://localhost:8000`。构建不需要第三方依赖。**第三版发布目录是 dist，不是仓库根目录的旧 index.html。** 旧文件保留用于历史参考和 v2 离线生成，不作为新站入口。

| 路径 | 用途 |
|---|---|
| `content/navigation.json` | 六类任务、主要问答、检索同义词、新增来源范围 |
| `content/editorial.json` | 保留课程中文参考名、旧解读与来源元数据 |
| `data/*.csv` | 原始事实目录；旧 JSON 不作为独立维护源 |
| `guides/*.md` | 历史长指南，生成补充阅读 |
| `scripts/build_site.js` | 生成静态正文、搜索索引与单页网址 |
| `site3/` | 响应式界面、本地搜索、收藏和计划交互 |
| `assets/core.js` | 经过测试的 v2 学分与输入校验逻辑 |
| `tests/site.test.js` | 检索排序、静态页面、安全边界与站内路径检查 |
| `tests/public_smoke.py` | 正式站匿名 HTTP 状态与内容检查，不使用凭证或绕过链接 |
| `vercel.json` | 构建并发布 dist 的配置 |

## 可靠性边界

界面升级不是事实全面重审。课程和补修模型仍基于 2025 修订快照，完整修订 PDF 待再次逐条核实；课题不是实时空位。新增考试页面对照了 CIT Informatics 的公开报名说明，未读取个人考试记录。AI 辅助对照与独立人工审核分开标记，人工审核待完成。

20 项原核心测试、39 项检索和站点检查在本地及生产构建中通过。另完成模拟网络与存储的浏览器组件检查；这些不冒充线上浏览器端到端或真实学生可用性测试。匿名 HTTP 检查单独运行，结果见 Actions 的 `Anonymous public website checks` 与报告 artifact。

本项目不转载官方全文、受限课件、群聊、成绩单或身份材料。来源与隐私详见 [CONTENT_POLICY.md](CONTENT_POLICY.md)。版本说明见 [RELEASE_V3.md](RELEASE_V3.md)，发布方式见 [PUBLISH.md](PUBLISH.md)。
