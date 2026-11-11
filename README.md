# ChengzhiHuang 技术笔记

Astro + TypeScript + Markdown 个人博客。中文、系统字体、浅深色主题和响应式阅读。站点为 [chengzhihuang.github.io](https://chengzhihuang.github.io/)，源码为 [ChengzhiHuang.github.io](https://github.com/ChengzhiHuang/ChengzhiHuang.github.io)。

作者已明确授权本站公开仓库及 Pages。仅获批文章可提交；原始资料、审阅对照和私有工具不进入仓库。pre-push 钩子只放行此仓库 main 上完整验证过的提交，Pages 仅部署通过同样检查的 dist。

## 安装和预览

使用 `.nvmrc` 固定的 Node 22.23.2 和 npm 10.9.8。安装依赖仅下载公开包，不需 GitHub 登录。

```sh
nvm use
ASTRO_TELEMETRY_DISABLED=1 npm ci --ignore-scripts
npm run setup:local
npx playwright install chromium
ASTRO_TELEMETRY_DISABLED=1 npm run dev
```

打开 http://127.0.0.1:4321 。退出时按 Ctrl-C。生产预览使用 `npm run build` 后 `npm run preview`，同样只监听 127.0.0.1。不要覆盖 host 参数。

## 日常维护

文章位于 `src/content/posts/<稳定英文标识>/index.md`，图片放在同一目录的 `images/`。原始资料和未通过人工审阅的稿件不得进入本站目录。审阅副本应是独立的私有工程，不能让构建读取上级目录或使用符号链接。

每篇文章的 frontmatter 包含 title、description、date（引号包围的 YYYY-MM-DD）、dateBasis、category、tags、permalink 和 author。author 固定为 ChengzhiHuang。dateBasis 为 published、first-public-commit 或 modified，未核实发表日期时明确采用最后修改日期。permalink 与目录一致且永久稳定。分类在 [统一模型](src/lib/model.ts) 中定义。

在私有副本完成检查与人工审阅后，才可将定稿迁入本工程。审阅结果记入 `publications.json`：permalink、status、reviewer、reviewedAt、imagesManuallyReviewed 和 sha256。哈希计算覆盖正文及所有同目录文件；不能只核对 Markdown。状态必须由作者实际审阅后填写，禁止自动批准。正文或图片变化后重新审阅。

原始人员、业务符号等专用脱敏名单只保存在私有审阅工具中，导入前执行相应扫描。不要为了扩充检查而把这些名单复制到站点代码或测试；站点通过通用规则和审阅哈希校验定稿，构建不读取私有目录。

附件放在文章目录的 `attachments/`，使用 `./attachments/example.c` 引用；构建映射到 `/files/<稳定英文标识>/example.c`。ZIP 内的文件同样接受检查，禁止 Git 历史、用户状态、越界路径及内部文本。图片采用预先处理的本地文件，构建保留原文件字节，产物检查核对图片哈希，避免再次压缩改变审阅内容。

Markdown 附件使用带 BOM 的 UTF-8 编码；正文中的链接自动进入 `/posts/<稳定英文标识>/attachments/<不含 .md 的附件名>/` 阅读页。UTF-8 文本附件（py、c、h、cpp、m、mm、json、plist、txt、sh）进入保留文件扩展名的同类阅读页，源码以文本显示、附带 CSS 行号并支持复制；超过 256 Ki 个字符时省略语法高亮。从阅读页点击「返回正文」会自动回到离开正文前的阅读位置。全部阅读页保留原字节下载，二进制附件保持直接下载。附录只进入站点地图，不增加首页、分类、搜索或 RSS 的文章数。

外部 HTTP(S) 链接默认在新标签页打开，并带 `noopener noreferrer`；Markdown、原生 HTML、导航和页脚遵循同一规则。本站链接、页内锚点、邮件和附件导航保持原有行为。

主导航的「关于」在当前标签页打开 `/about/`，介绍正文随站点构建，原文链接指向《老司机 iOS 周报》的成员介绍。归档页支持按标题、摘要、章节标题与标签实时检索（快捷键 `/` 聚焦搜索框，点击列表标签可就地过滤），并展示预估阅读时长；正文页提供顶部阅读进度细线、桌面端目录章节实时高亮、窄屏悬浮目录抽屉与回到顶部入口、小节锚点链接复制、代码块语言标识顶栏、宽表滚动阴影提示、支持 `1:1 原始尺寸` 切换的大图查看器以及文末相邻/同分类文章推荐。

摘要使用 `> [!TLDR]`，后接同一个引用块内的正文、列表或图片，默认展开。代码围栏可写 `cpp annotated`（也适用于其他语言），用成对的 `**加粗**` 和 `~~删除线~~` 标记批注，标记须在同一行闭合；普通代码围栏完全不解释这些符号。复制批注代码时包含划线部分，但没有排版标记。合并单元格用静态 HTML 的 `rowspan` 与 `colspan` 表达，表头使用 `scope`，窄屏下表格横向滚动。

## 验证与本地打包

```sh
npm run harness:check
npm run harness:verify
npm run harness:package
```

- check：目录/导入约束、Git 目标与钩子、工作流、文档与内容校验、类型和 Lint。
- verify：check、行为测试、生产构建、三个屏幕尺寸的浏览器回归、HTML/图片/链接/搜索/RSS/站点地图检查。
- package：先要求已提交且干净的工作区，再完整 verify 并核对人工审阅哈希，产出 `.harness/packages/` 下的静态包与文件清单，然后退出。未审阅、哈希变化或必要检查失败均不能出包。

每次运行在 `.harness/runs/` 写入 JSON 报告、提交 SHA、源码摘要、命令、退出码、耗时、日志与截图；失败时保留 trace。`.harness/latest.json` 指向最近结果。缓存、证据和构建产物均被 Git 忽略，不随站点输出。CI 只上传 dist，不上传审阅材料或 Harness 截图。

## 提交与部署

作者批准具体目录哈希并导入后，检查 `git diff` 与 `git status`，提交源文件，然后验证当前提交：

```sh
git add <明确要提交的文件>
git commit -m "Describe the reviewed change"
ASTRO_TELEMETRY_DISABLED=1 npm run harness:package
git push origin main
```

origin 只能是 `git@github.com:ChengzhiHuang/ChengzhiHuang.github.io.git` 或对应 HTTPS 地址。package 后更改正文、素材、工程或 HEAD 都会使推送证据失效，需重新审阅相关内容并验证。钩子检查所有待推送历史，不能先提交私有文件再删除。禁止使用 `--no-verify`、强制推送或关闭 hooksPath。

main 推送触发唯一 Pages 工作流：完整 Harness → 上传 dist → 部署。也可在 Actions 中手动运行 main。部署失败时检查失败步骤并修复，不跳过验证。GitHub Pages 的来源设为 GitHub Actions，公开域名使用默认地址。

## 故障排查与回退

Node 版本错误时先 `nvm use`。浏览器缺失时安装固定 Playwright 对应 Chromium。钩子检查失败时运行 `npm run setup:local`，核对 origin 指向指定仓库。缺图或损坏链接应修正引用，不要跳过检查。审阅哈希不匹配时对变化重新审阅，不能只刷新哈希绕过审核。

回退使用 `git revert <出错提交>` 或把已验证版本恢复为新提交，同时恢复对应的 publications.json。重新执行 package 后正常推送 main，等待 Pages 部署成功；不改写远端历史。已验证提交 SHA 可从 Harness 报告与 Actions 的部署记录对应查找。

## 工程约定

[AGENTS](AGENTS.md) → [源代码约束](src/AGENTS.md) / [Harness 约束](scripts/AGENTS.md) / [测试约束](tests/AGENTS.md)。参考 Arrow 的分层约定、可执行架构检查和证据机制，本站独立构建，不依赖 Arrow。

长期决策见 [ADR 001](docs/adr/001-local-only.md)、[ADR 002](docs/adr/002-content-boundary.md)、[ADR 003](docs/adr/003-verification.md)、[ADR 004](docs/adr/004-public-system-binary.md)、[ADR 005](docs/adr/005-markdown-presentation.md)、[ADR 006](docs/adr/006-reviewed-publication.md)。Astro 内容组织参考 [官方内容集合文档](https://docs.astro.build/en/guides/content-collections/)。
