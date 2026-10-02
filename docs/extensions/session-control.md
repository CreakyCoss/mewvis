# 会话压缩钩子

当前开放压缩前决策和压缩结果观察。插件面向 Mewvis 类型开发，Pi 适配器注册原生 session_before_compact / session_compact / session_compact_failed 钩子，Mock 注册自身的 beforeCompact / onCompact 钩子。切换、分叉、树导航和插件主动发起压缩尚未开放。

## 压缩前决策

清单声明 `middleware.session_compact`，通过 `ctx.use("session_compact", handler)` 接收：

| 字段 | 含义 |
| --- | --- |
| `operationId` | 本次压缩尝试的 ID，与结果通知关联 |
| `reason` | manual / threshold / overflow |
| `willRetry` | 原生 Agent 是否计划在压缩后重试中断的回合 |
| `instructions` | 本次自定义压缩指令，没有时为 null |
| `tokensBefore` | Agent 估计的压缩前 token 数；脚本 Mock 为 0 |

处理器只能返回 `{ action: "continue" }` 或 `{ action: "block", reason: "原因" }`。不能 replace 请求、改写指令或提供自定义摘要；replace、undefined 或无效结构都会导致操作失败。多个处理器按来源和注册顺序串行执行，block 短路后续处理器。

每个处理器使用独立状态事务；合法 continue / block 提交，错误或提交前取消回滚。已提交的前序事务不会因后续失败回滚。修改收到的对象不隐式改变请求。Pi 在准备压缩数据后、生成摘要前触发钩子；没有可压缩内容时不会触发 before。

钩子错误必须阻止摘要模型调用：适配器显式取消 Pi 的当前压缩，并通过操作边界检查重新抛出错误，避免 Pi 吞掉扩展异常后继续执行。插件错误即使与 Pi 的 Nothing to compact 等错误文本相同，也仍被识别为插件失败。

## 结果观察

清单声明 `events.session`，通过 `ctx.on("session_compact_finished", handler)` 接收 taskId、operationId、reason、status、summary 和 message。当前该能力只包含压缩结果事件。

| 状态 | 含义 |
| --- | --- |
| completed | 原生压缩已完成，summary 为摘要 |
| blocked | 插件合法阻止了压缩，message 为原因 |
| failed | 钩子异常或原生压缩失败 |
| cancelled | 原生压缩被取消 |
| skipped | 手动压缩没有可处理的内容，或 Mock 脚本未提供摘要 |

非 completed 的 summary 为 null；没有错误或阻止信息时 message 为 null。一次运行可能发生多次自动压缩尝试，分别生成 operationId。准备阶段失败或跳过时，可能只有结果通知而没有 before。Pi 自动检查发现无需压缩时不生成一次尝试，也不虚构 skipped 通知。

观察器异常只回滚自身事件事务并报告 `onExtensionError`；已完成的原生压缩不会因此撤销。结果事件不驱动额外模型回合，不产生重复 run_started / run_finished。它遵循尽力投递语义：调用取消或 worker 失效后不保证取消结果落盘，也不为压缩单独重建 worker 重放通知。

## 宿主调用与会话队列

现有 SDK 入口已接入插件：

```ts
await runtime.session.agent.compact({
  workspacePath,
  sessionRootDir,
  target: { scope: "agent", agentRoleId: "main" },
  runtime: { model },
  options: { compactInstruction: "保留尚未完成的任务和关键决策" },
}, { signal });
```

第二个参数是 SDK 本地取消信号，不是 wire JSON 字段。成功返回 compacted: true；插件阻止或无内容返回 false；中间件异常、原生失败和调用取消抛出错误。阻止原因可通过结果事件记录到插件状态。现有桌面/stdio 手动压缩入口继续复用同一调用路径。

配置插件时，手动压缩与同一 runtime、同一规范化会话目录内的 Agent 运行、插件命令共用实例借用队列，整个操作结束后才释放。压缩可复用闭包和持久状态；来源、配置或执行策略变化仍会替换实例。排队取消不进入压缩，执行中取消中断 worker 与 Pi 的摘要请求。不同 runtime 或进程之间只有插件状态文件锁，不承诺对原生 Pi 会话文件进行跨进程排队。

主 Agent 运行期间的 Pi 自动压缩也经过这些原生钩子。合法 block 阻止本次自动压缩，是否继续普通模型请求或结束溢出恢复遵循 Pi 原生规则；钩子错误使受影响的运行失败。不会在钩子里重新获取会话锁，也没有向插件暴露可重入的 compact 方法。

## 示例

以下代码需要 middleware.session_compact、events.session、session.state：

```ts
ctx.use("session_compact", (request) => {
  if (request.reason !== "manual" && ctx.session.get("preserve_history") === true) {
    return { action: "block", reason: "当前任务需要保留完整上下文" };
  }
  return { action: "continue" };
});
ctx.on("session_compact_finished", (event) => {
  ctx.session.set("last_compaction", {
    operationId: event.operationId,
    status: event.status,
    reason: event.reason,
    message: event.message,
  });
});
```

Mock 脚本使用 `{ type: "compact", summary: "摘要" }`、`{ type: "compact", fail: "失败原因" }` 或 `{ type: "compact" }` 验证完成、失败和跳过；可通过 reason 指定触发原因。它运行真实插件钩子，不生成模型摘要或修改 Pi 会话。

`extensions-compaction-test.mjs` 使用真实 Pi 会话、本地摘要模型服务和隔离 worker，覆盖手动压缩与阈值自动压缩、允许/阻止、非法结果、原生失败、跳过、观察器异常、实例复用、同会话排队与执行中取消；Mock 验证相同插件契约。完整 overflow 重试流程、自定义压缩摘要、完整 preparation/branchEntries 数据、会话切换与分叉留待后续验证或扩展。
