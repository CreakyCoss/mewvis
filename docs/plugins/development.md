# Isle 插件工程

`@isle/plugin-dev` 管理 React 启动、开发预览、宿主工具与技能注册、类型检查和安装包构建。
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
├── isle.config.ts        # 权限、UI 和宿主能力配置
├── tsconfig.json         # 继承工具链提供的配置
└── main/
    ├── App.tsx           # 默认导出 React 页面
    ├── styles.css
    ├── contracts.ts      # UI 与宿主共享的数据类型
    └── host/
        ├── tools.ts     # 可选，默认导出工具数组
        └── skills.ts    # 可选，默认导出技能数组
```

页面可以自由拆分为 components、hooks、services；由宿主加载的工具实现和技能定义放在 host。
纯 UI 插件可删除 host 配置及目录；纯工具或技能插件设置 `ui: false`；`host.tools` 和 `host.skills` 可以单独使用。
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

## Agent 访问范围

`isle.config.ts` 的 `agentAccess` 与 `permissions` 同级，打包后原样写入
`package.json` 的 `isle.agentAccess`。`defineConfig` 直接使用协议生成的
`AgentAccess` 类型；打包检查、后端解析使用同一份协议 schema。

`permissions: ["chat"]` 开放对话入口，不隐含文件、网络和进程权限。

使用插件工作区还需声明 `plugin-workspaces`，通过 `getPluginDataClient().workspaces.list/create/get` 获取自己的登记目录。模板已使用这个入口；Chat 不再提供 `listWorkspaces()`，也不能访问宿主默认工作区。通用业务持久化另需 `plugin-data`。这些 SDK 权限检查不会替代目录分配后的标准沙箱和执行权限档位。
`agentAccess` 省略的能力一律不允许；`filesystem.read`、`filesystem.write`
和 `network.hosts` 可显式填 `"all"`，表示仍按宿主策略限制，不额外缩小该项范围。
写入包括创建、修改和删除，编辑现有文件通常还需要读取权限。

路径使用 `{ base, path? }`，`base` 支持 `workspace`、`home`、`temp`。
`path` 只能是基础目录内的相对路径，不接受绝对路径、`..` 或 glob；后端还会检查
符号链接不能逃出基础目录。域名支持精确名称或 `*.example.com`，不接受完整 URL。

宿主在每次请求时从已启用插件的清单注入范围，插件调用接口只选择 `ask / auto / full`，
不能提供或覆盖 `agentAccess`。三档、单次审批和子 Agent 都不能扩大声明范围。
不需要再声明 `workspace-files` 才能使用聊天；这个旧的宿主能力不会转换成 Agent 文件授权。
插件业务文件使用已登记的工作区；宿主管理的配置和数据库通过 SDK 访问，不作为文件权限目录提供。
已声明的插件技能由宿主提供内容，
不会为了读取技能临时文件而扩大业务文件的权限。

此声明限制 Agent 的工具执行。执行程序仍需宿主配置中的系统设备、临时写入目录、
系统运行库和宿主选定的程序/插件资源；这些是执行基础设施，不会授予读取其他用户目录的权限。
当前实现需要开启执行沙箱；关闭审批不影响范围限制。Windows 的有限读取白名单尚未支持，
会明确拒绝启动，不回退到无限制执行。原生插件自身仍是受信任的 Node.js 代码，声明不替代其进程隔离。

## 插件技能

```ts
// isle.config.ts
import { defineConfig } from "@isle/plugin-dev";

export default defineConfig({
  displayName: "文本助手",
  permissions: ["chat"],
  agentAccess: {
    filesystem: {
      read: [{ base: "workspace" }],
      write: [{ base: "workspace", path: "output" }],
    },
    network: { hosts: ["api.example.com"] },
    process: { execute: false },
  },
  host: {
    tools: "./main/host/tools.ts",
    skills: "./main/host/skills.ts",
  },
});
```

```ts
// main/host/skills.ts
import { defineSkill } from "@isle/plugin-sdk";

export default [
  defineSkill({
    name: "example-my-plugin-text-inspection",
    description: "分析文本长度、UTF-8 编码和 SHA-256。",
    content: [
      "用户要求分析文本时，保留原文中的空格与 emoji。",
      "调用 example_my_plugin_inspect_text，把原文传入 text。",
      "按工具结果报告字符数、UTF-8 字节数和 SHA-256，不要编造结果。",
    ].join("\n"),
  }),
];
```

工具链自动生成 `ctx.skills.register()`，补齐宿主需要的默认 `source: "bundled"`，并把技能定义打包进宿主入口。检查会验证技能数组、非空字段、名称格式和重名。技能名称使用小写字母、数字与单个连字符，例如 `example-my-plugin-text-inspection`。React 不导入这个文件。
工具提供可执行动作，技能提供模型使用工具的步骤和规则。注册技能不会授予它使用工具的权限。插件 Chat 可以省略 `allowedToolNames`，由宿主按用户授权选择工具；显式传入时，它只能进一步缩小本场景使用的工具集合。

### 用户选择工具

在「插件管理 → 工具授权」中，用户可以勾选宿主通用工具和该插件自身的工具，不包含其他插件的工具。首次未配置时沿用当前全部工具；保存后使用明确的名单，空名单表示全部禁用，后续新增工具需要重新勾选。

宿主将选择保存在 `plugins/<完整插件 ID>/settings.yaml` 的保留项中：

```yaml
$islePluginSettings: 1
$isleHost:
  tools:
    allowedToolNames:
      - read
      - chat_playground_echo
```

此项只能由宿主管理界面修改。普通 `defineSettings` 命名空间不接受 `$isleHost`；`storage` 的业务增删改查和清空也不会修改它。宿主写入授权与插件写入业务设置使用同一文件锁，保留彼此的数据。插件不需要知道文件路径或 YAML 格式。

声明了 `chat` 权限的插件可以通过只读 SDK 查询最新目录及用户选择，无需创建工作区，也不需要额外申请 `plugin-data`：

```ts
import { getPluginToolClient } from "@isle/plugin-sdk/tools";

const tools = await getPluginToolClient().list();
// [{ name, label, description, source: "host" | "plugin", enabled }]
const allowedToolNames = tools
  .filter((tool) => tool.enabled)
  .map((tool) => tool.name);
```

Node 插件确认 `context.chat` 可用后，使用 `createPluginToolClient(context.chat)`；没有聊天连接的环境会明确报错。开发预览提供本插件的模拟工具目录。

聊天调试台省略场景白名单，由宿主每轮计算「当前可用工具 ∩ 用户勾选工具 ∩ 场景请求工具」，省略场景名单视为不进一步限制。已有会话和恢复的历史会话也会重新检查；授权读取失败时不发起执行，不使用旧授权回退。名单中已下架或未注册的工具不进入提交的工具集合，也不阻止聊天或授权配置保存。宿主不维护技能名称与工具依赖的对应表，不因技能缺少工具提前拒绝聊天。

这里的交集是宿主提交的工具名单。现有 Agent 运行时仍会为内置技能自动补充依赖工具；该行为可能扩大实际可用工具集合，本次没有修改这部分执行逻辑。

修改授权对后续调用和聊天下一轮生效，已经执行的任务继续使用本轮授权。UI 的 `executeTool` 仍只能调用本插件工具，并检查最新勾选结果。工具授权不能替代 `agentAccess`、沙箱与权限档位：禁用 `write` 工具本身不等于禁止其他工具写文件。

默认模板包含完整的文本分析技能和对应工具。安装并启用插件后新建对话，发送页面给出的技能示例请求。现有 Pi 接入会加载插件技能，并按需向模型提供内容；它与技能页维护的可选文件技能目录不同，目前不在 Chat 的技能选择菜单中单独显示。 没有 `read` 工具的会话由宿主把已解析且允许模型使用的插件技能内容加入本轮模型上下文；有 `read` 时继续使用 Pi 原有的按需加载机制，不额外授予文件权限。

`pnpm dev` 从 Node Worker 读取实际技能定义，预览顶部可展开“插件技能定义”。这用于核对名称和内容，不模拟模型遵循技能；模型执行效果需在 Isle 中验证。

## 开发与构建

- `pnpm dev`：只监听本机 `127.0.0.1:5173`，端口被占用时退出，不替换已有服务。可传 `--port 5174`。
- `pnpm check`：检查配置和 TypeScript，分别检查浏览器与 Node 类型环境，并禁止 UI 导入 host 实现。
- `pnpm build`：先检查，再生成 `dist/isle`，包含宿主 JS、沙箱 UI JS/CSS 和安装清单。不会自动安装、启用或发布。

开发页面自动提供 React Refresh、主题切换和内存聊天宿主。聊天核心与 UI 来自 Isle 的同一份实现，仅模型和存储使用测试适配。页面上会标明“内存聊天预览”，刷新清空记录，不调用真实模型、不访问真实工作区。

宿主工具在开发服务的 Node Worker 内执行原始业务代码。页面通过带开发连接令牌的本机接口调用，校验工具归属、输入和输出；最多四个并发请求，超时释放 Worker，下一次请求可以恢复。修改 host 模块会清理旧 Worker 并刷新预览、工具目录和技能定义；修改共享 TS/JS 业务模块会让下次调用加载新代码。React 页面和样式使用热更新。修改 isle.config.ts 后需要手动重启插件开发命令。

开发宿主只加载这里声明的工具与技能数组，不模拟完整 Cordis settings/services 生命周期，也不提供生产权限隔离。真实模型、文件权限和安装沙箱应在 Isle 中验证。

CSS 可以直接 import；图片和字体使用模块导入或 CSS 相对引用，打包为 data URL 以符合沙箱 CSP。不要依赖 `/public/...` 地址或浏览器直接访问网络、Node、Tauri。前端可使用普通 React 库，但产物仍受宿主 512 KiB JS / 256 KiB CSS 限制。

不使用聊天的 React UI 自带 React；聊天插件使用宿主共享 React/Chat，避免重复组件运行时。
`--target dsh` 保留工具／技能兼容打包；声明 `chat` 的插件会明确拒绝 DSH 目标，UI 不会自动转换为 `dsh.client`。
旧式工具／技能模板保留为 `plugin:create -- <directory> --template tools`。

## 工具链维护

`src/` 和 `templates/` 是工具链源码；`dist/chat-ui.js`、`dist/chat-ui.css`、`dist/chat-host.js` 由 `pnpm --filter desktop build:chat-ui` 生成并随工具包分发。插件安装后无需 desktop 源码。发布前先构建这些运行时，再打包 SDK、chat-contracts 和 plugin-dev；此流程不自动发布到 npm。

`pnpm --filter desktop test:plugin-dev` 验证仓库外项目安装构建、Node 工具、技能注册与热更新、参数与输出校验、超时恢复、跨环境导入限制、无监听端口的 Vite 转换，以及使用真实 Chat 核心的内存会话。
