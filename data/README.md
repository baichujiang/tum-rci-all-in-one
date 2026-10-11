# 数据集列说明

- `resources.csv`：所有条目 `id,category,title,url,publisher,source_status,access,update_frequency,review_date,description_cn`。
  - `source_status=官方页面已查阅` 只说明人工浏览了关联官网，不等于 URL 已逐项 HTTP 2xx 探测。
  - `source_status=官网入口待再核实`、`官方主页待核实` 等：建议运行脚本检查和点击浏览。
  - 有些网址为校内认证平台，未经登录不应判为死链。
- `courses_legal_2025.csv`：来自 TUM **2025-02-11 FPSO Amendment Annex 1** 的 35条课程清单，2025/26冬季及之后入学适用。法定课程名字与实际当期授课名字可能不同，不宜用CSV替代TUMonline。
- `topics_ws2026_27.csv`：相关 58 条 CIT剩余主题快照，非完整列表、非实时座位。`course_type` 是 Seminar 5或Practical 10 ECTS。
- `events_deadlines.csv`：单次日期快照；不提供时区推算或自动通知，时间以Europe/Berlin当地为准。

所有表格用 UTF-8 with BOM 编码，Excel 导入中文时通常不会乱码。对应 `json` 无 BOM，供程序处理。
