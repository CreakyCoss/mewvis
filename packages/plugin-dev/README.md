# Isle 插件工程

`@isle/plugin-dev` 管理 React 启动、开发预览、宿主工具注册、类型检查和安装包构建。
插件业务使用 `@isle/plugin-sdk`，无需导入 desktop 源码或维护 Vite 配置、iframe、postMessage。

## 在当前仓库创建项目

本轮没有发布 npm 包，下面先使用仓库内的 SDK 和工具链。先在仓库根目录执行 `pnpm install` 和 `pnpm --filter desktop build:chat-ui`，然后：

```sh
pnpm --filter desktop plugin:create -- /absolute/path/my-plugin --name @example/my-plugin --local
cd /absolute/path/my-plugin
pnpm install
pnpm dev
```

`--local` 写入当前 SDK 和工具链的 link 依赖，适合本机开发。项目可以位于 Isle 仓库外。
发布工具包后可不传 `--local`，模板使用版本依赖；这里不假设 npm 上已经存在这些包。
创建命令不会覆盖已有目录，也不会自动安装依赖或启动服务。

```text
my-plugin/
├── package.json          # 身份、版本、依赖和命令
├── isle.config.ts        # 权限、UI 和宿主工具配置
├── tsconfig.json         # 继承工具链提供的配置
└── main/
    ├── App.tsx           # 默认导出 React 页面
    ├── styles.css
    ├── contracts.ts      # UI 与宿主共享的数据类型
    └── host/
        └── tools.ts     # 可选，默认导出工具数组
```

页面可以自由拆分为 components、hooks、services；只有需要在 Node 执行的业务放在 host。
纯 UI 插件可删除 host 配置及目录；纯工具插件设置 `ui: false`。
package.json 不再维护一份重复的 `isle` 清单，构建时从 `isle.config.ts` 生成。

## 页面与宿主工具

```tsx
import { getPluginHost } from "@isle/plugin-sdk/browser";
import { Chat } from "@isle/plugin-sdk/chat/react";
import type { TextInspection } from "./contracts";

const result = await getPluginHost().executeTool<TextInspection>(
  "example_my_plugin_inspect_text",
  { text: "Hello Isle 👋" },
);
```

调用返回 `{ value, content, meta }`。类型参数描述调用者预期，运行时仍由宿主检查输入、输出和工具归属。
`getHost()` 返回安全的插件元数据和主题，`openExternal()` 请求宿主打开外部链接。
工具通过 SDK `defineTool` 声明输入 parameters、输出 schema/render 和 execute；工具链自动生成 Cordis 注册入口。
默认示例使用 Node crypto，实际计算字符数、UTF-8 字节数和 SHA-256，并提供空文本错误演示。

聊天仍通过 `getPluginChatClient()` 创建、列出和打开会话，然后传给 `<Chat session={session} />`。
SDK 提供完整的发送、停止、能力选择、流式事件、保存和多视图绑定，插件不实现第二套执行流程。
业务层决定何时创建和关闭会话，React 卸载只取消观察。

## 开发与构建

- `pnpm dev`：只监听本机 `127.0.0.1:5173`，端口被占用时退出，不替换已有服务。可传 `--port 5174`。
- `pnpm check`：检查配置和 TypeScript，分别检查浏览器与 Node 类型环境，并禁止 UI 导入 host 实现。
- `pnpm build`：先检查，再生成 `dist/isle`，包含宿主 JS、沙箱 UI JS/CSS 和安装清单。不会自动安装、启用或发布。

开发页面自动提供 React Refresh、主题切换和内存聊天宿主。聊天核心与 UI 来自 Isle 的同一份实现，仅模型和存储使用测试适配。页面上会标明“内存聊天预览”，刷新清空记录，不调用真实模型、不访问真实工作区。

宿主工具在开发服务的 Node Worker 内执行原始业务代码。页面通过带开发连接令牌的本机接口调用，校验工具归属、输入和输出；最多四个并发请求，超时释放 Worker，下一次请求可以恢复。修改 host 模块会清理旧 Worker 并刷新预览及工具目录；修改共享 TS/JS 业务模块会让下次调用加载新代码。React 页面和样式使用热更新。修改 isle.config.ts 后需要手动重启插件开发命令。

开发工具运行器只支持这里声明的工具数组，不模拟完整 Cordis settings/services 生命周期，也不提供生产权限隔离。真实模型、文件权限和安装沙箱应在 Isle 中验证。

CSS 可以直接 import；图片和字体使用模块导入或 CSS 相对引用，打包为 data URL 以符合沙箱 CSP。不要依赖 `/public/...` 地址或浏览器直接访问网络、Node、Tauri。前端可使用普通 React 库，但产物仍受宿主 512 KiB JS / 256 KiB CSS 限制。

不使用聊天的 React UI 自带 React；聊天插件使用宿主共享 React/Chat，避免重复组件运行时。
`--target dsh` 保留工具／技能兼容打包；声明 `chat` 的插件会明确拒绝 DSH 目标，UI 不会自动转换为 `dsh.client`。
旧式工具／技能模板保留为 `plugin:create -- <directory> --template tools`。

## 工具链维护

`src/` 和 `templates/` 是工具链源码；`dist/chat-ui.js`、`dist/chat-ui.css`、`dist/chat-host.js` 由 `pnpm --filter desktop build:chat-ui` 生成并随工具包分发。插件安装后无需 desktop 源码。发布前先构建这些运行时，再打包 SDK、chat-contracts 和 plugin-dev；此流程不自动发布到 npm。

`pnpm --filter desktop test:plugin-dev` 验证仓库外项目安装构建、Node 工具、参数与输出校验、超时恢复、跨环境导入限制、无监听端口的 Vite 转换，以及使用真实 Chat 核心的内存会话。
