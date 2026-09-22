# 消息与回合观察事件

插件使用 `ctx.on(type, handler)` 订阅事件，在清单中声明 `events.run`、`events.tool`、`events.turn` 或 `events.message`。事件携带 Isle 自有 JSON 快照，公共 SDK 不引用 Pi 类型。Pi 通过原生扩展钩子驱动，脚本 Mock 通过自身消息与回合观察器驱动；没有从桌面显示事件再次转发。

## 事件与身份

| 能力 | 事件 | 内容 |
| --- | --- | --- |
| `events.run` | `run_started` / `run_finished` | `taskId`、runtime 或 completed / failed / cancelled 终态 |
| `events.tool` | `tool_started` / `tool_finished` | `taskId`、`callId`、`toolName`，结束时含 `isError` |
| `events.turn` | `turn_started` | `taskId`、从零递增的 `turnIndex`、毫秒时间戳 |
| `events.turn` | `turn_finished` | 同一 `turnIndex`、本回合助手 `message`、`toolResults` |
| `events.message` | `message_started` / `message_finished` | `taskId`、消息快照 `message` |
| `events.message` | `message_updated` | `taskId`、完整快照 `message`、更新提示 `change` |

一个回合表示一次助手响应及其工具结果。一次运行可以包含多个回合；Pi 在询问用户后再次执行 prompt 时，Isle 回合编号继续递增。`taskId + turnIndex` 在本次运行内标识回合。

`message.id` 在消息开始、更新、结束以及回合结果之间保持一致。它只用于本次运行的事件关联，不是持久会话条目 ID，也不是 context 中间件的消息引用。新运行生成新 ID，历史消息不自动重放。消息不带回合编号；用 `turn_finished` 中的 ID 关联最终助手响应与工具结果。

`ExtensionMessage` 包含角色、内容，以及适用时的时间戳、工具调用 ID、工具名、错误标记和停止原因。角色为 user / assistant / tool / other。内容块包括：

- `text`、`thinking`：文本，thinking 不包含供应商签名。
- `image`：base64 数据及 MIME 类型。
- `tool_call`：调用 ID、工具名和 JSON 参数。流式阶段可能尚未补齐名称、ID 或参数，不能据此执行工具。
- `opaque`：带 `format` 的 JSON 数据。Pi 自定义消息使用 `pi.message.<role>`；不了解该格式的插件应保留或跳过它。

`message_updated` 始终提供当前完整快照，`change` 可以是 text_delta / thinking_delta / tool_call_delta，也可以只是 snapshot。delta 带内容块索引，但不承诺每个 token 对应一次事件。插件可以只使用快照，不必自行拼接流。已知内容被转换为通用语义视图；供应商签名、原生 usage 等元数据未纳入当前快照，这不等价于完整导出 Pi 消息。

## 顺序、事务与取消

Agent 等待观察器完成后再继续。同一次事件按插件来源顺序、插件内部注册顺序执行，每个处理器接收独立副本。一个插件的同一事件共享一次状态事务；全部处理器成功才提交，异常或提交前取消回滚。已提交的其他事件不会被回滚。观察器返回值被忽略，修改快照不会改变 Agent 消息；改变输入或结果应使用[中间件](middleware.md)。Pi 的 message_end 返回值替换语义尚未开放。

普通观察器异常通过 `onExtensionError` 报告，不中断 Agent 和其他插件。worker 超时或退出仍可能影响共享执行资源。取消后停止普通事件投递，不保证每个 started 都有 finished，也不会伪造未完成的消息或回合。最终运行状态以宿主尽力投递的 `run_finished` 为准；这不是可靠事件队列。

流式观察器也有等待和状态事务开销；不需要实时更新的插件只订阅 `message_finished` 或 `turn_finished`。持久状态有大小上限，不宜把整个消息流无限追加进去。

## 示例：统计已完成回合

清单声明 `events.turn`、`session.state` 和 `commands`，即可在同一会话切换 Pi / Mock 后继续统计：

```ts
import { defineExtension } from "@isle/extension-sdk/agent";

export default defineExtension({
  id: "example.turns",
  apiVersion: 1,
  setup(ctx) {
    ctx.on("turn_finished", (event) => {
      const previous = ctx.session.get("count");
      ctx.session.set("count", (typeof previous === "number" ? previous : 0) + 1);
      ctx.session.set("last", {
        taskId: event.taskId,
        turnIndex: event.turnIndex,
        messageId: event.message.id,
        toolResults: event.toolResults.length,
      });
    });
    ctx.registerCommand({
      name: "inspect",
      description: "查看回合统计",
      parameters: { type: "object", additionalProperties: false },
      async execute() {
        return { count: ctx.session.get("count") ?? 0, last: ctx.session.get("last") ?? null };
      },
    });
  },
});
```

脚本 Mock 的每个 text / request 步骤生成一个助手文本回合，每个 tool 步骤生成工具调用消息和工具结果回合；首个回合前发出 turn_started，随后发出输入用户消息。command 步骤和显式插件命令不生成模型消息或回合，脚本为空时也不虚构回合。Mock 验证事件契约，不模拟模型决策。

## 当前边界与验证

消息与回合事件覆盖当前接入插件的主 Agent 运行；维护操作中的摘要生成、子 Agent 和历史回放没有自动接入这些事件。手动与自动压缩另有[会话压缩钩子](session-control.md)。会话切换、分叉及插件主动投递消息仍待实现，不能通过观察器返回值隐式触发。

`extensions-events-test.mjs` 使用实际 Pi SDK、本地流式模型服务和真实 worker，验证消息顺序、消息 ID、工具结果关联、跨运行隔离、快照修改隔离、异常回滚和执行中取消。适配器测试另覆盖 thinking、image、opaque 内容和多次 prompt 的回合编号。运行 `pnpm --filter @isle/agent-runtime test:extensions`。
