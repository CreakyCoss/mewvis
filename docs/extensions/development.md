# 插件包开发与管理

当前提供仓库内开发、本地目录注册、启停、配置、独立构建和 tgz 打包。所有登记操作只读取元数据，不执行插件；实际代码由 Agent runtime 的执行 worker 加载。桌面已接入插件管理页和聊天命令面板；网络安装和自动解包尚未接入。

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

`build` 从 `src/index.ts` 打包 ESM，输出到 `dist/plugin`；`--out` 可指定尚不存在的自定义输出目录。普通重建会替换约定的 `dist/plugin`。工具会拒绝直接导入 Pi 与宿主内部包，插件应依赖 SDK。该检查帮助维持开发边界，不是恶意代码隔离措施。

`validate` 检查已构建包的清单、入口和配置 schema，不执行代码，也不替代 TypeScript 检查或功能测试。`pack` 重新构建并通过系统 `tar` 生成 `dist/<id>-<version>.tgz`；包内只有构建结果与可选 README、LICENSE，没有项目的脚本、依赖目录或其他工作区文件。此版本要求插件资源可被构建器打包；不支持任意静态目录复制或原生 Node addon。

生成的 tgz 根目录为 `package/`。自行解包后可登记该目录；CLI 当前不直接安装不可信压缩包。打包和登记不运行 npm 安装脚本。

仓库提供两个独立插件包：`apps/extensions/text-stats` 演示工具和内联技能，`apps/extensions/tasks` 演示命令、会话状态和 Agent 事件。桌面构建会将 `apps/extensions/` 下声明 `isle.extension` 的直接子目录打包到 Runtime 的 `dist/extensions/`，作为内置插件自动发现、默认启用。它们仍使用通用插件协议，运行时代码不硬编码插件 ID。独立 SDK 不自动扫描仓库目录，由宿主指定包来源。

## 包清单

插件在自己的 `package.json` 中使用独立字段：

```json
{
  "name": "example.feature",
  "version": "0.1.0",
  "type": "module",
  "isle.extension": {
    "schemaVersion": 1,
    "id": "example.feature",
    "apiVersion": 1,
    "entry": "./index.js",
    "capabilities": ["commands", "session.state"],
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

`entry` 相对于构建产物根目录，只接受包内 `.js/.mjs`；越界路径与指向包外的入口符号链接会被拒绝。源码工程的入口产物可以尚不存在，`build` 完成后再检查。清单标准定义于 `@isle/extension-sdk/manifest.schema.json`。

v1 支持以下能力声明；注册函数和状态 API 会检查它们：

| 能力 | 对应 SDK |
| --- | --- |
| `tools` | `ctx.registerTool` |
| `skills` | `ctx.registerSkill`，当前为内联技能 |
| `commands` | `ctx.registerCommand` |
| `session.state` | `ctx.session.get/set/delete` |
| `events.run` | `ctx.on("run_started" / "run_finished", handler)` |
| `events.tool` | `ctx.on("tool_started" / "tool_finished", handler)` |
| `events.turn` | `ctx.on("turn_started" / "turn_finished", handler)` |
| `events.message` | `ctx.on("message_started" / "message_updated" / "message_finished", handler)` |
| `events.session` | `ctx.on("session_compact_finished", handler)`，当前只包含压缩结果 |
| `middleware.input` / `middleware.system_prompt` | `ctx.use("input" / "system_prompt", handler)` |
| `middleware.context` | `ctx.use("context", handler)` |
| `middleware.tool_call` / `middleware.tool_result` | `ctx.use("tool_call" / "tool_result", handler)` |
| `middleware.session_compact` | `ctx.use("session_compact", handler)`，只允许 continue / block |

这些是必需能力，不支持的声明会报错。宿主配置与 `configuration.defaults` 按顶层键合并，再用 schema 校验，不做字符串到数值的隐式转换，也不做嵌套深度合并。插件读取 `ctx.config` 的只读快照；未声明 schema 的包只能接收空配置。

中间件的返回值、顺序、阻断和错误语义见[插件中间件](middleware.md)。观察器只观察，改写输入或结果必须注册中间件并声明对应能力。消息快照、流式更新、回合身份与取消语义见[消息与回合观察事件](events.md)。

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
2. 打开左侧导航「应用」下方的「插件」，可以直接看到 `isle.tasks` 和 `isle.example`，无需手动添加。内置插件支持启停和 schema 配置，不支持移除；其他插件通过「添加插件」选择已构建的包目录登记。
3. 打开一个工作区聊天，在右侧选择「插件命令」，选择 `isle.tasks/add`，填写任务名称并执行。
4. 在同一面板批准执行后查看结果。通过 `list` 查看任务，通过 `select` 选择任务；下一轮 Agent 运行会更新选中任务的状态。

管理设置保存到产品数据目录的 `extensions.json`。执行命令需要当前聊天，但不依赖模型配置，也不会发送聊天消息；命令与该聊天的 Agent 任务共用队列。面板显示排队、审批、结果和错误，支持取消。刷新后通过原任务 ID 恢复当前服务进程保留的状态，不重放命令；重启服务后不保证恢复任务快照，插件会话数据仍保留。

内置包从当前 Runtime 安装目录的 `extensions/` 读取，用户的启停与配置保存在设置文件的 `bundled` 映射中，以插件 ID 为键，不保存内置包绝对路径。因此更新或移动安装目录后仍保留用户选择。外部包继续记录在 `packages` 数组；重复 ID 会明确报错，不允许静默覆盖内置插件。缺少内置目录时视为空目录，兼容不包含插件的精简 Runtime。

启停和配置从下一次命令发现、命令执行或 Agent 运行开始生效；正在执行的操作保留原快照。命令默认走宿主审批，桌面管理页不提供降低执行风险的配置。表单由 JSON Schema 生成，复杂参数使用 JSON 输入。

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
  extensionPackages: [{
    path: "/absolute/path/tasks/dist/plugin",
    enabled: true,
    config: { maxTasks: 20 },
    commandRisks: { add: "low", list: "low", select: "low", reset: "low" },
  }],
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
