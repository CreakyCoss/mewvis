# @isle/rss-reader

Portable RSS/Atom capability authored against `@isle/plugin-sdk`.

The implementation reuses the MIT-licensed
[`dsh-rss`](https://github.com/STARDUSTLC666/dsh-rss) plugin. It preserves the
RSS settings and tool contracts, adds an embedded model skill, and ships a
self-contained Isle reader page inside the plugin package. Its author-facing
contract comes from Isle's SDK; Cordis remains the private lifecycle protocol.

## Capabilities

- `rss_list`, `rss_add`, `rss_remove`, and `rss_fetch` for the Isle reader UI;
- `rss_check`, `rss_opml_export`, and `rss_opml_import` for model workflows;
- persistent subscriptions through Isle's `settings` service;
- RSS/Atom parsing, fetch timeout, and response-size limits provided by
  `dsh-rss@0.2.0`;
- an embedded skill that treats feed contents as untrusted external data.

Inside Isle, the `dsh-rss` settings namespace is physically stored at
`<app-data>/plugins/dsh-rss/settings.yaml`. Other DeepSeek Harness hosts remain
free to map the same namespace through their own settings provider.

The bundled Isle copy is disabled by default. Enable it from **Plugins →
Manage**, then open **Plugins → RSS Reader**. Do not enable it together with a
second plugin that registers the same `rss_*` tools.

Enabling the plugin grants host-side HTTP(S) fetch access. The pinned upstream
version accepts private-network URLs, so only subscribe to endpoints you trust
and do not use it as a general-purpose URL fetcher.

## Build and publish

The source package has one native `isle.plugin` entry and no handwritten DSH
manifest. Build either target from the desktop workspace:

```sh
pnpm plugin:validate -- plugin-host/plugins/rss-reader
pnpm plugin:pack -- plugin-host/plugins/rss-reader --target isle
pnpm plugin:pack -- plugin-host/plugins/rss-reader --target dsh
```

The DSH target bundles runtime dependencies and generates
`cordis.patch.yml`. It preserves additive Isle metadata, so the same artifact
can still be imported by Isle.
