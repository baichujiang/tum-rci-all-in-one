# TUM RCI All-in-One · Robotics, Cognition, Intelligence

**TUM RCI All-in-One — 面向慕尼黑工业大学 Robotics, Cognition, Intelligence 专业及同名学生社群的中文一站式知识库。**

- 项目：TUM **M.Sc. Robotics, Cognition, Intelligence**，Garching，4 semesters / 120 ECTS。
- 最近整理：**2026-10-11（Europe/Berlin）**。
- 正式来源：[https://www.cit.tum.de/en/cit/studies/degree-programs/master-robotics-cognition-intelligence/](https://www.cit.tum.de/en/cit/studies/degree-programs/master-robotics-cognition-intelligence/) ｜ [学习规划](https://www.cit.tum.de/cit/studium/studiengaenge/master-robotics-cognition-intelligence/studienplaene/) ｜ [现行修订条例 PDF](https://www.tum.de/studium/im-studium/das-studium-organisieren/satzungen-ordnungen?tx_in2tumstatutedatabase_pi1%5Baction%5D=download&tx_in2tumstatutedatabase_pi1%5Bcontroller%5D=Statute&tx_in2tumstatutedatabase_pi1%5BfileId%5D=P008777873)。

## ⚡ 立即开始

1. **双击 `index.html`** —— 无需联网安装依赖即可搜索仓库的资源标题和分类（访问链接仍需联网）。
2. 阅读 [START_HERE.md](START_HERE.md) 找到针对申请人/已录取/在读/科研的导航。
3. 想**查看所有125条带链接资源**，直接打开 [ALL_RESOURCES.md](ALL_RESOURCES.md)。
4. 快速对照以下指南：

| 路径 | 覆盖 |
|---|---|
| [01 申请与录取](guides/01_申请与录取.md) | 截止日期、VPD、APS、GRE、语言、材料、流程 |
| [02 课程与毕业](guides/02_课程与毕业要求.md) | 120 ECTS / FPSO新旧规则 / 35条法定课程 / 2条学期路线 |
| [03 选课与考试](guides/03_选课系统与考试.md) | TUMonline、Moodle、Matching、成绩与课程学分审核 |
| [04 科研实验室与论文](guides/04_科研实验室与论文.md) | MIRMI、CVG、AIR、RSI、Thesis Portal、套磁流程 |
| [05 费用生活](guides/05_费用奖学金和生活.md) | 非欧盟费用、奖学金、宿舍、交通、保险、签证 |
| [06 机器人技术栈](guides/06_机器人技术栈和学习路线.md) | ROS2、OpenCV、SLAM、Motion Planning、ML、控制及项目路线 |
| [07 2026/27 冬季更新](guides/07_2026冬季学期快照.md) | 紧迫日程、当年课程、Matching剩余课题 |
| [08 常见问题与术语](guides/08_常见问题与术语.md) | 英德中关键词与办事FAQ |
| [09 参考书与论文](guides/09_经典教材和研究主题.md) | 学术参考书、论文阅读顺序、研究方向 |

## 在 GitHub 上使用

- Repository: `baichujiang/tum-rci-all-in-one`（公开仓库已创建）。
- 将 `index.html` 发布为 GitHub Pages，其他人便能通过浏览器搜索，无需 GitHub 账号。
- 用 Pull Request 提交新资料，并在 CSV 中记录日期、来源及适用版本。
- 按 [PUBLISH.md](PUBLISH.md) 完成发布；当前只提供仓库源文件，不代表网站已上线。

## 结构 / Contents

```text
tum-rci-all-in-one/
├── README.md                 仓库入口
├── START_HERE.md             针对不同学业阶段的操作索引
├── ALL_RESOURCES.md          125条资源的完整 Markdown 列表
├── index.html                离线可搜索网页
├── guides/                   完整中文操作/学习指南 01～09
├── data/
│   ├── resources.csv/.json             分组资源链接库
│   ├── courses_legal_2025.csv/.json    2025 修订法规全部35行
│   ├── topics_ws2026_27.csv           26/27 相关 seminar/practical 快照
│   └── events_deadlines.csv           需按学期更新的时间
├── templates/                申请清单/课程记录/个人规划/科研联系表
├── scripts/                  离线一致性验证 + 可选联网检链
├── .github/workflows/        GitHub 远程定期链接检查示例
├── CONTRIBUTING.md
├── LICENSE.md
└── CHANGELOG.md
```

## 先看 120 ECTS 学分约束

| 组成 | 通常 ECTS | 注意 |
|---|---:|---|
| Core lecture / seminar / practical | 43 | Robotics vs Roboterdynamik XOR |
| 科学技术选修 G+H+I | 41 | G/H/I 各至少 5；若要求补ED140014，则为36+5 |
| 跨学科选修 J | 6 | 德语课 C1.2 及以上才有机会认可 |
| Thesis | 30 | 注册、论文和展示按学校程序 |
| **总计** | **120** | 适用入学批次法规高于示例规划 |

## 信息可信度与边界

- **官方已查阅**：在整理日访问到的 TUM/CIT/MIRMI/课程官方页面；只是页面查阅，不代表每条链接都做了网络状态码测试。
- **官网入口待再核实**：官方平台 canonical URL 或业内知名项目入口；未逐项实时验证内容和正常访问，脚本可选批量检查。
- **历史课程/学生社区**：仅供学习；不能用于确认当年考试安排和毕业认定。
- **时效信息**：申请费用、课程内容、面试政策、名单和时间表每学期可变。`snapshot_date` 是采集日，不是担保长期有效。

## 更新与贡献

```bash
python3 scripts/validate_repo.py   # 完全离线，数据/学分约束一致性核验
python3 scripts/check_links.py --limit 15   # 可选，需要公网，403/429/登录墙不判为死链
```

本文件夹为 GitHub 仓库 `tum-rci-all-in-one` 的初始内容；创建公开仓库后，将全部文件提交到仓库根目录。网站通过 GitHub Pages 发布（参见 [PUBLISH.md](PUBLISH.md)）。

**重要：**本仓库不是 TUM 官方项目/招生咨询，也不会保存受限课件、学生身份凭证、申请文书草稿或个人隐私。对于入学、考试、毕业决策，TUMonline 的个人记录和适用 FPSO 优先。
