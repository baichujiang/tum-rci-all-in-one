# 公开发布 / Publishing

**目标仓库：** `baichujiang/tum-rci-all-in-one`  ·  **项目名称：** TUM RCI All-in-One。

## 先创建 GitHub 仓库

1. 打开 [创建新仓库](https://github.com/new?name=tum-rci-all-in-one)（先登录 `baichujiang`）。
2. 仓库名 `tum-rci-all-in-one`，Visibility 选择 **Public**。
3. 勾选 **Add a README file** 以初始化 `main` 分支，点击 Create repository。
4. 之后可通过已连接的 GitHub 连接器逐文件提交此目录内容，或用本地 `git` 直接 push。上传时替换自动生成的 README。**不要只把 ZIP 文件放进仓库。**

## 发布静态网页（可选）

所有文件提交到仓库根目录且 `main` 分支可用后：

1. Settings → Pages → Build and deployment。
2. Source → Deploy from a branch；Branch → main；Folder → /(root)；Save。
3. 等待 GitHub 页面显示正式地址后访问 `https://baichujiang.github.io/tum-rci-all-in-one/`。

**注意：** 上述 Pages URL 是预计地址，不代表已经上线成功。除非 Pages 显示已部署且已实际打开确认，不要作为已上线链接对外宣传。

## 维护准则

- 每学期核实课程和申请信息，并在文档标明时点。
- 内嵌在 `index.html` 的数据目前为静态快照；修改 `data/*.csv` 不会自动更新搜索页面。更新数据时应同步重建 HTML 或改造成从 JSON 加载。
- 将过时事件移至历史记录；先人工复核再批量合并链接检查结果。
- 公开仓库不要提交身份信息、课件登录凭据和版权受限制内容。