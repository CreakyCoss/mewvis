# Agent 运行时通信协议

`apps/agent-runtime/protocol` 是跨语言通信的唯一协议来源。运行时可使用 Node.js、Python 或其他语言实现，但必须消费同一套文件并通过相同测试样例。

## 分层

- JSON-RPC 2.0 定义请求、通知、响应和错误。
- OpenRPC 列出公开方法，并在兼容期映射到内部命令名。
- JSON Schema draft-07 定义请求与响应的数据结构。
- stdio 每行传输一个紧凑的 UTF-8 JSON 值；协议写入 stdout，诊断写入 stderr。

采用 draft-07 是因为 OpenRPC 1.4 的 Schema 对象基于该方言。`v1/schema/bindings.schema.json` 聚合用于生成代码的传输封装。生成的 TypeScript、Rust、Python SDK 提交到 `v1/sdk`，它们是派生产物，不能成为另一套协议定义。

应用从 `v1/sdk` 的生成入口导入。TypeScript SDK 包含传输类型、请求工厂、模型枚举、事件／结果常量、类型守卫和工厂：

```ts
import {
  AgentRuntimeEventType,
  agentRuntimeEventGuards,
  agentRuntimeEvents,
} from "./v1/sdk/typescript/index.js";

const event = agentRuntimeEvents.textDelta({
  taskId: "task-1",
  delta: "hello",
});
if (agentRuntimeEventGuards.textDelta(event)) {
  console.log(AgentRuntimeEventType.TextDelta, event.delta);
}
```

这些常量与辅助函数由 OpenRPC、模型、事件和结果 Schema 生成。新增方法、枚举值、事件或结果时更新 SDK，调用方无需复制名称或判别字符串。

原样跨边界的值直接使用 SDK 类型。语义不同的应用契约应独立定义，通过明确的适配器或封装连接，不能由 `Pick` / `Omit` 派生后冒充通信契约。

## 生成与检查

权限模式、展示信息、默认模式和调用前安全规则在 `src/security/safety/policy.ts` 维护。生成器据此生成 `v1/schema/permissions.schema.json` 和 `packages/chat-contracts` 的公开权限声明。`agent/tools/list` 返回 `permissionOptions`，供界面展示和校验；生成的 `agentPermissionOptions` 快照用于预览。操作系统沙箱及其独立开关位于 `src/security/execution/policy.ts`。

生成器和 Node 依赖位于协议目录。生成过程还需读取运行时定义并更新共享 Chat 类型，因此应在本仓库内执行。修改 Schema、OpenRPC 方法或权限定义后，在 `apps/client` 执行：

```sh
cd apps/agent-runtime/protocol
pnpm install
pnpm generate
pnpm check
```

Rust 生成还需 `rustfmt`。桌面包提供 `pnpm generate:agent-runtime:protocol` 和 `pnpm check:agent-runtime:protocol-bindings` 两个便捷入口。

## 版本管理

`v1` 是首个标准化通信协议版本。新增可选字段或方法可以留在 v1；删除字段、改变含义或类型、将可选字段改为必填，都需要新的主版本目录。

stdio 只接受 JSON-RPC 2.0。`{ "type": "run_agent", ... }` 等内部命令是实现细节，不能直接写入 stdio。

Node 使用 Ajv 校验协议文件。Python 实现应以 `jsonschema.Draft7Validator` 加载相同的 `request.schema.json`、`response.schema.json`、`notification.schema.json` 及其引用文件（包括 `permissions.schema.json`），不能另行维护一套 Pydantic 契约。

## JSON-RPC 行为

- 带 `id` 的请求恰好收到一个 JSON-RPC 响应。
- 通知省略 `id`，没有响应。
- 流式运行时事件通过 `runtime/event` 通知发送。
- 主响应之后的附加结果通过 `runtime/result` 通知发送。
- `params` 始终使用按名称传参的对象。
