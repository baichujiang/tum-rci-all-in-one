# TUM RCI All-in-One

## [打开学生网站 → tum-rci-all-in-one.vercel.app](https://tum-rci-all-in-one.vercel.app/)

给 TUM RCI 同学的中文日常入口。独立学生社群项目，不隶属于 TUM。

## 第一版，只做好两件事

**常用网站入口**：打开首页就能找到 TUMonline、Moodle、Matching、TUM Live 等平台。每个入口写清用途，点击卡片直接打开；按「上课与选课」「图书馆与校园」「科研与协作」「咨询与支持」直接分区展示，支持用途搜索。已收藏的网站卡片直接展示在首页顶部，点击即可打开；下方继续按模块展示全部网站。

图书馆入口直达 OPAC 检索和 anny 预约登录；预约支持自习座位、小组讨论室与视频间。eAccess 用于校外读取已许可电子文献，dokumenTUM 提供馆藏纸本文献扫描申请步骤。首页另有论文题目平台、MATLAB 校园许可、TUM ShareLaTeX、LRZ GitLab、Sync+Share 和 GigaMove，卡片注明用途与登录条件，来源台账记录公开核对范围。

另收录 MPIC 学生会课程评价查询、考试专用 Moodle、CIT 打印与扫描说明、英语写作辅导预约、Academic Coaching、文献管理校园许可、图书馆文献咨询和 ProLehre 学习方法。图书馆预约也注明主校区 Presentation Lab 的演讲练习用途；需要个人登录或申请的服务，只核对公开入口，不转载个人结果。

**如何选课、如何规划学分**：先看懂学分结构，再找到课程，以横向学期看板分配课程，随时看每学期学分与整体缺口。支持四、五学期等不同节奏，选择起始冬夏季节，按目录季节检查安排。课程以目录原名显示，中文译名辅助理解，模块代码用于核对；类别保留分组字母与原名。实验课、研讨课和考试登记的办理路径分开说明。

首版 Goal：**让学生一打开就知道在哪里点，点完知道下一步做什么，能顺畅地找到常用网站并完成自己的选课与学分规划。** 验收以入口清晰和实际操作顺畅为准，功能或资料数量不作为产品完成标准。

[常用网站](https://tum-rci-all-in-one.vercel.app/) · [选课指南](https://tum-rci-all-in-one.vercel.app/study/) · [选课程](https://tum-rci-all-in-one.vercel.app/courses/) · [我的计划](https://tum-rci-all-in-one.vercel.app/planner/)

手机端有固定的常用网站、选课指南、我的计划入口。加入课程后按钮和学分同步更新；二选一课程可以确认改选，移除课程可以撤销。

个人计划和收藏自动保存在当前浏览器，无需登录。首页收藏区与「我的计划」中的「备份与迁移」可导出包含课程、学期安排、批次、补修设置和收藏的 JSON 文件，换设备后导入即可继续。导入先显示预览，默认合并并保留当前课程的安排与状态，也可选择替换。每次导入前保留一份本地恢复备份，最近 3 次记录可预览恢复。旧版计划文件仍可使用，不改变当前收藏；旧计划缺少的学期安排放在「待分配」。

网站区旁的「缺少入口？」、桌面页头和全站页脚可进入快速反馈。先选择缺少入口、功能建议或使用问题，再填写简短描述；反馈预填到 GitHub Issues，由学生确认提交，需要 GitHub 账号。

已有申请、科研、生活等资料保留在次级页面与更多资料中。后续按实际需求逐步完善。

## 首版验收路径

- 打开首页，能看懂常用平台的用途，一次点击进入原始网站。
- 收藏一个网站，立即看见它出现在首页顶部，点击卡片直接打开；原有收藏保留，取消收藏可以撤销。搜索无结果时能清除搜索继续使用。
- 从选课指南理解学分结构，进入课程目录，按课程名或代码找到课程。
- 选择四或五学期与起始冬夏季节，每学期一列，课程向下排列；卡片默认只显示名称和学分，拖动或点开课程选择目标学期，选完自动收起，支持撤销。标题和学分在滚动时持续可见，手机左右滑动查看其他学期、点课程调整。目录季节不符时先确认。
- 点学期卡片上的「添加课程」，直接打开选课面板。默认展示对应季节，可连续加入多门，学分即时更新；已有课程可直接移到本学期，也可撤销。缩短规划会保留超出范围的课程。
- 只做选课与学期规划：每门课只需确定安排学期，查看整体学分缺口，继续选择需要的课程。
- 手机端入口持续可见，操作不被浮栏遮挡；刷新后已有计划仍可继续。

## 维护与构建

```sh
node tests/core.test.js
node tests/interactions.test.js
node tests/backup.test.js
node tests/backup-ui.test.js
node tests/favorites.test.js
node tests/search.test.js
node tests/routes.test.js
node tests/portals.test.js
node tests/checklist.test.js
node tests/build.test.js
node scripts/build_site.js
node tests/site.test.js
python3 scripts/validate_repo.py
python3 tests/links.test.py
python3 -m http.server 8000 --directory dist
```

打开 `http://localhost:8000`。构建不需要第三方依赖，发布目录是 `dist`。正式网站由 Vercel 从本仓库 main 构建发布。GitHub 用于维护；学生使用固定网站入口。

| 路径 | 用途 |
|---|---|
| `content/navigation.json` | 常用网站展示、问答、检索同义词与合并资源的显示记录 |
| `content/editorial.json` | 中文参考名称、解释与来源元数据 |
| `data/*.csv` | 原始事实目录 |
| `scripts/student_views.js` | 首页与选课指南 |
| `scripts/build_site.js` | 生成静态正文、索引与页面 |
| `site3/` | 界面、常用网站交互、课程检索和学分计划 |
| `assets/core.js` | 学分计算与计划输入校验 |
| `tests/` | 核心逻辑、构建与匿名线上检查 |

## 来源与个人数据

课程和补修模型沿用 2025 修订快照，完整 PDF 及独立人工审核仍待完成。目录学期不是实时排课，历史课题不是当前空位；个人适用规则、选课、考试和认定请核对学校原文及个人记录。

个人计划与收藏只在当前浏览器保存，换设备或更换域名不会自动迁移。清理浏览器数据也会删除本地记录和恢复备份，请提前导出文件。备份文件不会上传到服务器，不要将其或成绩单、证件、群聊提交到公开仓库。记录无法读取时可导出原始记录留作修复副本；原始副本不直接用于常规导入。

浏览器无法保存时，修改仅在当前页面保留，仍可导出完整备份。请先导出再刷新重试，核对当前数据后按需合并导入；存储恢复可写不会自动把旧临时状态覆盖到其他页面的新记录上。

详见 [CONTENT_POLICY.md](CONTENT_POLICY.md)、[PUBLISH.md](PUBLISH.md) 和 [RELEASE_V3.md](RELEASE_V3.md)。
