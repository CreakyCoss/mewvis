# 桌面应用开发

Isle 桌面应用使用 Tauri、React、TypeScript 和 Vite。源码位于 `apps/desktop`，Rust 宿主位于其 `src-tauri` 目录。

## 启动与构建

在仓库根目录安装依赖并构建上游 AI 包：

```sh
pnpm install
pnpm build:ai
pnpm dev:desktop
```

`dev:desktop` 启动 Tauri 开发环境。只开发前端时，在 `apps/desktop` 运行 `pnpm dev`；浏览器预览不等同于原生宿主验收。

```sh
pnpm build:desktop
pnpm build:desktop:mac:arm64
pnpm build:desktop:mac:x64
pnpm build:desktop:win:x64
pnpm build:desktop:win:arm64
```

构建会同步产品配置，构建 Chat 共享界面、插件宿主和 Agent 运行时，并打包内置插件与中文文档。具体平台还需安装对应的 Rust/Tauri 构建依赖。

`build:agent-runtime` 会先清理并构建运行时，再构建 Plugin UI Host，最后复制资源和打包插件。插件宿主位于同一个 `agent-runtime/dist` 目录，必须在清理之后生成。开发模式缺少宿主产物时会明确报错，不会加载旧的 Tauri 资源副本。在 `apps/desktop` 运行 `pnpm test:plugin-host:packaging` 可验证完整构建后的宿主启动与文档插件全屏声明。

## 编辑器

可使用 [VS Code](https://code.visualstudio.com/)，配合 [Tauri 扩展](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)和 [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)。

## 阅读与维护文档

应用的插件列表中打开「文档中心」。源码文档的入口是 [文档首页](../README.md)，维护规则见 [文档维护](documentation.md)。
