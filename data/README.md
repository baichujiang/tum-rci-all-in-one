# 数据集列说明

- `resources.csv`：所有条目 `id,category,title,url,publisher,source_status,access,update_frequency,review_date,description_cn`。
  - `source_status=官方页面已查阅` 是 v1 的来源对照记录，不证明已完成独立人工审核，也不等于 URL 已逐项 HTTP 2xx 探测。
  - `source_status=官网入口待再核实`、`官方主页待核实` 等：建议运行脚本检查和点击浏览。
  - 有些网址为校内认证平台，未经登录不应判为死链。
- `courses_legal_2025.csv`：来自 TUM **2025-02-11 FPSO Amendment Annex 1** 的 35条课程清单，v1 记录为 2025/26 冬季起适用；原PDF已于2026-10-13对照，并于2026-10-14重新验证；独立人工审核仍待完成。须核对个人适用批次与后续修订。法定课程名字与实际当期授课名字可能不同，不宜用CSV替代TUMonline。
- `topics_ws2026_27.csv`：相关 58 条 CIT剩余主题快照，非完整列表、非实时座位。`course_type` 是 Seminar 5或Practical 10 ECTS。
- `events_deadlines.csv`：单次日期快照；不提供时区推算或自动通知，时间以Europe/Berlin当地为准。

所有表格用 UTF-8 with BOM 编码，Excel 导入中文时通常不会乱码。对应 `json` 无 BOM，供程序处理。

## 第二版数据源说明

在线网站只把 CSV 作为原有事实目录来源，另读取 `content/editorial.json` 的原创中文解释与审核元数据。这里的 `resources.json`、`courses_legal_2025.json` 是 v1 导出，不参与 v2 页面渲染；修改 CSV 不会自动改写这些历史导出。

来源指纹属于机器状态，保存在 Actions 缓存与报告，不写进事实目录，也不自动刷新核实日期。学分规划的个人数据不得存入此公开目录。

## 当前课程与规则模型

- `courses_current_2026.json`：140个扩展选修，来源为官方20241课程树、2026/27学年的模块手册；元数据核对与当期报名资格分开。
- `course-overrides.json`：当前分类／周期与待复核状态的版本化覆盖，保留2025法定CSV原值。IN2060可选G或I，IN2346使用已核对的冬夏周期；四个当期目录状态待复核的附件选修暂不自动推荐。
- `teaching-offerings.json`：16个模块的对应学期开课和语言证据，无课时记录；不承诺报名名额或实际课表。
- `rci-rules.json`：规则来源、批次、学分结构和未建模的个人条件。主要数值已对照，不等于全部资格均已实现。
- `catalog-audit.json`：全14页2026/27官方树的计数／覆盖范围。固定学分口径为586条分类记录／581个模块；包括CLA31307后为587条分类／582个真实模块。153个专业选修与429个J真实模块不等于每个人均可选。

构建合并35个法定模块、原140个扩展模块及429个J来源记录（覆盖9个原有记录，净新增420个），总595个。当前J固定学分目录428个完整收录，另保留1个目录学分缺失模块。历史导出JSON仍保持原版本；完整目录覆盖不代表已核实每个人的选课资格。详细核对证据与重现笔记由本次审计附件保留。

- `official-interdisciplinary-memberships.json`：当期J全429个真实模块及7个排除的认定占位；保留多分支、原目录ECTS和公开节点链接。
- `interdisciplinary-verification.json`：429门完整模块DTO指纹、当前学年选择、逐字段状态、资格／计入限制、无法核实原因。学分缺失不填零，冲突不强行择一。
- `interdisciplinary-review-decisions.json`：45门有条件规划候选的完整德英来源复核决定，与SHA256绑定；不是个人录取／名额或毕业认可批准。
- `j-rules.json`：J最低6、语言最多6、语言资格、27组WTG同名版本及5组保守重叠边界、已通过课程的有方向排斥、官方政策来源。个人母语、分班、既往计分和学校决定不由系统猜测。
