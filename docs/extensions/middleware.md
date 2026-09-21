# 插件中间件

Isle 插件通过 `ctx.use(type, handler)` 注册可改变执行的数据管道；`ctx.on` 仍只用于观察。处理器在隔离 worker 中运行，公共类型位于 `@isle/extension-sdk` 的 `ExtensionMiddlewareData`、`ExtensionMiddlewareResult` 和 `ExtensionMiddlewareHandler`，不依赖 Pi 类型。

## 已实现接口

| 类型 | 清单能力 | 输入与替换值 | 触发时机 |
| --- | --- | --- | --- |
| `input` | `middleware.input` | `{ text }` | Agent 开始处理输入时；可改写文本或阻断本轮 |
| `system_prompt` | `middleware.system_prompt` | `{ text }` | 组装系统提示后、发送模型请求前，包含宿主及 Isle 内联技能 |
| `context` | `middleware.context` | `{ messages }` | 每次模型请求前；可以修改文本、筛选消息或插入 user 文本 |
| `tool_call` | `middleware.tool_call` | `{ callId, toolName, input }` | 原生工具执行前；可以替换参数或阻止执行 |
| `tool_result` | `middleware.tool_result` | `{ callId, toolName, result }` | 已调用工具返回或抛错后、结果进入模型上下文前 |
| `session_compact` | `middleware.session_compact` | 压缩尝试 ID、原因、指令与 token 估计，只读 | 原生压缩准备完成后、生成摘要前；只允许 continue / block |

替换值必须保持 `callId`、`toolName` 不变。`result` 是 `{ content, details, isError }`；此处 content 支持文本块和 `{ type: "image", data, mimeType }` 图片块，details 为 JSON。这不改变 `registerTool` 当前只支持文本输出的声明；结果中间件还可处理 Agent 内置工具返回的图片。进度更新不经过结果中间件。

结果操作都是显式值：

- `{ action: "continue" }`：继续使用收到的原值。仅修改参数对象但返回 continue，不产生修改。
- `{ action: "replace", value }`：用完整 value 替换该阶段的数据，随后交给下一处理器。不存在隐式深度合并；session_compact 不支持 replace。
- `{ action: "block", reason }`：用于 input、tool_call 和 session_compact，立即停止该类型的后续处理器。reason 必须为非空字符串。

不接受 void、undefined、未知字段、非 JSON 值或不满足结构约束的替换结果。输入 block 使本轮失败并展示原因，不发送模型请求。工具 block 生成错误工具结果，不执行工具，也不触发 tool_result；Pi 可继续让模型读取阻断原因，Mock 继续下一脚本步骤。

显式插件命令不是工具，不经过这些中间件。Pi 原生命令按 Pi 自己的规则优先于普通输入处理；命令不能借此绕过其宿主权限检查。压缩前钩子的时机、阻止与取消语义见[会话压缩钩子](session-control.md)。

## 顺序、事务与错误

同一扩展点按宿主插件来源顺序、各插件 `setup` 中的注册顺序串行执行。每个处理器接收前一个有效结果的副本。不同模型请求、不同工具调用有各自的管道；不承诺不同工具之间的全局先后顺序。

每个处理器单独运行在自己的状态事务中，合法返回且未取消后才提交。异常、返回值无效、超时或提交前取消会回滚该处理器的 JSON 修改。此前处理器已经提交的修改不会回滚；闭包变量、文件和网络副作用也不回滚。合法 block 仍是成功的处理器事务，可以记录阻断原因。

中间件错误不能像观察器错误一样忽略：当前阶段失败，后续处理器停止。Pi 适配器记录第一次中间件错误，并在 prompt、模型上下文和工具执行边界重新检查，避免 Pi 吞掉原生钩子异常后继续请求模型或执行工具。Mock 直接传播错误。取消中断 worker，沿用会话实例失效和终态恢复机制，不重放中间件或工具调用。

原生工具本身的失败仍遵守 Agent 的执行语义。Pi 可以将错误工具结果交给模型继续处理；脚本 Mock 没有模型来恢复，执行错误默认使脚本失败，但仍会先运行 tool_result。结果中间件显式替换为 `isError: false` 时，Mock 可继续。

## 最终执行检查

中间件可以修改参数，不能扩大工具目录、改变调用身份或跳过审批。Isle 插件工具使用修改后的完整参数，重新执行 JSON Schema 校验，再进行宿主权限与风险检查；未启用的工具不会执行。Pi 内置工具在原生扩展钩子之后重新按 Pi 工具 schema 校验，接着执行现有安全检查。Pi 的原生参数规范化与 Isle 的严格 JSON Schema 校验分别保留各自语义。

结果修改发生在工具调用之后，无法撤销已经完成的文件、网络等副作用。`details: null` 表示明确清空，Pi 适配层会保留这个含义，不让底层的空值合并恢复旧 details。

## 上下文消息模型

`messages` 中的每项为：

```ts
interface ExtensionContextMessage {
  id?: string;
  role: "user" | "assistant" | "tool" | "other";
  text?: string;
}
```

已有消息携带请求内有效的 id，角色只读。仅当整条内容为文本时提供 text；可以修改这个字段。图片、图文混合、思考块、工具调用及其他原生消息没有 text，通过引用保存在 Agent 适配层。保留引用时，原生结构与元数据原样返回，不会被文本化丢失。

消息引用允许筛选、重排，不允许伪造、重复或改变角色。非文本消息不能通过补一个 text 字段来替换；纯文本消息也不能删除 text 字段。插件需要保留有效的工具调用与结果对应关系，随意删除一侧可能导致模型服务拒绝请求。

新增消息省略 id，必须为 `{ role: "user", text }`。新消息只参与本次模型请求，不写回聊天历史。当前不支持创建 assistant/tool 消息、修改非文本块、任意原生字段或跨请求复用 id。此为有明确边界的通用文本/引用模型，不是完整 Pi AgentMessage 的替代品。

## 插件示例

清单声明 `middleware.system_prompt`、`middleware.tool_call`：

```ts
import { defineExtension } from "@isle/extension-sdk";

export default defineExtension({
  id: "example.policy",
  apiVersion: 1,
  setup(ctx) {
    ctx.use("system_prompt", ({ text }) => ({
      action: "replace",
      value: { text: `${text}\n请在回答中列出实际检查过的文件。` },
    }));

    ctx.use("tool_call", (call) => {
      if (call.toolName === "ext_example_export__publish") {
        return { action: "block", reason: "当前工作流只允许预览。" };
      }
      return { action: "continue" };
    });
  },
});
```

## Agent 适配与验证

宿主将声明放入 `ExtensionCatalog.middleware`，提供 `ExtensionBindings.intercept(type, data, { signal })`。调用返回最终 `{ action: "continue", value }` 或 block；适配器把它映射为目标 Agent 的原生返回值，不重新实现插件顺序、状态事务或 worker 调度。

Pi 使用原生 input、before_agent_start、context、tool_call、tool_result 钩子，并补充失败检查、参数复检及 null 结果语义。Mock 注册到自己的输入、系统提示、上下文和工具前后处理器；新增 `{ type: "request" }` 脚本步骤可输出实际准备好的请求，便于验证中间件，不模拟模型推理。

`extensions-middleware-test.mjs` 通过实际 worker、本地 SSE 模型服务、真实 Pi SDK 和 Mock，验证多插件串联、模型请求内容、调用阻断、最终参数/权限检查、无效结果、事务回滚及取消；`extensions-adapter-test.mjs` 验证非文本原生消息保留。运行 `pnpm --filter @isle/agent-runtime test:extensions`。
