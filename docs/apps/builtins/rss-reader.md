# RSS 阅读器

`@mewvis/rss-reader` 是基于 `@mewvis/app-sdk` 开发的可移植 RSS/Atom 应用。实现复用 MIT 许可的 [dsh-rss](https://github.com/STARDUSTLC666/dsh-rss)，保留原设置和工具契约，新增内置模型技能，并在包内提供独立 Mewvis 阅读页面。作者使用 Mewvis SDK，Cordis 仍是私有生命周期协议。

## 能力

- `rss_list`、`rss_add`、`rss_remove`、`rss_fetch`：供阅读界面管理和抓取订阅。
- `rss_check`、`rss_opml_export`、`rss_opml_import`：供模型工作流使用。
- 通过 Mewvis `settings` 服务持久保存订阅。
- `dsh-rss@0.2.0` 提供 RSS/Atom 解析、抓取超时和响应大小限制。
- 内置技能将订阅内容视为不可信的外部数据。

Mewvis 中 `dsh-rss` 设置命名空间保存于 `<app-data>/apps/dsh-rss/settings.yaml`。其他 DeepSeek Harness 宿主可通过自己的设置服务映射相同命名空间。

内置版本默认启用，可直接打开「应用 → RSS 阅读器」；用户保存的启用设置优先，可在「应用 → 管理」调整。不要同时启用另一个注册相同 `rss_*` 工具的应用。

启用后，应用在宿主侧获得 HTTP(S) 抓取能力。固定的上游版本接受私有网络 URL，因此只订阅可信端点，不应把它当作通用 URL 抓取器。

## 构建与分发

源码只有一份原生 `mewvis.app` 入口，不维护手写 DSH 清单。在 `apps/client` 执行：

```sh
pnpm app:validate -- ../applications/builtins/rss-reader
pnpm app:pack -- ../applications/builtins/rss-reader --target mewvis
pnpm app:pack -- ../applications/builtins/rss-reader --target dsh
```

DSH 目标内联运行时依赖，生成 `cordis.patch.yml`，并保留附加的 Mewvis 元数据，同一产物仍可导入 Mewvis。第三方许可原文随包保留在 `THIRD_PARTY_NOTICES.md`。
