# 文档维护

仓库根目录 `README.md` 提供项目介绍和快速启动，Mewvis 详细说明统一维护在 `docs/`。目录按主题分组，页面使用稳定的英文文件名与中文标题。

## 新增与修改

1. 在相应章节目录新增 Markdown 页面，首行使用一级中文标题。
2. 在 `docs/SUMMARY.md` 添加相对链接。二级标题表示章节，列表缩进表示父子目录；这里是阅读顺序的唯一来源。
3. 使用相对路径链接其他文档；页内锚点采用小写标题，空格转为连字符，保留中文，重复标题依次添加 `-1`、`-2`。
4. 正文写简体中文，保留 API 标识、命令、协议字段和必要的技术术语。命令注明执行目录，接口、路径与当前源码保持一致。
5. 在仓库根目录执行以下检查。

```sh
pnpm docs:check
pnpm docs:build
pnpm docs:test
```

`docs:check` 验证目录覆盖、重复条目、文件链接与文档锚点，并阻止自有源码目录再出现 README。`docs:build` 生成 `docs/.generated/book.json`，并构建文档应用的 `app-ui.js` 入口。文档索引是忽略提交的派生产物，不应手工修改。正常内置应用打包也会先重新生成，防止旧内容进入应用。

## 内容范围

正式文档包含当前的使用方式、应用与插件开发、架构接口、运维和必要的数据兼容说明。介绍示例应用时，说明它的用途、接入方式和能力边界；通用开发方法写入应用或插件开发章节。

开发草稿、未实施方案、一次性评分、改动流水账、回滚及 stash 操作记录放在 Issue、Pull Request 或本地记录中，不加入 `SUMMARY.md`。临时截图和验收记录按下文约定保留在本地。

功能变更时同步检查相关页面和源码链接。整页内容已失效且没有当前用途时，删除页面并清理目录、交叉引用及迁移映射；需要查阅旧方案时使用 Git 历史。仍影响用户数据的迁移和回退限制应保留，并明确适用范围。

## 保留的资源

- `ai/pi/` 属于上游依赖，其 README 与文档随上游维护。
- `apps/client/resources/skills/` 和运行时内置技能中的文档是技能资源；前者只打包 `apps/client/resources/registry.json` 登记的目录。
- `packages/app/dev/templates/` 内的 README 是生成新应用时使用的模板资源，随工具包分发，不是 Mewvis 的重复文档入口。
- `THIRD_PARTY_NOTICES.md`、LICENSE 等许可文件保持原位置和原文。

`docs/migration-map.json` 记录旧文档路径与新路径，便于定位历史引用。更新目录顺序只改 SUMMARY，不创建另一份侧栏配置。

## 在线文档站

[在线文档](https://creakycoss.github.io/mewvis/) 使用 VitePress，直接读取 `docs/` 的 Markdown，并从 `SUMMARY.md` 生成章节侧栏。应用内文档中心继续使用同一份正文与阅读顺序。

在仓库根目录执行：

```sh
pnpm docs:site:dev
pnpm docs:site:build
pnpm docs:site:preview
```

`docs:site:dev` 启动开发预览；`docs:site:build` 生成 `docs/.vitepress/dist/`，并检查所有页面、锚点与资源链接；`docs:site:preview` 预览构建产物。预览地址为 `http://127.0.0.1:4175/mewvis/`。这些命令独立于离线阅读器的 `docs:build`。

配置与样式位于 `docs/.vitepress/`。文档之间的相对链接保持原写法，指向文档目录外的源码链接会在网站构建时转换为 GitHub 地址。首页由 `docs/README.md` 映射，不另建一份首页正文。

`.github/workflows/docs.yml` 在文档变更合并到 `main` 后自动构建并发布到 GitHub Pages，Pull Request 只进行构建检查。首次部署需在仓库的「Settings → Pages → Source」选择「GitHub Actions」。正文、目录与截图均从仓库更新，不直接修改网站构建产物。

`design-qa.md` 和根目录 `.codex/` 中的截图属于本地验收记录，保留在本地并忽略提交。文档索引跳过这些记录，正式文档不引用它们。

## 阅读器渲染

构建时使用项目现有的 React Markdown 与 GFM 支持，将正文预渲染成 HTML；原始 HTML 不执行，危险 URL 不保留。离线索引同时包含标题目录和全文搜索文本。

文档链接在阅读器内跳转；源码链接显示为仓库路径，供开发者定位，应用不读取工作区源码。外部 HTTP(S) 链接必须由用户点击，经宿主打开。图片仅显示替代说明与来源，不从沙箱联网加载。Mermaid 围栏保留为代码文本。

应用的宿主入口将索引打包进自身，生产环境不依赖源码仓库路径，也不启动本地 Web 服务。查看 [文档中心](../apps/builtins/docs-reader.md)了解阅读方式。
