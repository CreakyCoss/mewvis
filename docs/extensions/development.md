# 插件包开发与管理

当前提供仓库内开发、本地目录注册、启停、配置、独立构建和 tgz 打包。所有登记操作只读取元数据，不执行插件；Agent 代码由 runtime 执行 worker 加载，UI 代码由桌面隔离 iframe 加载。桌面已接入插件管理页和会话侧栏插槽；网络安装和自动解包尚未接入。

## 创建与构建

在仓库根目录执行：

```sh
pnpm extension create apps/extensions/my-feature --id example.feature
pnpm install --ignore-scripts
pnpm extension build apps/extensions/my-feature
pnpm extension validate apps/extensions/my-feature/dist/plugin
pnpm extension pack apps/extensions/my-feature
```

`create` 要求目标目录不存在，父目录需已存在；生成 `package.json` 和 `src/index.ts`。仓库文档统一写入 `docs`，不在插件源码目录生成 README。当前生成的依赖使用 `workspace:*`，用于本仓库开发，SDK/工具包尚未发布到 npm。

`build` 按声明从 `src/index.ts`（Agent / Node）和 `src/ui.ts`（UI / 浏览器）分别打包 ESM，输出到 `dist/plugin`；`--out` 可指定尚不存在的自定义输出目录。普通重建会替换约定的 `dist/plugin`。工具会拒绝直接导入 Pi 与宿主内部包，插件应依赖 SDK。该检查帮助维持开发边界，不是恶意代码隔离措施。

`validate` 检查已构建包的清单、入口和配置 schema，不执行代码，也不替代 TypeScript 检查或功能测试。`pack` 重新构建并通过系统 `tar` 生成 `dist/<id>-<version>.tgz`；包内只有构建结果与可选 README、LICENSE，没有项目的脚本、依赖目录或其他工作区文件。此版本要求插件资源可被构建器打包；不支持任意静态目录复制或原生 Node addon。

生成的 tgz 根目录为 `package/`。自行解包后可登记该目录；CLI 当前不直接安装不可信压缩包。打包和登记不运行 npm 安装脚本。

仓库提供三个独立插件包：`apps/extensions/text-stats` 演示工具和内联技能，`apps/extensions/tasks` 演示命令、会话状态和 Agent 事件，`apps/extensions/session-insights` 演示纯 UI 会话统计。桌面构建会将 `apps/extensions/` 下声明 `isle.extension` 的直接子目录打包到 Runtime 的 `dist/extensions/`，作为内置插件自动发现、默认启用。它们仍使用通用插件协议，运行时代码不硬编码插件 ID。独立 SDK 不自动扫描仓库目录，由宿主指定包来源。

## 包清单

插件在自己的 `package.json` 中使用独立字段：

```json
{
  "name": "example.feature",
  "version": "0.1.0",
  "type": "module",
  "isle.extension": {
    "schemaVersion": 2,
    "id": "example.feature",
    "apiVersion": 1,
    "modules": {
      "agent": {
        "entry": "./index.js",
        "capabilities": ["commands", "session.state"]
      }
    },
    "configuration": {
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "required": ["limit"],
        "properties": { "limit": { "type": "integer", "minimum": 1 } }
      },
      "defaults": { "limit": 100 }
    }
  }
}
```

可执行模块的 `entry` 相对于构建产物根目录，只接受包内 `.js/.mjs`；越界路径与指向包外的入口符号链接会被拒绝。源码工程的入口产物可以尚不存在，`build` 完成后再检查。清单标准定义于 `@isle/extension-sdk/manifest.schema.json`。

清单只接受 v2 的模块化结构，`entry` 与 `capabilities` 必须放在对应模块内。`modules.agent` 使用以下 API v1 能力声明；注册函数和状态 API 会检查它们：

| 能力                                              | 对应 SDK                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `tools`                                           | `ctx.registerTool`                                                            |
| `skills`                                          | `ctx.registerSkill`，当前为内联技能                                           |
| `commands`                                        | `ctx.registerCommand`                                                         |
| `session.state`                                   | `ctx.session.get/set/delete`                                                  |
| `events.run`                                      | `ctx.on("run_started" / "run_finished", handler)`                             |
| `events.tool`                                     | `ctx.on("tool_started" / "tool_finished", handler)`                           |
| `events.turn`                                     | `ctx.on("turn_started" / "turn_finished", handler)`                           |
| `events.message`                                  | `ctx.on("message_started" / "message_updated" / "message_finished", handler)` |
| `events.session`                                  | `ctx.on("session_compact_finished", handler)`，当前只包含压缩结果             |
| `middleware.input` / `middleware.system_prompt`   | `ctx.use("input" / "system_prompt", handler)`                                 |
| `middleware.context`                              | `ctx.use("context", handler)`                                                 |
| `middleware.tool_call` / `middleware.tool_result` | `ctx.use("tool_call" / "tool_result", handler)`                               |
| `middleware.session_compact`                      | `ctx.use("session_compact", handler)`，只允许 continue / block                |

这些是必需能力，不支持的声明会报错。宿主配置与 `configuration.defaults` 按顶层键合并，再用 schema 校验，不做字符串到数值的隐式转换，也不做嵌套深度合并。插件读取 `ctx.config` 的只读快照；未声明 schema 的包只能接收空配置。

中间件的返回值、顺序、阻断和错误语义见[插件中间件](middleware.md)。观察器只观察，改写输入或结果必须注册中间件并声明对应能力。消息快照、流式更新、回合身份与取消语义见[消息与回合观察事件](events.md)。

SDK 源包使用下文的 `isle.extension` 清单。构建产物统一转换成宿主原生 `isle.plugin` 清单和 `protocolVersion: 1` 入口，宿主不直接加载旧 SDK 构建产物；修改后重新构建即可。直接编写原生插件见[宿主原生插件系统](native-host.md)。

## UI 模块与会话插槽

插件可只实现 `modules.ui`，也可同时声明 `agent` 与 `ui`。至少提供一个模块，不同模块不能共用入口文件。登记时校验全部入口，运行时只检查目标模块的入口文件；缺失 UI 产物不会阻断 Agent 入口加载。当前只支持这两个可执行模块；`modules.host`、任意扩展域、导航和完整页面插槽尚未开放。宿主服务需求通过清单顶层 `host.required/optional` 声明，未知能力会拒绝加载。

```json
{
  "schemaVersion": 2,
  "id": "example.insights",
  "apiVersion": 1,
  "host": { "required": ["session.read"] },
  "modules": {
    "ui": {
      "entry": "./ui.js",
      "contributions": [
        {
          "id": "overview",
          "type": "sidebar",
          "slot": "session.sidebar",
          "title": "会话统计",
          "icon": "chart",
          "view": { "id": "overview" }
        }
      ]
    }
  }
}
```

上述内容放入 `package.json` 的 `isle.extension` 字段。`src/ui.ts` 使用浏览器专用 SDK，不依赖 React 或具体 Agent：

```ts
import { defineUIExtension } from "@isle/extension-sdk/ui";

export default defineUIExtension({
  id: "example.insights",
  apiVersion: 1,
  mount(root, ctx) {
    const button = document.createElement("button");
    button.textContent = "查看消息数";
    const read = async () => {
      try {
        const snapshot = await ctx.host.session.read();
        if (!ctx.signal.aborted)
          button.textContent = `返回 ${snapshot.messages.length} 条消息`;
      } catch (error) {
        if (!ctx.signal.aborted) button.textContent = String(error);
      }
    };
    button.addEventListener("click", read);
    root.append(button);
    return () => button.removeEventListener("click", read);
  },
});
```

插槽定义由 `@isle/extension-sdk/ui` 提供，不在桌面页面内定义。目前协议有两类：

| 插槽 key          | 类型      | 贡献内容                                                       | 当前桌面状态           |
| ----------------- | --------- | -------------------------------------------------------------- | ---------------------- |
| `session.sidebar` | `sidebar` | 必需 `id`、`title`、`icon`、`view: { id }`，渲染模块的 UI 入口 | 已适配并挂载在聊天侧栏 |
| `session.status`  | `text`    | `id`、`text`、可选 `tone`（neutral/info/warning）              | 已适配，页面尚未挂载   |

作者代码可通过共享定义创建贡献，避免重复输入插槽 key/type：

```ts
import {
  defineUIContribution,
  uiSlotDefinitions,
} from "@isle/extension-sdk/ui";
const contribution = defineUIContribution(uiSlotDefinitions.sessionSidebar, {
  id: "overview",
  title: "会话统计",
  icon: "chart",
  view: { id: "overview" },
});
```

结果可序列化到清单的 `modules.ui.contributions`；静态 JSON 仍须填写协议 key/type，并由 Schema 校验。可用图标为 `chart`、`files`、`git-branch`、`activity`、`puzzle`、`info`，不接受任意 HTML 或 React 组件。`view.id` 传入 UI 模块的 mount 上下文，由插件选择对应视图。

清单字段统一使用 `contributions`，不接受旧 `panels`。同一 UI 模块内贡献 ID 必须唯一，贡献的 `slot` 与 `type` 必须匹配协议。当前文本为静态纯文本，不解释 HTML；动态数据看板使用侧栏 UI 入口和已有数据接口。

纯文本模块无需 `src/ui.ts` 或 `entry`，也可以单独构建和安装：

```json
"ui": {
  "contributions": [
    { "id": "status", "slot": "session.status", "type": "text", "text": "插件已启用", "tone": "info" }
  ]
}
```

安装并不保证展示：页面决定是否挂载 `SidebarSlot`、`TextSlot` 或通用 `ExtensionSlot`，以及 render 是否返回内容。Slot 按类型提供可靠参数，页面控制布局；同一贡献可以在多处以不同样式显示。宿主通过 `useExtensionSlotStatus` 查看挂载数量，插件 iframe 当前没有这个诊断接口。侧栏贡献需要 UI `entry`，其作者接口仍使用 `defineUIExtension`。页面渲染示例见[SDK 页面挂载](sdk.md#定义与页面挂载)。

每个声明面板在打开时创建独立 UI 实例，`ctx.contributionId` 标识贡献，`ctx.viewId` 标识清单引用的具体视图，`ctx.config` 是只读配置快照。宿主提供样式变量，插件负责面板内容；切换或关闭面板会销毁 iframe 与数据租约。进程或页面直接销毁时不保证清理回调完成，不要依赖它持久化数据。

UI 在 `sandbox="allow-scripts"` 的独立源 iframe 中执行，通过 MessageChannel 请求服务，不能直接访问宿主 DOM、认证信息或通用命令接口。当前仅支持不超过 1 MiB 的自包含浏览器 ESM，没有静态资源目录或任意网络请求接口；Node 内置依赖会在构建时被拒绝。这是 UI 隔离，不是 Agent Worker 的 OS 进程沙箱；只安装信任的可执行插件。

`session.read` 绑定当前面板的会话，插件不能传入工作区路径或其他会话 ID。返回稳定 DTO：共享的用户/助手消息（id、role、text、timestamp）和关联运行（id、status、startedAt、endedAt）。不返回私有消息、系统提示词、原始 metadata 或账本路径。最多返回最近 1000 条消息和 1000 条运行，单条文本最多 8000 字符；发生截断时 `truncated` 为 true。未声明该能力的 UI 仍可展示静态内容，但读取被拒绝。

原生插件 `session-ledger` 通过 `ctx.services` 使用独立的 `session.ledger.read` 能力查看运行链路、指令、上下文和工具记录，通过可选的 `session.summarize` 获取一次性摘要。摘要不会写回会话、触发压缩或进入后续上下文；需要宿主配置可用模型。能力缺失、错误与取消约定见[宿主服务协议与适配](host-services.md)。

`session-insights` 从该接口计算消息数、运行数、失败数与累计时间，通过按钮刷新；目前没有工具明细、token 统计或数据变更订阅。纯 UI 插件不会向 Pi / Mock 注入空插件，也不要求配置模型。

## 本地登记与启停

以任务清单为例：

```sh
pnpm --filter @isle/extension-tasks build
pnpm extension add apps/extensions/tasks/dist/plugin --settings /absolute/path/extensions.json
pnpm extension list --settings /absolute/path/extensions.json
pnpm extension disable isle.tasks --settings /absolute/path/extensions.json
pnpm extension enable isle.tasks --settings /absolute/path/extensions.json
```

设置文件由宿主选择，不内置到插件包，也不使用聊天输入决定路径。`add` 保存本地包目录的绝对路径引用，不复制文件。重复 ID 拒绝登记。禁用的包不加载，可以先禁用损坏或丢失的包，再处理文件问题。

配置文件例如 `{ "maxTasks": 20 }`，通过以下命令替换宿主覆盖配置：

```sh
pnpm extension configure isle.tasks --config /absolute/path/tasks-config.json --settings /absolute/path/extensions.json
pnpm extension remove isle.tasks --settings /absolute/path/extensions.json
```

`remove` 只移除登记，不删除源包或会话数据。设置更新使用文件锁和原子替换，校验失败不会覆盖原设置；进程异常退出后遗留锁需在确认旧进程退出后人工清理。

## 桌面使用

1. 正常启动桌面开发项目或构建桌面包；构建链会同时构建内置插件。
2. 打开左侧导航「应用」下方的「插件」，可以直接看到 `isle.tasks`、`isle.example`、`isle.session-insights` 和 `isle.session-ledger`，无需手动添加。内置插件支持启停和 schema 配置，不支持移除；其他插件通过「添加插件」选择已构建的包目录登记。
3. 插件的启停和配置统一在插件管理页完成。提供 UI 贡献的插件会在已挂载的插槽中展示，例如工作区聊天右侧的「会话统计」。

管理设置保存到产品数据目录的 `extensions.json`。聊天侧栏不内置通用插件命令面板；命令能力保留在宿主 SDK、协议和 Agent 适配器中。有交互需求时可在后续通过插件扩展 UI，并按需增加受控宿主接口。

内置包从当前 Runtime 安装目录的 `extensions/` 读取，用户的启停与配置保存在设置文件的 `bundled` 映射中，以插件 ID 为键，不保存内置包绝对路径。因此更新或移动安装目录后仍保留用户选择。外部包继续记录在 `packages` 数组；重复 ID 会明确报错，不允许静默覆盖内置插件。缺少内置目录时视为空目录，兼容不包含插件的精简 Runtime。

UI 插件启停与配置通过宿主事件刷新侧栏并卸载旧视图；旧的数据租约立即撤销，包括尚未返回的查询。外部 CLI 修改设置后，重新聚焦窗口会刷新目录；数据请求自身也重新检查启用状态与配置。Agent 模块的启停和配置从下一次命令发现、命令执行或 Agent 运行开始生效；正在执行的操作保留原快照。命令默认走宿主审批，桌面管理页不提供降低执行风险的配置。配置表单由 JSON Schema 生成，复杂配置使用 JSON 输入。

## 宿主 SDK 接入

`createAgentRuntime` 可接受两种包来源：

```js
const runtime = createAgentRuntime({
  extensionSettingsPath: "/absolute/path/extensions.json",
  bundledExtensionsPath: "/absolute/path/runtime/extensions", // 可选
});
```

或直接由宿主传入包：

```js
const runtime = createAgentRuntime({
  extensionPackages: [
    {
      path: "/absolute/path/tasks/dist/plugin",
      enabled: true,
      config: { maxTasks: 20 },
      commandRisks: { add: "low", list: "low", select: "low", reset: "low" },
    },
  ],
});
```

`commandRisks` 和 `toolRisks` 是宿主审核后的配置，包清单不能设置它们；缺省时仍走未知副作用的审批流程。CLI 登记不会自动降低风险。运行权限继续由现有 `permissions` 与 `agentAccess` 控制。

需要通过代码管理设置时，SDK 导出 `createExtensionPackageManager(settingsPath, { bundledPath })`，提供 `list/add/configure/remove/resolve`；第二个参数可省略。list 返回的 source 区分 bundled 与 local。`add` 和 `configure` 的配置也可包含宿主审核后的风险映射。

直接使用公共 SDK 时，在创建 runtime 时解析启用的包并快照配置；修改设置后应关闭旧 runtime、重新创建实例。桌面使用的 stdio CLI 由宿主设置 `ISLE_EXTENSION_SETTINGS_PATH` 和 `ISLE_BUNDLED_EXTENSIONS_PATH`，每次操作合并内置包、用户覆盖配置与外部登记，允许复用进程。同一会话的 Agent 和命令执行复用插件实例；新配置在下一操作替换实例，不修改执行中的快照。

包目录是开发用本地引用，文件变化不受哈希锁定。宿主会在下一操作检测入口 stat 变化并重建插件实例，不递归监视依赖；升级或重建应在停止使用后进行。插件的 `onActivate` 和 `own` 对应实例激活与释放，不能依赖每轮重新运行 setup。退出时调用 `runtime.shutdown()`；需要提前释放单个会话时调用 `runtime.extensions.releaseSession(target)`，它保留已提交状态。更完整的约定见[Pi 兼容基准与协议规格](pi-compatibility.md)。

原先 `extensions: [{ id, entry }]` 仍可用于内部测试和直接接入。包列表、设置文件和直接入口合并后出现重复 ID 会报错。新增产品插件优先使用完整包协议。桌面插件启用列表是产品级设置；尚未实现会话级覆盖配置。

## 验证

```sh
pnpm test:extensions
pnpm --filter @isle/server test:extensions
```

测试涵盖真实 CLI 构建与打包、清单和路径边界、设置并发与回滚，以及同一任务清单包在真实 Pi SDK 和脚本 Mock 中的工作流。Pi 使用本地 SSE 模型桩，无需模型账号。完整可运行宿主示例见[宿主插件最小闭环](../runtime/extensions.md)。

桌面后端闭环测试使用真实 stdio worker，覆盖包管理、审批通过与拒绝、任务结果恢复、Pi 更新状态以及复用 worker 后读取新配置。

原生 Agent 接入使用 SDK 的 `ExtensionAdapter<TNativePlugin>`，详见[原生插件适配](../runtime/extensions.md#原生插件适配)。闭环测试还验证 Pi 原生斜杠命令、Mock 原生命令、工具事件映射以及能力适配诊断。

### UI 插槽验证

运行 `pnpm --filter client test:extensions` 检查具体 Slot 的类型约束、通用入口的类型推导、数据筛选、按需渲染、不同布局及作用域、空状态和错误处理。使用桌面 Web 开发服务时，打开 `/scripts/extensions/fixtures/ui-slots.html` 可验证同一贡献在卡片与折叠布局中的独立状态、会话切换、停用和卸载清理；测试页位于 scripts 下，不进入生产路由。夹具启用 React StrictMode，挂载计数在重复 effect 检查后仍应保持正确。
