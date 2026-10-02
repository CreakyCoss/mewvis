# 宿主服务协议与适配

SDK 插件通过 `ctx.host` 请求宿主能力，原生插件通过独立宿主协议的 `ctx.services` 请求相同能力。Mewvis 适配器转换上下文和服务调用；插件不导入应用 API、会话存储类型或模型配置。UI 视图和 Agent worker 都可以消费服务，由当前执行环境决定可用能力。`host` 不代表一个新的可执行插件模块。

## 协议入口

[host/services.d.ts](../../packages/extension/sdk/host/services.d.ts) 定义方法、输入输出、能力与错误类型；[host/services.js](../../packages/extension/sdk/host/services.js) 提供请求 Schema 和与传输无关的客户端。

在 `package.json` 的 `mewvis.extension` 下声明：

```json
"host": {
  "required": ["session.ledger.read"],
  "optional": ["session.summarize"]
}
```

必需能力缺失时视图打开失败；可选能力缺失时视图仍可运行。`ctx.host.supports(name)` 判断当前绑定是否可用。清单未声明的调用返回 `HOST_DENIED`；声明但宿主未实现的调用返回 `HOST_UNSUPPORTED`。这里的能力声明由宿主校验，不接受插件通过请求临时扩大范围。

```ts
const ledger = await ctx.host.session.ledger.read();
if (ctx.host.supports("session.summarize")) {
  const controller = new AbortController();
  const result = await ctx.host.session.summarize(
    { scope: { kind: "run", runId: ledger.runs[0].id } },
    { signal: controller.signal },
  );
  // result.text 仅用于当前视图；调用方可以 controller.abort() 取消。
}
```

实际使用前应处理空运行列表。总结整个会话使用 `{ scope: { kind: "session" } }`。插件不能指定工作区路径或切换会话，目标由宿主视图租约绑定。

## 当前能力

协作相关能力包括 `configuration.read/write`、`tasks.run` 和 `activity.publish/read/pause/resume/checkpoint/cancel`。配置限定为调用插件本身，活动限定为插件和当前会话；任务执行沿用宿主的模型、权限及取消链路，接受 `{ text, systemPrompt?, title?, avatar?, tools?: "none" }`，不依赖任何宿主角色。指定 `tools: "none"` 时，宿主清空子任务工具、技能和应用资源，并收紧其访问范围，适合只做模型判断的任务。具体作用域与使用方式见[角色协作插件](collaboration.md)和[智能判断插件](decisions.md)。

| 方法                  | 返回与边界                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session.read`        | 用户/助手公开消息和关联运行；排除私有消息、系统提示与原始 metadata。最多最近 1000 条消息/运行，单条文本 8000 字符。                                                                            |
| `session.ledger.read` | 诊断账本快照：运行、消息、指令、上下文、已有摘要以及明确映射的思考和工具记录。可以包含运行私有内容，权限独立于公开消息读取。各类最多 500 条记录，单项文本 24000 字符，总文本预算 500000 字符。 |
| `session.summarize`   | 按会话或运行生成 `{ text, generatedAt, truncated }`。仅使用消息快照，不发送系统消息、指令和思考字段；最多发送末尾 48000 字符。                                                                 |

读取结果使用稳定 DTO，不暴露账本路径和任意内部 metadata；内容文本本身可能包含会话中已有的路径或工具参数。发生裁剪时 `truncated` 为 true。摘要的 `truncated` 同时反映源快照与输入裁剪。

摘要是用户主动触发的一次性模型调用。桌面适配器使用会话已选的可用模型，未选择时使用配置中的首个已添加模型；无可用模型返回 `HOST_UNAVAILABLE`。模型密钥由宿主解析，不返回插件。该调用没有会话写入端口，不保存摘要，不压缩账本，也不将摘要加入后续对话上下文。

## 活动暂停协议

- `activity.publish` 的 `pausable: true` 表示插件会主动调用检查点。发布状态仍为 `running/completed/failed/cancelled`；宿主读取快照额外包含 `pausing/paused`，插件不能自行发布这两个状态。
- `activity.pause({ id })` 在当前会话登记暂停请求，不中断正在执行的工作；`activity.resume({ id })` 放行等待或撤回请求。已结束、不支持暂停或不匹配的活动返回 `HOST_UNAVAILABLE`。
- `activity.checkpoint({ id })` 仅在 Agent 执行环境提供：未请求暂停时直接返回，已请求时转为 `paused` 并等待继续；取消或运行销毁时拒绝等待。插件在安全边界主动调用它，宿主不理解具体流程。

上述是传输方法的参数形状；SDK 客户端对应 `ctx.host.activity.pause(id)`、`resume(id)`、`checkpoint(id)`。UI 的通用 `StatusSlot` 提供暂停、撤回暂停、继续和取消的默认渲染，也将操作暴露给自定义 `render`。

当前实现以活动文件协调桌面服务和运行进程，并用同一文件锁保护暂停请求与进度更新。活动更新带有单调版本，运行进程与宿主控制请求统一投影到任务执行状态，旧事件不能覆盖新暂停请求。读取快照的 `executionId` 是父执行的关联标识；UI 可用宿主 `UIExecutionSource` 与会话快照关联。文件仅是状态快照，不是可恢复的执行检查点：等待与前序结果保留在当前进程中。暂停等待不计入插件执行预算；Agent 适配器可通过宿主 `ExtensionBindings.suspension` 暂停自身的空闲检测，无需 SDK 或宿主服务了解底层 Agent。

## 分发、适配与消费

```text
插件 ctx.host
  → SDK 客户端
  → UI MessageChannel / Server 视图租约，或 Agent worker 请求桥
  → extension-host/services：能力、请求校验、错误、取消
  → extension-host/services/session：协议数据与内部服务的翻译
  → 现有会话读取 / 无会话模型调用
```

宿主的 [services/dispatch.ts](../../packages/extension/host/services/dispatch.ts) 定义 `ExtensionHostAdapter` 与分发入口；[services/session.ts](../../packages/extension/host/services/session.ts) 投影内部 DTO；应用的 [bootstrap/extensions.ts](../../apps/server/src/bootstrap/extensions.ts) 连接会话与任务服务。Agent runtime 在自身扩展模块中绑定任务执行能力，不将 Pi 依赖带入宿主插件层。Client 视图传输按协议方法转发，不为每个服务编写页面逻辑。

新宿主可实现本地服务、远程转发或 Mock 适配器，再通过 `createExtensionHostClient` 绑定传输。缺失的能力不注册即可；不可伪造成功。新增能力需要同时定义输入输出和请求 Schema、实现适配器，并明确作用域和生命周期，再由插件按需声明。

## 生命周期与错误

每个视图最多一个正在执行的请求。请求绑定当前插件配置、启用状态和会话；外部配置变更、停用、关闭会撤销租约并中止挂起的请求。插件通过 `configuration.write` 保存自身配置时，服务会更新本插件视图的配置指纹，并通知宿主刷新贡献。显式取消使用请求 ID，取消先于查询到达时也会阻止执行。宿主请求超时为 120 秒，浏览器传输兜底为 125 秒。桌面摘要取消会停止该次短生命周期模型进程；不停止会话自身的 Agent。

错误具有协议 `code`：`HOST_UNSUPPORTED`、`HOST_DENIED`、`HOST_INVALID_REQUEST`、`HOST_UNAVAILABLE`、`HOST_CANCELLED`、`HOST_FAILED`。适配器内部异常不会原样透传到插件。服务完成后仍检查取消及租约状态，避免已撤销视图收到结果。

内置 `apps/extensions/session-ledger` 是原生插件，只依赖宿主接口，展示运行链路与临时摘要。账本的持久化和会话生命周期仍由宿主管理；面板不提供删除、压缩或回写操作。

## 验证

`pnpm --filter @mewvis/server test:extensions` 包括真实 Runtime 闭环：本地模型桩生成会话与运行摘要，核对账本快照及全部会话文件保持不变。模块测试覆盖可选能力缺失、权限与参数校验、不同宿主实现、取消先于查询、视图关闭和插件停用。

`tasks.run` 的正文、模型返回的思考和工具事件由宿主以独立子任务事件转发到父会话；`title` 仅提供显示名称，`avatar` 使用插件自己的图片 URL 或 data URI，不引用宿主角色和头像 ID。子任务完成或失败只结束自己的消息，父任务继续由自身生命周期管理。桌面按子任务显示并保存消息，取消时保留已输出内容。

## 标准判断能力与插件提供者

`decisions.evaluate` 接收 `{ input, question, output }`，返回类型化判断结果。SDK 消费端使用 `host.decisions.evaluate`，宿主原生消费端使用 `services.decisions.evaluate`，均不传提供者或规则 ID。

插件清单通过 `host.provides` 声明自己实现的标准服务，在运行模块 setup 中使用 `provide(method, handler)` 注册。SDK 适配器翻译注册和调用，宿主在独立的提供者配置与状态作用域内分发请求；提供者缺失、重复、递归调用及非法结果都会明确失败。匹配用户规则、内置规则和通用判断的逻辑完全属于提供者。参见[智能判断能力与插件](decisions.md)。
