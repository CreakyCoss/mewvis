# 桌面应用开发

客户端工程位于 `apps/client`，工作区包名为 `client`，共用桌面和 Web 页面。`dev:desktop`、`build:desktop` 仍表示 Tauri 桌面目标；直接调用包脚本使用 `pnpm --filter client`。

Isle 桌面应用使用 Tauri、React、TypeScript 和 Vite。源码位于 `apps/client`，Rust 宿主位于其 `src-tauri` 目录。

## 启动与构建

在仓库根目录安装依赖并构建上游 AI 包：

```sh
pnpm install
pnpm build:ai
pnpm dev:desktop
```

`dev:desktop` 启动 Tauri 开发环境。只开发前端时，在 `apps/client` 运行 `pnpm dev`；浏览器预览不等同于原生宿主验收。

```sh
pnpm build:desktop
pnpm build:desktop:mac:arm64
pnpm build:desktop:mac:x64
pnpm build:desktop:win:x64
pnpm build:desktop:win:arm64
```

构建会同步产品配置，构建 Chat 共享界面、应用宿主和 Agent 运行时，并打包内置应用与中文文档。具体平台还需安装对应的 Rust/Tauri 构建依赖。

`build:agent-runtime` 调用独立的 `@isle/agent-runtime` 包，先清理并构建运行时，再构建 Application UI Host，最后复制资源和打包应用。应用宿主位于同一个 `apps/agent-runtime/dist` 目录，必须在清理之后生成。开发模式只使用工作区的运行时产物；缺少 Node 后端时会明确报错，不会回退加载 `target/debug` 中旧的 Tauri 资源副本。运行时重建期间若触发桌面重启，等待构建完成后重试。在 `apps/client` 运行 `pnpm test:app-host:packaging` 可验证完整构建后的宿主启动与文档应用全屏声明。

## 编辑器

可使用 [VS Code](https://code.visualstudio.com/)，配合 [Tauri 扩展](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)和 [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)。

## 阅读与维护文档

应用的应用列表中打开「文档中心」。源码文档的入口是 [文档首页](../README.md)，维护规则见 [文档维护](documentation.md)。

产品配置统一位于 `apps/product.config.json`。桌面同步脚本从这里生成页面标题和 Tauri/Cargo 产品信息；Server 与 Runtime 读取同一份配置。文件移动不改变产品标识或原数据目录命名。应用宿主和内置应用分别归属 `packages/app/host`、`apps/applications`；`core` 仍位于 `apps/client/core`。
