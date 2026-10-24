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

个人候选清单只保存在浏览器计划中：v7 的模块记录使用 `topics` 数组，保存 ID、标题、来源学期和来源链接。v6 单选 `topic` 读取时迁移成数组；候选不新增计分课程，也不代表匹配结果。

- `course-topics.json`：2026-10-23 从 CIT 的 2026/27 冬季官方余位名单提取明确标注 IN2106／IN2107 的 146 个课题（72 个 Praktikum、74 个 Seminar），保留原文标题、模块映射、来源学期、来源锚点及完整源页面 SHA256；不是完整开课目录，不承诺实时余位，不包含官方未提供的详细内容或个人报名状态。稳定 ID 由模块、来源学期和标题指纹组成。历史 `topics_ws2026_27.csv` 保持原有快照。
- 重建课题库：先保存官方公开页面，再执行 `python3 scripts/import_course_topics.py --source-file <保存的HTML> --term 2026W --checked-on 2026-10-23 --output data/course-topics.json`。脚本核对来源页的学期，只接收明确映射模块的条目；页面结构或学期变化需重新核对，不能仅修改日期。构建阶段再次核验来源、ID、模块和重复项。
- `course-topic-details.json`：146 个余位课题与当期 TUMonline 独立课程一一匹配后的教师、机构、授课语言、课程编号及字段证据哈希；不保存官方全文、个人账户标识或会议访问资料。名称忽略模块代码括号和标点差异，明确兼容 Master / Master's，必须同时核对模块和 2026W 学期。它不是新的计分课程库。
- `content/course-topic-summaries.json` v2：逐课题原创中文概览和七个分项。142 个有内容概览、133 个有任务、98 个有目标、122 个有参加要求、126 个有开展方式、26 个有考核信息。各项绑定 TUMonline 字段或已验证的 `website:` 来源，官网响应哈希另存 `websiteSourceHashes`；缺项使用 null，不从通用模块、外校同名课或往年安排推导当前要求。独立人工复核仍为 pending。
- `course-topic-website-evidence.json`：对原先 10 个缺介绍、3 个有冲突的课程再查当期官网的结果。6 门补齐独立介绍，4 门仍无公开详情；原有 3 处冲突与新发现的 2 处细则差异显式保留。只保存课程身份、学期、官方 URL、响应哈希及原创核查说明，不保存网站原文或学生名单。构建校验身份、学期、官方域名和编辑内容所绑定哈希，并在页面底部显示补充来源。
- 课题详情维护：从公开 TUMonline 课程检索导出当期的课题名称及链接 JSON，再用 `python3 scripts/research_course_topics.py --links <链接JSON> --evidence <忽略的证据目录>` 读取公开独立课程资料。审阅原文并整理中文后，运行 `python3 scripts/import_course_topic_details.py --evidence <证据目录> --checked-on <实际核对日期>` 生成元数据。仅有匹配结束后的余位申请说明作为通用流程；不把早期预报名截止日期当作当前可申请期限。

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
