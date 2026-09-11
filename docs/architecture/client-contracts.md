# 前端 Agent 契约

源码目录 `apps/desktop/src/agent-client/contracts` 是前端 Agent Runtime 功能的契约边界。

- `index.ts` 直接定义语义不同于传输数据的应用载荷：客户端输入和结果、事件封装、会话选项、账本操作。它是应用契约的唯一导入入口。
- `tauri.ts` 权威定义 Tauri 命令参数、结果和事件载荷的映射。
- `../wire.ts` 是前端导入 `agent-runtime/protocol/v1/sdk` TypeScript 协议 SDK 的唯一入口。原样跨运行时传输的数据保留生成的名称和类型；语义不同的前端或 Tauri 数据必须独立定义，通过显式适配器或封装连接，不能用 `Pick` / `Omit` 投影冒充应用契约。
- SDK 重导出生成的绑定与判别辅助函数。应用契约不能直接导入生成文件，也不能依赖引擎内部命令类型。
- JSON-RPC 封装字段 `jsonrpc`、`id`、`method`、`params` 属于 Rust 与运行时之间的传输层，不能泄漏到 React 组件。

新增 Agent Runtime 的 Tauri 命令或事件时，先更新 `tauri.ts`，再通过 `src/api/agent-runtime.ts` 调用。
