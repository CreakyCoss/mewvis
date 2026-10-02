# 桌面应用开发

共享前端位于 `apps/client`，工作区包名为 `client`，同时供桌面和 Web 使用。Tauri 工程位于 `apps/desktop`，工作区包名为 `@isle/desktop`。仓库根目录的 `dev:desktop`、`build:desktop` 命令转发到桌面包；直接调用桌面包脚本使用 `pnpm --filter @isle/desktop`。

Isle 桌面应用使用 Tauri、React、TypeScript 和 Vite。React 页面位于 `apps/client/src`，Rust 宿主位于 `apps/desktop/src-tauri`。Tauri 开发与构建命令调用桌面包的 `dev:ui`、`build:ui` 脚本，通过 `apps/desktop/vite.config.ts` 复用共享页面，并将 `apps/desktop/dist` 作为前端产物。Web 使用 `apps/client/vite.config.ts`，产物位于 `apps/client/dist`，两种构建互不覆盖。

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

Windows ARM64 包保留原生 ARM64 桌面外壳与 Node。sqlite-vec 0.1.9 的 npm 包未提供该平台 DLL，构建会下载并校验固定版本的上游源码，再编译并打包 ARM64 DLL。本机 Windows 构建使用 ARM64 Native Tools 开发命令行；macOS/Linux 交叉构建使用现有 LLVM 与 `cargo-xwin`。首次构建需联网获取源码、许可证和未缓存的 CRT/SDK，后续可复用缓存。

`build:agent-runtime` 调用独立的 `@isle/agent-runtime` 包，先清理并构建运行时，再构建 Application UI Host，最后复制资源和打包应用。应用宿主位于同一个 `apps/agent-runtime/dist` 目录，必须在清理之后生成。开发模式只使用工作区的运行时产物；缺少 Node 后端时会明确报错，不会回退加载 `apps/desktop/src-tauri/target/debug` 中旧的 Tauri 资源副本。运行时重建期间若触发桌面重启，等待构建完成后重试。在 `apps/client` 运行 `pnpm test:app-host:packaging` 可验证完整构建后的宿主启动与文档应用全屏声明。

技能资源由 `apps/client/resources/registry.json` 的 `skills` 数组显式登记。数组项是 `apps/client/resources/skills` 下的一级目录名；构建只复制列出的目录到 Runtime 的 `dist/skills`，开发和桌面启动均从这里加载。新增技能目录后需手动加入配置；未登记的目录不会随 Runtime 发布或注册为系统技能。删除条目并重新构建即可从新版 Runtime 移除对应资源。当前内置技能的上游来源和许可记录在各目录的 `SOURCE.md`、`LICENSE` 或 `LICENSE.txt` 中。

## 平台能力边界

`@isle/client-platform` 定义后端连接、路径选择、外部链接、文件位置和窗口操作的公共类型，不依赖 Tauri。共享页面通过 `apps/client/src/platform` 调用能力；Web 实现位于 `apps/client/src/platform/web.ts`，桌面实现位于 `apps/desktop/src/platform/tauri.ts`。Vite 与 TypeScript 的 `@platform-impl` 别名分别选择对应实现，生产页面不通过 `isTauri()` 判断环境。

窗口拖动、拦截关闭、原生选择器和文件位置是可选能力。Web 文件选择仍由 `src/api/native.ts` 调用 Node 接口，数据库位置按钮显示“复制路径”。聊天服务负责保存会话并返回是否允许关闭，桌面适配器负责拦截关闭事件、避免重复关闭并最终销毁窗口。链接协议校验在公共平台入口执行。

`platform.window.titleBarStyle` 描述标题栏是否覆盖 Web 内容：macOS 为 `overlay`，保留 40 px 顶部拖动区和侧栏的 48 px 顶部间距；Windows/Linux 为 `native`，使用原生标题栏，内容从顶部开始，侧栏只保留 8 px 内边距。Web 同样不预留桌面标题栏空间。应用导航在 macOS 的覆盖顶栏靠右显示，在原生标题栏与 Web 环境下作为内容区内的 40 px 导航行靠左显示，仅在应用注册导航时占用高度。桌面构建使用 Tauri 的 `TAURI_ENV_PLATFORM` 选择标题栏模式，直接启动 Vite 时使用当前构建机的平台。

在仓库根目录运行 `pnpm --filter client test:platform` 检查平台边界、后端握手重试、链接协议、选择取消和窗口关闭时序。`pnpm --filter client test:web` 验证两端真实传输、鉴权、SSE 和进程生命周期。

## 编辑器

可使用 [VS Code](https://code.visualstudio.com/)，配合 [Tauri 扩展](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)和 [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)。

## 阅读与维护文档

应用的应用列表中打开「文档中心」。源码文档的入口是 [文档首页](../README.md)，维护规则见 [文档维护](documentation.md)。

产品配置统一位于 `apps/product.config.json`。配置同步脚本从这里生成 `apps/client/index.html` 的页面标题以及 `apps/desktop/src-tauri` 的 Tauri/Cargo 产品信息；Server 与 Runtime 读取同一份配置。文件移动不改变产品标识或原数据目录命名。应用宿主和内置应用分别归属 `packages/app/host`、`apps/applications`；`core` 仍位于 `apps/client/core`。
