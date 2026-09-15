# Agent 运行时

Runtime 源码位于 `apps/agent-runtime`，作为 `@isle/agent-runtime` 工作区包维护。仓库根目录执行 `pnpm build:runtime` 构建，`pnpm --filter @isle/agent-runtime check` 检查类型。`dist/cli.js` 是 stdio worker 入口，由 `apps/server` 中的 Supervisor 按需启动；Runtime 不负责 HTTP 服务或桌面生命周期。应用宿主通过 `@isle/app-host` 包复用，内置应用由 `@isle/builtin-applications` 构建，产品配置来自 `apps/product.config.json`。故事核心仍复用 `apps/desktop/core`，构建不会启动桌面。


`apps/agent-runtime` 是 Mewvis Agent 的可复用运行时边界。外部适配器选择 CLI 或 SDK 并归一化输入；引擎层拥有标准协议，可替换协议背后的实现。

## 分层与依赖

```text
agent-runtime/src/
  index.ts                  SDK 公开导出
  sdk/                      进程内 SDK 接口
  cli/                      stdio CLI 及专用辅助模块
  engines/
    index.ts                引擎工厂与实现选择
    runtime.ts              标准 AgentRuntimeEngine 抽象类
    protocol/               命令、结果、事件与会话协议
    drivers/native/
      session/              共享账本、追踪、清单与投影
      agent/                单 Agent 运行实现
      collaboration/        多 Agent 工作流编排
        commands/           协作命令编排
        handlers/           转换、条件与路由处理器
        modes/              可复用工作流预设
        runtimes/           可替换工作流运行时
```

```text
index -> sdk -> engines/index -> engines/runtime
cli   -> engines/index
      -> engines/protocol
      -> engines/drivers/native -> engines/drivers/native/agent
                                -> engines/drivers/native/session
                                -> engines/drivers/native/collaboration -> engines/drivers/native/agent
                                                                   -> runtimes/native
```

应用通常调用前端 `createAgentClient()`；Tauri 等宿主通过 stdio 调用 CLI；测试和嵌入式 Node 集成可直接使用 SDK。

运行时不应导入应用专有业务逻辑。桌面打包直接使用 `src/cli/index.ts`；需要自定义转换、条件或路由的产品应围绕 SDK 或引擎命令协议建立自己的小型进程入口。

## SDK 接入

调用方已在 Node.js 中运行、需要进程内访问时使用 SDK：

```ts
import { createAgentRuntime } from "./src/index.js";
import { AgentRuntimeCommandType } from "./src/engines/protocol/index.js";

const runtime = createAgentRuntime({
  callbacks: {
    requestUserInput,
  },
});

await runtime.runCollaboration({
  type: AgentRuntimeCommandType.RunCollaboration,
  requestId: "request-1",
  input: {
    requestId: "request-1",
    workspacePath: "/path/to/workspace",
    sessionRootDir: "agent-runtime/session",
    agents: [
      {
        id: "planner",
        label: "Planner",
        agentId: "mock",
        systemPrompt: "你负责规划工作。",
      },
    ],
    workflow: {
      id: "example.workflow",
      steps: [
        {
          id: "plan",
          type: "agent",
          agentRoleId: "planner",
          userMessage: "创建简短计划。",
          outputKey: "plan",
        },
      ],
    },
  },
});
```

SDK 方法遵循 `AgentRuntimeEngine` 的统一能力接口：

```ts
await runtime.chat(command);
await runtime.runAgent(command);
await runtime.getRuntimeSession(command);
await runtime.runCollaboration(command);
await runtime.runCollaborationMode(command);
await runtime.listCollaborationModes(command);
```

协作处理器不自建追问协议。Agent 步骤使用宿主提供的运行器；SDK 宿主可向 `createAgentRuntime` 传入 `callbacks.requestUserInput`，stdio 宿主则在内部使用 Agent 追问协议。

## stdio 接入

由其他进程管理运行时时，宿主启动 `agent-runtime/dist/cli.js`，向 stdin 逐行写入 JSON-RPC 2.0 请求，从 stdout 逐行读取响应和通知。单 Agent 与协作命令经 OpenRPC 方法映射处理，不能直接向 stdio 写入内部命令对象。详见 [通信协议](protocol.md)。

## 协作命令

以下是 SDK／引擎内部命令结构，不是直接发送到 stdio 的封装：

```json
{
  "type": "run_collaboration",
  "requestId": "request-1",
  "input": {
    "requestId": "request-1",
    "workspacePath": "/path/to/workspace",
    "sessionRootDir": "agent-runtime/session",
    "agents": [],
    "workflow": {
      "id": "workflow-id",
      "steps": []
    }
  }
}
```

`workflow.steps` 支持以下通用步骤：

- `agent`：通过 `engines/drivers/native/agent` 调用一个 Agent 角色。
- `dispatch`：从结构化输入动态派发一次或多次 Agent 调用。
- `transform`：运行已注册的数据转换器。
- `condition`：运行已注册的布尔条件并保存结果。
- `router`：运行已注册的路由器并保存选中路线。

只有 `agent` 步骤与 `dispatch` 调用通过 `agentRoleId` 引用角色。宿主可通过协作扩展注册业务处理器，工作流 JSON 只引用 `product.normalizeDecision` 等处理器 ID。

## 动态派发与调度

前置步骤决定运行哪些 Agent 时使用 `dispatch`。输入可直接是调用数组，也可包含 `invocations` 数组：

```json
{
  "id": "dispatch-speakers",
  "type": "dispatch",
  "input": {
    "invocations": [
      {
        "id": "speaker-a",
        "agentRoleId": "character-a",
        "outputKey": "reply:character-a",
        "userMessage": "回应 {{ input.topic }}。"
      }
    ]
  },
  "outputKey": "speakerDispatch"
}
```

每个调用接受与 `agent` 步骤相同的字段：`userMessage`、`systemPrompt`、`requestContext`、`runtimeInstruction`、`runtimeModel`、`allowedTools`、`enabledSkills`、`resources`、`maxRetries`。派发步骤将摘要写到自身 `outputKey`，每个动态 Agent 将结果写入自己的 `outputs` 键。字符串在该 Agent 启动时渲染，因此串行调用可引用同次派发中先前的输出。

`workflow.executionMode` 省略或为 `serial` 时按数组顺序执行；为 `parallel` 时并发运行依赖已满足的步骤。

串行工作流可用 `router.routes` 跳转到其他步骤或 `__end__`，实现 `director → speaker → director → __end__` 这样的有界循环。并行调度基于依赖，不支持动态路由跳转。

`workflow.maxSteps` 限制串行路由循环；省略时依据步骤数使用保守默认值。LangGraph 和 native 运行时都会执行此限制。

```json
{
  "id": "decide-next",
  "type": "router",
  "router": "app.nextRoute",
  "input": { "$ref": "outputs.routeDecision" },
  "routes": {
    "continue": "speaker",
    "end": "__end__"
  },
  "outputKey": "nextRoute"
}
```

并行模式通过 `dependsOn` 声明依赖：

```json
{
  "id": "review",
  "type": "agent",
  "agentRoleId": "reviewer",
  "dependsOn": ["draft", "facts"],
  "userMessage": "依据 {{ output.facts }} 审查 {{ output.draft }}",
  "outputKey": "review"
}
```

步骤可设置 `maxRetries`。值为 `1` 表示初次尝试加一次重试；重试沿用步骤 ID，但使用不同 Agent 任务 ID。

## 条件与引用

步骤通过结构化 `when` 表达条件，不使用 eval：

```json
{
  "id": "optional-review",
  "type": "agent",
  "agentRoleId": "reviewer",
  "when": {
    "ref": "input.needsReview",
    "truthy": true
  },
  "userMessage": "审查草稿。",
  "outputKey": "review"
}
```

支持 `exists`、`truthy`、`equals`、`notEquals`、`includes`。未指定操作符时按真值判断。跳过步骤发送 `step_skipped`，写入 `result.skippedSteps`，在 `dependsOn` 调度中视为已结束。

字符串字段支持轻量模板引用：

```text
{{ input.topic }}
{{ output.plan }}
{{ steps.planner.text }}
```

模板在步骤启动时解析；并行模式引用其他步骤输出时，必须声明 `dependsOn`。

结构化输入用 `{ "$ref": "outputs.plan" }` 传递原值，无需转成字符串。`output.foo` 与 `outputs.foo` 均可使用。

工具与技能资源依次合并：全局输入、角色、步骤。步骤级 `allowedTools`、`enabledSkills` 覆盖角色级值。

协作中的 `role.systemPrompt`、`step.systemPrompt` 只作用于该角色，渲染到步骤运行指令，而不写入共享会话系统提示词，因此多个提示词不同的角色可以安全共享工作流会话。

## 协作运行时

Pi 还提供轮内委派的 `subagent` 工具。会产生外部作用的 Agent 工具共用可独立配置的调用前安全层与程序执行层，详见 [安全架构](security/overview.md)和 [Pi 接入与子 Agent](pi.md)。

`engines/drivers/native/collaboration` 提供轻量引擎接口与可替换运行时。默认 `langgraph` 使用 `@langchain/langgraph` 将共享工作流契约运行成 StateGraph；内置 `native` 是支持串行和依赖感知并行调度的 TypeScript 实现。通常省略运行时字段：

```json
{
  "workflow": {
    "id": "workflow-id",
    "steps": []
  }
}
```

需要其他已注册实现时设置 `workflow.runtime`：

```json
{
  "workflow": {
    "id": "workflow-id",
    "runtime": "native",
    "steps": []
  }
}
```

切换运行时不改变引擎协议。引擎继续发送 `workflow_started`、`workflow_done`、`error`，运行时发送步骤及嵌套 Agent 事件。`workflow_started` 和 `collaboration_result` 包含 `runtimeId`，供调试界面显示后端。

没有独立的宿主或 CLI 默认运行时设置；需要非默认实现时在工作流上指定。

## 事件流

单 Agent 事件由 `engines/drivers/native/agent` 原样转发。协作产生：

```text
workflow_started
step_started
agent_event
step_done
step_skipped
workflow_done
error
```

`agent_event` 封装嵌套的单 Agent 事件：

```json
{
  "type": "agent_event",
  "workflowRunId": "workflow-...",
  "stepId": "plan",
  "agentRoleId": "planner",
  "agentTaskId": "workflow-...:plan",
  "event": {
    "type": "text_delta",
    "delta": "..."
  }
}
```

`run_collaboration` 的内部结果流最终产生 `collaboration_result`，再产生 `task_result`，让 Rust 管理器标记完成。stdio 将这些内容封装为协议响应或 `runtime/result` 通知，不直接写内部对象。

## 前端接入

```ts
import { createAgentClient } from "@/agent-client/runtime";

const client = createAgentClient();
const task = await client.run({
  type: "collaboration",
  workspacePath,
  agents,
  workflow,
});

const unlisten = await client.subscribe((event) => {
  if ("taskId" in event && event.taskId === task.taskId) {
    // 处理 workflow_started、agent_event、workflow_done 等事件。
  }
});
```

Tauri 构建中，`createAgentClient()` 调用 Rust 命令，将任务提交给共享 Node 运行时管理器。浏览器预览返回不启动 Node 的预览客户端。

## 命名约定

- `agent-runtime`：整个可复用运行时包。
- `engines/drivers/native/agent`：单 Agent 执行。
- `engines/drivers/native/collaboration`：多 Agent 编排。
- `session`：共享会话存储、追踪、清单与投影。
- `createAgentClient()`：面向前端的客户端接口。
