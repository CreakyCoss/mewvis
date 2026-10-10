# Mewvis 开发指南

从一个小需求开始，使用已有的模型、聊天和数据能力，做出自己的 AI 应用。

推荐顺序：先运行项目并体验示例，再完成一个内置应用；随后学习独立维护外部应用，或挑战公共扩展与底层 Agent。

## 理解项目定位

**Mewvis 是一个可扩展的 AI 应用基座。** 它把模型配置、Agent 执行、聊天界面、会话管理、业务数据、工作区、权限和应用管理组合成一个可以运行的产品，提供桌面和本机 Web 两种入口。

例如，开发一个“笔记助手”时，你主要负责笔记列表、编辑界面、笔记存储和 AI 摘要流程。模型连接、聊天、会话保存等基础能力可以通过 SDK 复用。

你可以在三个层次参与开发：

| 层次       | 你负责什么                             | 可以复用什么                             |
| ---------- | -------------------------------------- | ---------------------------------------- |
| 应用       | 业务界面、业务数据、工具与技能         | 模型、聊天、会话、存储、工作区和宿主服务 |
| 扩展／插件 | 多个应用可以共用的会话或任务处理能力   | 事件、中间件、命令、状态和宿主扩展接口   |
| 底层 Agent | 模型调用、工具调用循环、执行与终止逻辑 | 运行时命令、事件、会话和宿主接入机制     |

应用工具和技能服务于本应用的业务；公共扩展适合跨应用复用。仅修改提示词、工具范围或角色配置，可以使用已有能力。需要改变实际执行逻辑时，再进入底层 Agent。

业务功能通常从公开 SDK 接入。当前接口无法满足需求时，再定位相应的基座模块。

## 与直接使用 SDK 开发的区别

这里的“直接使用 SDK”，指使用模型或 Agent SDK 自行搭建应用。不同 SDK 提供的能力有所不同，你需要选择并集成适合的组件。

**Mewvis 应用开发也使用 SDK，区别在于宿主与基础能力已经完成集成。** 应用使用 `@mewvis/app-sdk`，扩展使用 `@mewvis/extension-sdk`；它们运行在 Mewvis 提供的环境中。

| 比较项         | 直接用模型／Agent SDK 自建          | 基于 Mewvis 开发                        |
| -------------- | ----------------------------------- | --------------------------------------- |
| 开发起点       | 模型请求、Agent 执行或其他 SDK 能力 | 已经可以运行的应用宿主                  |
| 界面与聊天     | 自己选择组件并接入执行流程          | 使用默认 Chat，或组合自己的聊天界面     |
| 模型与凭据     | 自己组织服务配置和凭据管理          | 使用宿主统一的模型设置                  |
| 会话与业务数据 | 自己集成存储并管理生命周期          | 通过 SDK 使用会话、业务存储和工作区服务 |
| 工具与权限     | 自己建立授权、审批和执行管理        | 声明工具与权限，接入宿主的执行流程      |
| 构建与交付     | 自己决定启动、安装和更新方式        | 随基座构建，或单独打包后导入            |
| 架构选择       | 自己决定整体架构和部署形态          | 按 Mewvis 的接口、清单和生命周期接入    |

如果重点是学习如何把 AI 能力做成完整应用，可以从 Mewvis 应用开始；如果重点是研究 Agent 算法，可以直接进入运行时层。需要自行设计整个产品和部署形态时，直接使用 SDK 自建也是合理路径。

## 选择实践路线

应用分为**内置应用**和**外部应用**。两者使用同一套应用 SDK，主要区别是源码管理、构建登记和交付方式。

| 方式                     | 源码位置                                | 构建与使用                   | 适合场景                         |
| ------------------------ | --------------------------------------- | ---------------------------- | -------------------------------- |
| 内置应用（首次实践推荐） | `apps/applications/builtins/<应用目录>` | 登记后随 Mewvis 构建和分发   | 功能试验、熟悉项目结构、贡献功能 |
| 外部应用                 | 仓库外的独立项目                        | 单独构建，再通过应用管理导入 | 独立维护自己的作品               |

> 外部应用的源码独立维护，仍然运行在 Mewvis 中。它并不因此成为可以独立运行的 Web 服务。当前 SDK 和开发工具尚未独立发布，外部项目通过 `--local` 链接当前仓库。

第一次选择内置应用，先完成一个小需求；外部应用流程可作为独立维护作品的后续练习。

```text
mewvis/
├── apps/client/                 共享前端与聊天界面
├── apps/desktop/                桌面宿主
├── apps/server/                 Node 后端与运行时进程管理
├── apps/applications/builtins/  内置应用
├── apps/extensions/             内置扩展／插件
├── apps/agent-runtime/          Agent 运行时
├── packages/app/               应用 SDK、工具链与宿主
├── packages/extension/         扩展 SDK、工具链与宿主
├── ai/pi/                      上游模型与 Agent 依赖
└── docs/                       中文开发文档
```

## 先把项目运行起来

### 准备环境

- Node.js **22.19 或以上**。
- pnpm **8.15.9**。
- Git。
- Linux：安装原生依赖还需 Python、C/C++ 编译工具和 make。
- 桌面端：另需 Rust 和 Tauri 2 的平台依赖，参考[桌面开发](desktop.md)。

首次实践建议使用本机 Web 入口。在终端执行：

```sh
git clone https://github.com/CreakyCoss/mewvis.git
cd mewvis
pnpm install --frozen-lockfile
pnpm build:ai
pnpm dev:web
```

打开终端输出的地址，默认是 `http://127.0.0.1:1420`。在「设置 → 模型设置」添加模型服务、填写凭据并选择模型，先确认普通对话能够成功。

模型服务通常需要账号或 API 凭据，是否计费取决于你配置的服务。

### 体验一个现有示例

打开内置「调试台」，体验聊天、工具、技能、业务数据和工作区示例，再查看接入代码。它是适合入门的能力实验室；复杂业务流程可以进一步参考学习工坊、RSS 阅读器和故事工坊。

参考：[调试台说明](../apps/builtins/chat-playground.md)。

> 后续开发命令在另一个终端执行。除非特别注明，命令都在 Mewvis 仓库根目录运行。应用和扩展的创建命令要求目标目录尚不存在。

## 内置应用：笔记助手

**第一版目标：录入笔记、保存和查看笔记、让 AI 总结指定笔记。** 先把这一条流程做完整，再增加分类、搜索和标签管理。

### 1. 创建应用

```sh
pnpm --filter client build:chat-ui
pnpm --filter client app:create -- "$PWD/apps/applications/builtins/notes-assistant" --name @example/notes-assistant --local
```

模板已经包含 React 页面、宿主工具、技能和聊天接入示例。

### 2. 登记到仓库

- 在新应用的 `package.json` 中，将 `@mewvis/app-sdk`、`@mewvis/product-config`、`@mewvis/app-dev` 三项依赖从 `link:...` 改为 `workspace:*`，其余依赖保留。
- 在根目录 `pnpm-workspace.yaml` 的 `packages` 列表追加 `apps/applications/builtins/notes-assistant`。
- 在 `apps/applications/registry.json` 的 `applications` 数组追加目录名 `notes-assistant`。
- 将模板生成的 `README.md` 移到 `docs/apps/notes-assistant.md`，调整相对链接，并登记到 `docs/SUMMARY.md`。

打包清单填写**目录名**；应用 ID 来自 `package.json` 的 `name`，本例是 `@example/notes-assistant`。

### 3. 开发与预览

```sh
pnpm install
pnpm --filter @example/notes-assistant dev
```

主要修改这些文件：

| 文件                  | 负责什么                     | 本次实践内容                   |
| --------------------- | ---------------------------- | ------------------------------ |
| `main/App.tsx`        | 业务界面和聊天接入           | 笔记列表、录入表单、摘要对话   |
| `main/host/tools.ts`  | AI 可调用的业务工具          | 查询笔记、读取笔记详情         |
| `main/host/skills.ts` | 工具使用规则和操作说明       | 先读取笔记，再生成摘要和要点   |
| `main/contracts.ts`   | 前端与宿主工具共享的数据类型 | 笔记、摘要、标签等类型         |
| `app.config.ts`       | 权限、Agent 访问范围和入口   | 按需声明聊天、数据和工作区能力 |

建议按以下顺序实现：

1. 完成录入、列表和详情界面。
2. 使用 `@mewvis/app-sdk/data` 保存业务数据；在 `app.config.ts` 中增加 `application-data` 权限。
3. 定义查询笔记的宿主工具，并声明工具风险等级。
4. 复用 `@mewvis/app-sdk/chat/react` 的 `Chat`，创建属于本应用的会话，并允许 AI 使用笔记查询工具。
5. 编写技能，指导 AI 依据工具返回的真实笔记生成摘要。

应用工作区通过数据 SDK 查询或登记，相关接口需要 `application-workspaces` 权限。页面通过 SDK 调用宿主工具，避免直接导入 `main/host/` 的 Node 实现。

### 4. 构建并在宿主中验证

```sh
pnpm --filter @example/notes-assistant build
pnpm dev:web
```

运行第二条命令前，先退出之前启动的 Mewvis 后端。在「应用管理」确认应用已启用，再打开应用验证真实模型、工具与数据流程。启动命令会重新构建已经登记的内置应用。

> 开发预览使用内存聊天与测试适配，适合调整界面和检查接入。真实模型、工作区和重启后的持久化行为，要在 Mewvis 中验证。后续修改需要重新构建并重启宿主。

### 5. 完成本次验收

- 录入一条笔记后，可以查看它的内容。
- 重启 Mewvis 后，笔记仍然存在。
- AI 实际调用查询工具，依据笔记内容生成摘要。
- 笔记不存在或模型请求失败时，界面能说明原因。

参考：[应用开发](../apps/development.md)、[应用 SDK](../apps/sdk.md)、[数据与工作区](../apps/data.md)、[应用聊天](../apps/chat.md)。

## 外部应用：独立维护同一个作品

外部应用可以实现同样的笔记助手需求，界面、工具、技能和权限接口保持一致。下面是另一种开发方式，**与内置应用流程二选一**。

### 1. 在仓库外创建项目

在 Mewvis 仓库根目录执行：

```sh
pnpm --filter client build:chat-ui
pnpm --filter client app:create -- "$PWD/../notes-assistant" --name @example/notes-assistant --local
cd ../notes-assistant
pnpm install
pnpm dev
```

`--local` 链接当前 Mewvis 仓库的 SDK 和开发工具。保留生成的本地链接依赖，无需改成 `workspace:*`，也无需修改 Mewvis 的工作区或应用打包清单。

### 2. 构建并导入

在外部应用目录执行：

```sh
pnpm build
```

启动 Mewvis，在「应用管理」导入生成的 `dist/mewvis` 目录并启用。随后完成与内置应用相同的功能验收。

### 3. 更新作品

修改后重新构建，卸载旧应用包并导入新产物。卸载只移除安装包，保留应用数据。

如果依赖链接不可用，检查当前 Mewvis 仓库是否仍在原来的位置，以及链接路径是否正确。

参考：[应用开发](../apps/development.md)。

## 内置扩展：工具调用统计

当需求是跨应用共用的会话处理、事件观察或任务组织能力时，可以编写扩展。应用自己的笔记管理工具仍放在应用内。

**练习目标：监听工具调用事件，记录调用次数，并通过命令查看统计结果。** 先运行模板中的问候命令，再逐步加入统计能力。

### 1. 创建并编写

```sh
pnpm extension create apps/extensions/tool-stats --id example.tool-stats
pnpm install --ignore-scripts
```

模板生成 `package.json` 和 `src/index.ts`，包含一个命令示例。扩展使用 `@mewvis/extension-sdk`，按功能在 `mewvis.extension` 清单中声明能力：

| 实现内容         | API                              | 需要声明的能力  |
| ---------------- | -------------------------------- | --------------- |
| 注册统计命令     | `ctx.registerCommand`            | `commands`      |
| 监听工具事件     | `ctx.on("tool_started", ...)` 等 | `events.tool`   |
| 保存会话统计状态 | `ctx.session.get/set`            | `session.state` |

上述能力放在清单的 `modules.agent.capabilities` 中。观察事件用于记录；需要改写输入、上下文或结果时，使用对应中间件接口。

### 2. 登记、构建和验证

`apps/extensions/*` 已包含在 pnpm 工作区中。将目录名 `tool-stats` 追加到 `apps/extensions/registry.json` 的 `extensions` 数组，然后执行：

```sh
pnpm extension build apps/extensions/tool-stats
pnpm extension validate apps/extensions/tool-stats/dist/plugin
pnpm dev:web
```

启动前退出旧后端。在「插件」管理页确认加载，并通过聊天中的命令选择器调用统计命令。内置插件默认启用，可以配置或停用；修改后需重新构建并重启宿主。

`validate` 检查清单、入口与配置结构，不替代类型检查或实际功能验证。

### 3. 验收

- 模板命令和统计命令能够执行。
- 实际调用工具后，统计结果发生变化。
- 会话之间的统计状态按预期隔离。
- 停用插件后，相关命令与能力不再可用。

参考：[插件开发](../extensions/development.md)、[插件 SDK](../extensions/sdk.md)、[事件接口](../extensions/events.md)。

## 底层 Agent：实现自己的执行逻辑

这一方向适合希望研究模型与工具执行流程的开发者。只调整系统提示词、模型、角色和工具范围时，可以复用已有 Agent；这里的目标是编写自己的运行实现。

### 1. 先找到运行接口

接口位于 `apps/agent-runtime/src/engines/drivers/native/agent/runtimes/types.ts`。现有 `mock` 和 `pi` 可以作为参考，先阅读较小的 Mock 实现。

核心接口是：

```ts
run(command, context): Promise<{ text: string }>
```

`command` 提供任务、输入、模型和资源等信息；`context` 提供事件发送、取消信号、宿主回调等能力。通过 `RuntimeAgent` 描述对象声明 ID、能力和对应实现。

### 2. 用 SDK 单独验证

先实现一个无需模型的最小 Agent：接收输入，发送运行事件，返回文本。下面展示接入结构，`customRuntimeAgent` 需要由你实现；`createAgentRuntime` 从构建后的 Runtime SDK 导入。

```ts
const runtime = createAgentRuntime({
  runtimeAgents: [customRuntimeAgent],
  callbacks: {
    onEvent: (event) => console.log(event),
  },
});

try {
  const result = await runtime.agent.run({
    taskId: "custom-demo",
    runtimeId: customRuntimeAgent.id,
    workspacePath: process.cwd(),
    userMessage: "你好",
  });
  console.log(result);
} finally {
  await runtime.shutdown();
}
```

在仓库根目录执行 `pnpm build:runtime` 后，SDK 入口为 `apps/agent-runtime/dist/sdk.js`。SDK 与相邻执行 worker 等产物需要保持目录布局。当前 SDK 的调用入口是 `runtime.agent.run(...)`，接口以源码类型定义为准。

### 3. 逐步增加能力

1. 接入真实模型，完成一次输入和回复。
2. 增加一个工具，实现“模型 → 工具 → 模型”的执行循环。
3. 支持取消、错误处理、最大执行步数和明确的终止条件。
4. 需要接入 Mewvis 扩展时，实现对应的 `extensionAdapter` 能力映射。
5. 最后接到默认宿主：处理内置运行时注册、profile 与宿主选择流程。

默认宿主不会因为 SDK 中注册了对象就自动发现它。目前没有通过插件管理页安装底层 Agent 的流程；SDK 的 `runtimeId` 选择属于进程内接入，不直接扩展公开通信协议。

工具执行还需要接入相应的权限、审批和执行链，声明 Agent 能力不会自动获得 Pi 实现中的全部行为。

### 4. 检查与验收

```sh
pnpm --filter @mewvis/agent-runtime check
pnpm build:runtime
```

类型检查覆盖 Runtime 工程中的源码；另外通过你的 SDK 演示验证真实行为，包括事件顺序、取消和失败路径。接入宿主后，再验证完整链路。

参考：[Agent 类型定义](../../apps/agent-runtime/src/engines/drivers/native/agent/runtimes/types.ts)、[Mock 实现](../../apps/agent-runtime/src/engines/drivers/native/agent/runtimes/mock/agent.ts)、[运行时注册表](../../apps/agent-runtime/src/engines/drivers/native/agent/runtimes/registry.ts)、[宿主插件与 SDK 接入](../runtime/extensions.md)。

## 验证与交付

交付代码、必要文档和一次完整演示。说明作品解决什么问题，以及哪些能力来自 Mewvis、哪些逻辑由你实现。

| 交付内容         | 要说明什么                               |
| ---------------- | ---------------------------------------- |
| 作品说明         | 目标用户、具体需求、第一版范围           |
| 运行步骤         | 环境要求、启动命令、模型配置与使用步骤   |
| 完整演示         | 从输入到结果的真实流程                   |
| 持久化或状态验证 | 重启恢复、会话隔离或任务状态是否符合预期 |
| 失败情况         | 至少一个失败或边界输入，以及对应反馈     |
| 实现说明         | 复用了哪些 SDK，新增了哪些业务或运行逻辑 |

文档放入 `docs/` 并登记到 `docs/SUMMARY.md` 后，在仓库根目录运行 `pnpm docs:check` 检查目录覆盖和链接。

推荐的第一个开发目标：**完成一个内置笔记助手，支持录入、持久化保存和查看笔记，让 AI 调用应用工具总结指定笔记，并演示一次重启恢复。**
