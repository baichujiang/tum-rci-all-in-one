# TUM RCI All-in-One · 第二版

**为同名学生社群打造的中文优先、来源可追溯的 TUM RCI 知识平台。** 独立学生项目，不隶属于 TUM。

第二版整理日期：2026-10-11。平台升级不是“所有信息已经重新核实”。

## 打开平台

GitHub Pages 启用后：**https://baichujiang.github.io/tum-rci-all-in-one/**。

本地运行（Python 3，无第三方依赖）：

```sh
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`。不需要 Node 构建、账号、数据库或 API key。

离线使用：运行 `python3 scripts/build_offline.py` 后双击生成的 `offline.html`。生成文件只是快照，修改源数据后要重新运行；在线网站直接读取 CSV／JSON，不维护内嵌数据副本。

## 第二版功能

| 模块 | 内容 |
|---|---|
| 课程百科 | 35 门模块的中文参考名＋官方原名、分类筛选、目录学期、详情来源、加入计划 |
| 学分规划 | 计划／自报已通过分开，Robotics 二选一保护，G/H/I 最低要求，栏目封顶，条件补修情景，自定义待认定选修，JSON 导入导出 |
| 中文指南 | 7 篇新版重点解读＋9 篇 v1 长篇指南的站内排版 |
| 申请与入学 | 常规申请窗口、条件要求说明、本地核对清单 |
| 科研资源 | 15 条原有科研类入口、58 条 WiSe 2026/27 课题快照；不代表实时空位 |
| 全部资源 | 125 条原始资源、分类／关键词／收藏筛选、来源入口 |
| 来源台账 | 核对范围、日期、AI 辅助检查与人工待审分开记录 |
| 维护 | 数据校验、逻辑测试、按白名单低频检测来源变化、只生成审核报告 |

## 信息可靠性

本次重新对照了 **4 个官方网页的指定范围**：课程规划、申请说明、Matching、网站使用条款。所有源记录目前仍标注人工审核待完成。2025 FPSO 修订 PDF 本次未能读取：35 行课程目录及条件补修情景沿用 v1，必须再核对个人适用版本。旧资源与课题不因界面升级变成实时数据。

规划器只提供 2025 修订快照情景。可选择 2025/26 冬、2026 夏、2026/27 冬入学；选择批次不证明模型适用于你。其他／未知批次不作达成判断。工具不是毕业审核，也不是报名系统。

## 单一数据来源

```text
index.html                 网站入口，GitHub Pages 可直接发布
assets/app.js              界面与本地交互
assets/core.js             CSV、学分计算、输入校验、转义 Markdown
assets/style.css           手机与桌面布局，无外部字体
content/editorial.json     中文参考名、解读、来源元数据、旧指南导航
data/*.csv                 事实目录，保留 v1 原文件
guides/*.md                v1 中文指南
scripts/check_sources.py   只保存指纹与审核报告，不转载网页
scripts/build_offline.py   可选离线快照生成器
tests/core.test.js         学分与安全边界测试
CONTENT_POLICY.md         内容、来源与隐私政策
```

旧 `data/*.json` 与 `ALL_RESOURCES.md` 为 v1 导出，不是第二版网页的数据源；编辑 CSV 后不要把这些旧导出当成自动同步版本。

## 维护和测试

```sh
python3 scripts/validate_repo.py
node tests/core.test.js
node --check assets/app.js
python3 scripts/build_offline.py
```

来源工作流在相关文件推送、手动运行或每周一 07:00 UTC 检查 4 个允许监测的公开来源。首次建立机器基线，后续比较上一次成功抓取；缓存丢失时重新建基线。报告不自动更新网页、翻译或人工审核日期。查看仓库 Actions 的 `source-review-report` artifact；无法访问／robots 禁止会明确记录，不当作验证成功。

完整更新规范见 [CONTENT_POLICY.md](CONTENT_POLICY.md)，原有贡献规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。官方来源见 [TUM RCI](https://www.cit.tum.de/en/cit/studies/degree-programs/master-robotics-cognition-intelligence/)。

**个人计划、成绩单、证件、群聊和受限课件不得上传到这个公开仓库。** 个人收藏与计划只保存在当前浏览器。中文内容为参考，学校原文和个人 TUMonline 记录优先。
