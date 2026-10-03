# RSS 阅读器

`@mewvis/rss-reader` 是基于 `@mewvis/app-sdk` 开发的可移植 RSS/Atom 应用。实现复用 MIT 许可的 [dsh-rss](https://github.com/STARDUSTLC666/dsh-rss)，保留原设置和工具契约，在包内提供「今日阅读」页面。作者使用 Mewvis SDK，Cordis 仍是私有生命周期协议。

## 能力

- 今日阅读聚合所有订阅，展示一篇待读文章、其他更新和稍后读入口。
- 全部未读、稍后读、收藏、订阅分组、文章排序与缓存内容搜索；搜索也可找回取消订阅后仍被收藏或加入稍后读的文章。
- 打开文章时标记已读，支持批量已读与撤销。阅读页保留标题、段落、列表、引用、代码和表格，提供字号调整、上一篇／下一篇与打开原文。
- 添加订阅前检查地址，可编辑名称和分组、刷新单个来源、查看失败原因。OPML 支持文件或文本导入、预览新增／重复／跳过与将被更新的订阅，导出内容可复制。
- `rss_list`、`rss_add`、`rss_remove`、`rss_fetch`、`rss_check`、`rss_opml_export`、`rss_opml_import` 保持原工具契约。新增 `rss_update` 修改名称和分组，`rss_opml_preview` 只读预览导入结果。
- 通过 Mewvis `settings` 服务持久保存订阅，通过公共 Data SDK 保存文章缓存、阅读标记和字号／排序偏好。
- `dsh-rss@0.2.0` 提供 RSS/Atom 解析、抓取超时和响应大小限制。
- 内置技能将订阅内容视为不可信的外部数据。

搜索快捷键为 `⌘/Ctrl K`；阅读时可用 `J/K` 切换文章、`S` 收藏、`M` 切换已读、`Esc` 返回列表。界面跟随宿主语义色，兼容浅色、深色和窄窗口。

界面密度与调试台对齐：24px 页标题、13px 导航与说明、34px 常规按钮、188px 侧栏。长文正文默认 16px，可在阅读设置中调整为 14–24px；已有用户保存的字号继续生效。

首次使用默认订阅 [少数派](https://sspai.com/feed)、[爱范儿](https://www.ifanr.com/feed)、[IT之家](https://www.ithome.com/rss/)、[阮一峰的网络日志](https://www.ruanyifeng.com/blog/atom.xml) 和 [Hacker News](https://news.ycombinator.com/rss)，按数字生活、科技资讯和开发技术分组。用户可在「管理订阅」编辑或删除，包括全部清空；重启后不会自动补回已删除的来源。默认列表仅作为初始配置，已有用户保存的订阅列表（包括空列表）以及显式配置的 `feedsYaml` 优先。

每个来源保留最近 300 篇文章，额外保留收藏和稍后读的文章。取消订阅会停止在聚合流中展示该来源，已保存文章仍可阅读。首次打开及缓存超过 15 分钟时更新来源，也可手动刷新；最多同时更新三个来源，失败不清空旧内容。文章缓存分段写入，每次请求低于宿主的 256 KiB 限制，全部写完后才切换索引，中途失败继续保留上次完整缓存。

`rss_fetch` 额外返回可选的 `contentHtml`，原有纯文本字段不变。HTML 只来自本次获取的订阅正文，前端经 DOMPurify 白名单清洗后显示；阅读时不额外抓取文章网站或远程图片，链接通过宿主打开。首页图片是应用自带的阅读场景装饰，不作为文章来源图片。正文缺失时显示订阅摘要，完整内容可打开原文查看。

Mewvis 中 `dsh-rss` 设置命名空间保存于 `<app-data>/apps/dsh-rss/settings.yaml`。其他 DeepSeek Harness 宿主可通过自己的设置服务映射相同命名空间。

内置版本默认启用，可直接打开「应用 → RSS 阅读器」；用户保存的启用设置优先，可在「应用 → 管理」调整。不要同时启用另一个注册相同 `rss_*` 工具的应用。

启用后，应用在宿主侧获得 HTTP(S) 抓取能力。固定的上游版本接受私有网络 URL，因此只订阅可信端点，不应把它当作通用 URL 抓取器。

## 构建与分发

界面源码位于 `ui/`，`app-ui.js` 和 `app-ui.css` 为生成文件，修改后在仓库根目录执行：

```sh
pnpm --filter @mewvis/rss-reader check
pnpm --filter @mewvis/rss-reader test
pnpm --filter @mewvis/rss-reader build:ui
```

应用批量构建会自动生成 RSS 界面。源码只有一份原生 `mewvis.app` 入口，不维护手写 DSH 清单。手动打包前先执行上面的 `build:ui`，再在 `apps/client` 执行：

```sh
pnpm app:validate -- ../applications/builtins/rss-reader
pnpm app:pack -- ../applications/builtins/rss-reader --target mewvis
pnpm app:pack -- ../applications/builtins/rss-reader --target dsh
```

DSH 目标内联运行时依赖，生成 `cordis.patch.yml`，并保留附加的 Mewvis 元数据，同一产物仍可导入 Mewvis。第三方许可原文随包保留在 `THIRD_PARTY_NOTICES.md`。

## 本地界面预览

在仓库根目录运行 `pnpm --filter @mewvis/rss-reader dev --port 5199`。预览明确标注「示例预览」，使用 `scripts/fixtures.ts` 和开发专用桥接，不会读取或改动用户的真实订阅。右下角可恢复示例、查看空状态、模拟单源失败及切换主题。预览适配器的浏览器存储仅用于演示，生产入口不包含此适配器，必须连接宿主 Data SDK。

方案 2 设计稿及浏览器验证截图保存在 `prototypes/rss-reader-redesign/`，验收记录见仓库根目录 `design-qa.md`。
