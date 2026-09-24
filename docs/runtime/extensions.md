# 宿主插件最小闭环

状态：SDK 已支持工具、内联技能、显式命令、会话状态和 Agent 事件订阅；独立插件包已支持清单、本地注册、配置、启停与开发 CLI。Pi 和脚本 Mock 共用执行入口。桌面已有本地插件管理页与 `session.sidebar` UI 插槽。清单 v2 可按需声明 Agent 与 UI 入口，UI 通过受控接口读取当前会话；尚未提供市场、任意 UI 插槽、运行中代码热替换或 Pi 原生插件兼容。包开发见[插件包开发与管理](../extensions/development.md)，能力路线见[插件协议与能力映射](../architecture/extensions.md)。

## 运行示例

在仓库根目录执行：

```sh
pnpm --filter @isle/agent-runtime test:extensions
```

脚本在临时目录构建 SDK、测试插件和 worker，用真实 Pi SDK、本地 SSE 模型桩以及脚本 Mock 调用同一个临时回显工具，不访问外部模型服务，不需要 API Key。临时目录在结束后清理。

输入 `你好🌍\nIsle`，两个 Agent 的工具结果均为：

```json
{ "echo": "你好🌍\nIsle", "calls": 1 }
```

同时验证参数和能力检查、名称冲突、工具白名单、审批拒绝和通过、并发运行隔离、生命周期清理、取消、真实 OS 沙箱、技能注入、SDK 注册表隔离及会话落盘。启用的沙箱不可用时测试失败，不降级跳过。

会话实例测试验证同一实例跨命令、Mock 和真实 Pi 复用、不同会话隔离、同会话操作排队、配置/沙箱/入口变更重建、每次调用独立审批与工具筛选、取消恢复和退出清理。Pi 版本与 API 文件变化会触发基准检查，具体范围见[Pi 兼容基准与协议规格](../extensions/pi-compatibility.md)。

## 开发契约

公共类型位于 `@isle/extension-sdk`，不导出 Pi 或 Chord 的内部类型。插件默认导出 `defineExtension()` 的结果，声明 `id`、`apiVersion: 1` 和同步 `setup`：

```ts
import { defineExtension } from "@isle/extension-sdk/agent";

export default defineExtension({
  id: "example.greeting",
  apiVersion: 1,
  setup(ctx) {
    ctx.registerTool({
      name: "hello",
      label: "问候",
      description: "生成问候文本。",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      async execute(input, { signal }) {
        signal.throwIfAborted();
        return {
          content: [{ type: "text", text: `你好，${input.name}` }],
          details: {},
        };
      },
    });
  },
});
```

`registerSkill` 注册 `{ name, description, content }` 内联技能，`onActivate` 注册异步初始化，`own` 注册清理函数。资源只能在同步 setup 中声明；资源分配尽量放在激活阶段，并在 setup 提前登记对应清理。

`registerCommand` 注册 `{ name, description, parameters, execute }` 显式命令；`ctx.on(type, handler)` 订阅标准 Agent 事件；`ctx.session.get/set/delete` 访问当前插件的会话 JSON 状态。命令 ID 为 `extensionId/commandName`，可通过宿主 SDK 或协议调用，不自动解析斜杠指令，也不会注册为模型工具。命令输入和返回值必须为 JSON，参数在宿主和 worker 双重校验。`ExtensionSource.commandRisks` 与工具风险配置一样由宿主审核提供；未声明时按未知副作用处理，沿用现有审批流程。

工具 schema 使用 JSON Schema object，输入、输出和进度必须是 JSON。第一版输出支持文本 content 和 JSON details。插件不直接声明执行风险；宿主可在审核后用 `ExtensionSource.toolRisks` 配置，未配置的工具按未知副作用处理。

插件工具的完整身份是 `extensionId/toolName`；模型可见名称由 `extensionToolName()` 生成，例如 `ext_example_greeting__hello`。插件 ID 中的点和连字符转换为下划线，转换后发生冲突或名称超过 64 字符时拒绝加载，不覆盖已有工具。

## 宿主接入

产品插件优先通过 `extensionPackages` 或 `extensionSettingsPath` 加载独立包。以下保留直接入口接入方式，用于内部测试或宿主自管打包：把插件预先打包为本地 ESM `.js` 或 `.mjs`，通过 SDK 传入绝对入口路径。路径不是 prompt、聊天请求或模型提供的参数；依赖应一起打包，避免收紧文件权限后读取包外依赖。

执行 `pnpm build:runtime` 后，`apps/agent-runtime/dist/sdk.js` 导出 SDK。SDK 与执行 worker 必须一起部署，保持 dist 内的相邻布局；运行时构建包含仓库内置插件。以下代码在 Node 宿主中执行（导入路径按宿主位置调整）：

```ts
import {
  createAgentRuntime,
  createScriptedMockRuntime,
} from "./apps/agent-runtime/dist/sdk.js";

const tool = "ext_example_greeting__hello";
const mock = createScriptedMockRuntime("greeting-mock", [
  { type: "tool", name: tool, input: { name: "Isle" } },
]);

const runtime = createAgentRuntime({
  runtimeAgents: [mock],
  extensions: [
    {
      id: "example.greeting",
      entry: "/absolute/path/greeting.mjs",
      toolRisks: { hello: "low" }, // 宿主审核后的配置
    },
  ],
  callbacks: { onEvent: (event) => console.log(event) },
});

await runtime.agent.run({
  runtimeId: "greeting-mock",
  taskId: "greeting-demo",
  workspacePath: "/absolute/path/workspace",
  userMessage: "向 Isle 问好",
  resources: { tools: { allowed: [tool] } },
});
```

换成 `runtimeId: "pi"` 并提供现有 `runtimeModel` 配置即可交给 Pi 使用同一插件。注册表是每个 SDK 实例独立的；额外注册不能覆盖内置 Pi 或 Mock ID。原有 `mock` 保持原有模拟行为，需要执行真实插件时注册 `createScriptedMockRuntime()` 返回的 Agent。

自定义 Agent 实现 `AgentRuntime` 并提供 `extensionAdapter`。适配器通过 SDK 的 `defineExtensionAdapter<TNativePlugin>()` 声明协议版本、逐项能力映射和 `adapt(bindings, context)`，返回该 Agent 可直接注册的原生插件或插件工厂。`context.extensions` 只依赖 SDK 的 `ExtensionBindings`，不暴露 worker、状态文件或运行时宿主内部类型。

原型中的 `supportsExtensions` 和 `extensionCapabilities` 已由 `extensionAdapter` 替代。插件包仍通过清单声明所需能力；宿主在启动 worker 前检查适配器映射，缺少映射或显式 `error` 时失败。`simulate`、`ignore`、`noop` 必须填写原因；后两者在报告中标为降级。映射描述声明行为，具体模拟、忽略或空实现由适配器的原生插件工厂兑现，SDK 不凭一个字符串自动模拟底层 Agent。可通过 `callbacks.onExtensionAdaptation` 获取每轮报告，当前桌面没有单独的适配报告面板。

低层引擎统一使用 `createAgentEngine({ registry, getExtensionSources: () => sources })`，每次 Agent 运行获取并快照插件列表；公共 SDK 的固定列表由宿主入口转换成 provider。低层引擎同样接受 `runAgent(command, { signal, emit, callbacks })` 取消信号；它的注册表由 `createRuntimeAgentRegistry()` 创建。用完后调用 `engine.dispose()`，公共 SDK 则调用 `runtime.shutdown()` 释放会话插件进程。

## 原生插件适配

SDK 将声明数据与调用接口分开：`ExtensionCatalog` 是可序列化的贡献目录，`ExtensionBindings` 提供带协议版本的工具执行、命令执行和事件投递接口。`ExtensionAdapter<TNativePlugin>` 的返回类型由目标 Agent 决定，公共协议不导入 Pi 类型。现有 worker 实现绑定接口，参数校验、审批、取消和状态事务继续在宿主执行。

| 当前能力         | Pi 注册方式                                                            | Mock 注册方式                         |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| 工具             | 原生 `registerTool`，执行时调用宿主绑定                                | `addTool`，脚本按名称调用             |
| 命令             | 原生 `registerCommand`，参数为 JSON 对象文本，结果写入自定义消息       | `addCommand`，脚本 `command` 步骤调用 |
| 内联技能         | 原生 `before_agent_start` 注入系统提示（模拟）                         | 注册指令（模拟）                      |
| 工具事件         | 原生 `tool_execution_start/end` 映射到 Isle 事件                       | Mock 原生工具观察器                   |
| 消息与回合事件   | 原生 message / turn 钩子映射为 Isle 快照                               | Mock 原生消息与回合观察器             |
| 压缩前决策与结果 | 原生 session_before_compact / session_compact / session_compact_failed | Mock 原生 beforeCompact / onCompact   |
| 运行事件与状态   | Isle 运行边界与会话事务服务（模拟）                                    | 同一宿主服务（模拟）                  |

Pi 原生命令由适配器注册。这是适配器在 Pi 内部提供的注册；桌面聊天输入框仍未提供插件斜杠解析，也不内置通用命令面板。

工具观察不再从 UI 事件重复转发，避免同一次调用重复更新插件状态。取消后跳过普通观察事件；持久会话的运行终态恢复仍由宿主处理。当前已接入会话实例、输入/上下文/工具中间件及压缩决策，具体契约见[插件中间件](../extensions/middleware.md)和[会话压缩钩子](../extensions/session-control.md)；外部插件导入层仍未实现。

## 会话状态与事件

状态由宿主保存到 `<sessionRootDir>/extensions/<extensionId>.json`。插件只获得自己的 JSON 命名空间，不通过 API 获得存储路径；开启沙箱时禁止 worker 直接访问当前会话的插件状态目录。命令要求绝对路径 `sessionRootDir`；Agent 未传入该路径时，状态仅在该轮内存中存在。插件模块中的普通变量可跨同一存活实例的多轮运行，但不会持久化，也不会在事务异常时回滚。

每次工具、命令、事件或中间件处理获得最新快照，成功后提交，异常或提交前取消则丢弃本次 JSON 修改。`get` 与 `set` 都复制值；只能在处理函数内访问状态，不能在 setup、激活或处理结束后的后台任务中访问。一个插件的同一观察事件有多个处理函数时，它们属于同一个事务；中间件每个处理器单独提交，返回值验证失败也回滚。文件、网络等外部副作用不参与回滚。

同会话同插件的操作串行执行，跨进程通过文件锁协调；不同插件使用不同文件和锁，耗时工具不会锁住另一个插件的状态。跨进程争锁有有限等待时间，超时明确报错。每个插件的状态上限为 1 MiB，文件通过原子替换写入；没有 fsync 掉电持久性承诺。损坏或版本不支持的文件会报错，不静默覆盖。

宿主异常退出可能留下锁文件：确认旧进程退出后人工清理对应 `.lock`。当前不自动偷锁、重放操作或恢复 Agent 运行。

事件由 Isle 归一化，不暴露 Pi 原生事件类型：

| 事件                                                       | 内容                                               |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `run_started`                                              | 运行 ID、Agent runtime ID                          |
| `tool_started`                                             | 运行 ID、调用 ID、工具名                           |
| `tool_finished`                                            | 上述标识、是否错误                                 |
| `run_finished`                                             | 运行 ID、completed / failed / cancelled            |
| `turn_started` / `turn_finished`                           | 本次运行的回合索引；结束时含助手消息和工具结果快照 |
| `message_started` / `message_updated` / `message_finished` | 具有稳定 ID 的消息快照；更新时可含流式 delta 提示  |
| `session_compact_finished`                                 | 压缩尝试 ID、触发原因、结果状态、摘要或错误信息    |

消息 ID、内容块、回合编号与 Mock 脚本语义见[消息与回合观察事件](../extensions/events.md)。

当前事件用于观察，不支持替换参数、修改模型上下文或阻止调用。工具事件由 Agent 的原生插件钩子映射，UI/会话记录仍消费原来的运行时事件。SDK 的 Agent 调用返回前等待终态通知，所以 UI 收到原有 Done 事件时，插件状态可能仍在提交中。普通处理异常通过 `callbacks.onExtensionError` 报告并回滚本次状态，不中断 Agent 或其他订阅者。worker 进程退出或超时属于共享执行资源故障，可能同时影响该 worker 中的其他调用。

取消可能销毁 worker。存在持久会话时，宿主创建新 worker 尝试投递终态事件，只恢复事件处理，不重放工具或命令。事件不是可靠消息队列；宿主崩溃、锁超时或恢复失败时不保证终态送达。

## 执行和生命周期

```text
SDK 提供插件入口
→ 按规范化会话目录排队借用实例（无会话时临时创建）
→ 首次借用：worker 导入插件，Chord 装配并激活 facet
→ 复用贡献目录，每次操作创建新的受控 bindings
→ Isle 应用本轮工具与技能白名单
→ 适配器生成 Pi 原生插件工厂 / Mock 插件
→ Agent 按自身标准注册，驱动工具、命令、技能和工具事件
→ 共享入口校验最终参数和权限，必要时审批
→ worker 执行，返回统一结果与进度
→ Agent 发出标准事件，Isle 记录会话
→ 本轮结束，归还实例；失效、显式释放或退出时释放 facet 和 worker
```

插件代码的导入、setup、激活和执行均发生在执行 worker 中，沿用现有程序执行配置。开启沙箱时受 OS 隔离约束；明确关闭沙箱时与现有工具相同，在普通子进程执行。Chord 的 facet 负责生命周期，不提供沙箱隔离。

插件列表作用于 SDK 实例内的 Agent 运行和显式插件命令；同一会话共用插件实例，不同会话隔离。同会话操作按序执行；不同 runtime 或进程仍是不同实例，只共享持久状态。宿主命令发现使用短进程，发现阶段的实例会在输入关闭后释放，不与执行进程共用闭包。

`resources.tools.allowed` 省略或为 null 时允许插件贡献的工具，空数组禁用所有插件工具；`resources.skills.enabled` 同样按完整技能 ID 过滤，空数组禁用插件技能。这些筛选每次操作重新应用，不控制命令或事件订阅。Pi 适配器通过原生 `before_agent_start` 将已启用内联技能加入系统提示；Mock 将其保存为注册指令，脚本本身不执行模型推理。

来源、配置、能力或风险声明、入口 stat、最终沙箱策略变化时，下一操作先释放旧实例再创建新实例。入口检查不递归追踪依赖文件；请使用独立构建产物。`runtime.extensions.releaseSession({ workspacePath, sessionRootDir })` 可主动释放某一会话内存，保留持久状态；SDK 不自行定时回收实例，宿主应在会话不用时调用它，并在退出时调用 `shutdown()`。桌面沿用 supervisor 的空闲进程回收策略。

工具执行前复制参数；宿主风险配置不由 worker 的声明覆盖。Pi 的安全钩子把插件工具交给共享入口检查，避免重复审批。输入 schema 在宿主和 worker 都校验。初始化、工具、命令和单个插件事件投递各有 60 秒 RPC 超时；取消或超时关闭 worker，不重放不确定的调用，同一轮重复调用 ID 会被拒绝。

正常释放实例和激活失败时由 Chord 释放登记资源，`own` 不再随每一轮完成触发。强制终止不保证插件清理回调完成，因此外部写入仍需插件自己设计恢复语义。会话事件、分叉和切换钩子仍待实现。

## 当前边界与源码

宿主模块统一入口为 `apps/agent-runtime/src/extensions/index.ts`，直接定义 `ExtensionRuntime` 接口并实现唯一创建入口 `createExtensionRuntime()`，管理实例所有权与生命周期。`types.ts` 保存操作、命令及诊断类型；通用注册执行和资源/事件/中间件校验已集中到 `packages/extension/host/agent/registration`；当前 Runtime 的命令装配、会话池、状态事务和进程沙箱仍位于 `capabilities/commands.ts`、`session/`、`execution/`。宿主通过 `ExtensionRuntime.open()` 借用单次操作，使用 `ExtensionOperation.finish()` 声明 Agent 运行终态，并在 finally 中 dispose。会话池、状态目录与 worker 恢复不会暴露给 Agent 执行模块；目录与职责见[插件协议与能力映射](../architecture/extensions.md)。SDK 对外的 `runtime.extensions` 命令接口保持不变。

- `packages/extension/sdk`：插件开发契约。
- `packages/extension/host`：包清单校验、本地登记、配置与启停。
- `packages/extension/dev`：创建、构建、校验、打包及管理 CLI。
- `apps/agent-runtime/src/extensions`：Chord 宿主、worker、共享执行入口、命令与状态存储。
- `apps/extensions`：仓库内置的角色协作、智能判断、会话统计和会话链路插件。
- `apps/agent-runtime/src/engines/drivers/native/agent/runtimes`：Pi、Mock 和可注入注册表。
- `apps/agent-runtime/scripts/extensions-e2e.mjs`：可直接运行的闭环验证。
- `apps/agent-runtime/scripts/extensions-session-test.mjs`：会话实例复用、失效、取消和清理测试。
- `apps/agent-runtime/scripts/extensions-middleware-test.mjs`：原生中间件串联、真实模型请求、阻断、错误、最终参数/权限检查及取消测试。

现有 Pi 内置工具和 Application 工具保留原执行链；尚未完成全部工具目录的迁移。桌面通过宿主管理的 `extensions.json` 提供插件来源，stdio 新增 `extensions/commands/list` 和 `extensions/commands/execute`；前端不能在执行请求中提供插件路径或风险授权。插件工具目录尚未并入桌面全局工具选择器。插件接入主 Agent 运行与手动压缩，Pi 内部子 Agent、重建和独立摘要维护操作尚未接入。

命令可通过宿主 SDK 查看任务状态，桌面不内置通用执行面板。后续增加会话级启用配置、多模态消息编辑、会话控制钩子、更多 UI 插槽等能力。Application 的归属与加载机制继续遵循[应用与宿主插件边界](../architecture/extensibility.md)。
