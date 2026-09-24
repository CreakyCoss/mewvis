# Pi 兼容基准与协议规格

本规格以仓库内 `@earendil-works/pi-coding-agent` **0.85.1** 为参考。源码为 `ai/pi/packages/coding-agent/src/core/extensions/types.ts`，API 文件 SHA-256 为 `96e20f8038027f0b0172f311b6b9d9ddf42123b2f5b2a018f533af026fd3371e`。Pi runtime 的 `package.config.json` 在 `isle.extensionCompatibility.pi` 中记录基准；插件测试会检查版本与文件哈希。它用于检测上游 API 变化，不是运行时加载插件的必要条件，也不需要独立的 compatibility 文件。配置随现有打包流程合并进产物 `package.json`，以 runtime ID 区分不同 Agent 的基准。更新基准必须同时审查下表及相应行为测试，哈希一致本身不是语义兼容证明。

Pi 插件适配集中在 `apps/agent-runtime/src/engines/drivers/native/agent/runtimes/pi/extensions/`：`index.ts` 为统一入口和插件工厂，`context.ts` 负责上下文投影，`events.ts` 负责消息与回合映射，`compaction.ts` 负责压缩钩子。Agent 执行模块通过该目录入口使用适配能力。

Isle 插件 API、Agent 适配协议和外部生态基准分别版本化。目前前两者均为 v1；Pi 基准只属于 Pi 适配模块，不进入公共 SDK 类型。当前没有外部 Pi 插件导入器，下面的「已有」只表示 Isle 插件向 Pi/Mock 输出的能力，不表示可直接加载原生 Pi 插件。

## 能力清单

| Pi 接口或扩展点 | Isle 归属与目标 | 当前实现与缺口 |
| --- | --- | --- |
| package、`resources_discover` | 宿主包管理、资源贡献 | 本地包、配置、构建、打包已有；动态资源目录、网络安装未实现 |
| `registerTool` | 插件资源与 Agent 工具注册 | 名称、描述、schema、文本结果、details、进度已有；图片、prompt hints、参数预处理、执行模式与自定义渲染未实现 |
| skills、prompts、themes | 宿主资源与 Agent 适配 | 内联技能通过系统提示模拟；目录技能、模板、主题未实现 |
| `registerCommand` | 插件命令与宿主命令入口 | JSON 参数、Pi 原生命令和 Mock 命令已有；桌面无内置执行面板，补全和桌面输入框命令解析未实现 |
| `registerShortcut`、`registerFlag`、`getFlag` | 宿主交互与启动配置 | 未实现；配置 schema 不等价于动态 CLI flag |
| `agent_start/end/settled` | Agent 运行观察 | Isle `run_started/finished` 由宿主模拟，覆盖成功/失败/取消；不等价于 Pi 三个事件的完整时序 |
| `tool_execution_start/update/end` | Agent 工具观察 | start/end 映射为标准观察事件；update 作为工具进度存在，尚无通用 update 订阅 |
| `turn_start/end`、`message_start/update/end` | Agent 回合与消息扩展点 | 已有回合开始/结束、消息开始/更新/结束观察，使用 Isle 快照和流式提示；message_end 返回值替换、完整原生元数据尚未开放 |
| `input`、`before_agent_start`、`context` | Agent 输入、系统提示与上下文中间件 | 已有文本输入/系统提示改写、输入阻断及上下文文本/引用管道；图片输入改写、任意原生消息修改待补 |
| `tool_call`、`tool_result`、`user_bash` | Agent 调用拦截、结果变换及宿主命令执行 | 已有参数替换、工具阻断、结果转换及最终参数/权限复检；user_bash 未开放 |
| `before_provider_request/headers`、`after_provider_response` | Agent Provider 请求管道 | 未实现；需单独定义敏感字段与流式响应契约 |
| `session_start/shutdown` | 宿主会话实例生命周期 | 已有跨操作实例、激活与释放；尚未提供同名会话事件或 Pi 进程级生命周期等价性 |
| `session_before_compact`、`session_compact/compact_failed` | 会话压缩决策与结果观察 | 已有 continue / block、统一结果状态；Pi 原生手动与自动压缩、Mock 钩子已接入；完整 preparation、分支条目、自定义摘要未开放 |
| `session_info_changed`、`session_before_switch/fork/tree`、`session_tree` | 其他会话控制与可取消钩子 | 未实现 |
| `appendEntry`、`sessionManager` | 宿主状态与会话数据 | JSON 命名空间和事务已有；不等价于 Pi 的条目历史、分支树和追加日志 |
| `setSessionName/getSessionName/setLabel` | 宿主会话元数据 | 未实现 |
| `waitForIdle/newSession/fork/navigateTree/switchSession/reload` | 宿主会话控制 | 未实现；`releaseSession` 只释放 Isle 插件内存实例 |
| `sendMessage/sendUserMessage` | 宿主消息投递、Agent 调度 | 未向插件开放；适配器内部展示命令结果不代表完整的 steer/followUp/nextTurn 能力 |
| `getActiveTools/getAllTools/setActiveTools/getCommands` | 宿主资源目录、Agent 动态注册 | 宿主已有每次操作资源筛选；插件侧动态查询与变更未开放 |
| `ctx.model/modelRegistry/scopedModels`、`setModel/getThinkingLevel/setThinkingLevel`、`model_select/thinking_level_select` | Agent 模型目录、选择与观察 | 未实现 |
| `registerProvider/unregisterProvider` | 宿主 Provider 注册与 Agent 适配 | 未实现 |
| `ctx.ui`、`registerMessageRenderer/registerEntryRenderer/registerMarkdownTransformer`、`ui_prompt_start/end` | 宿主 UI 服务与桌面展示协议 | 未实现；Pi TUI 组件不能直接当作桌面组件 |
| `project_trust`、`isProjectTrusted` | 宿主信任与权限服务 | Isle 已有权限检查；未提供 Pi 信任 API 的等价桥接 |
| `exec` | 宿主执行服务 | 未向插件开放受控 exec API；worker 内执行仍受现有沙箱限制 |
| `isIdle/abort/hasPendingMessages/shutdown/getContextUsage/compact/getSystemPrompt` | Agent 状态查询与控制端口 | 目前只有每次调用取消信号；其余未开放 |
| `events` | 插件之间的通信 | 未实现；不能把当前 Agent 观察事件当作共享总线 |

表中未实现项不是已接受的 capability 名称。v1 清单支持资源、会话状态、运行/工具/回合/消息事件、压缩结果事件及六类中间件；具体语义见[消息与回合观察事件](events.md)、[插件中间件](middleware.md)和[会话压缩钩子](session-control.md)。未知能力在加载阶段拒绝。新增模块先定义语义，再加入 SDK、清单校验与适配报告；禁止用任意字符串绕过协商。

## 当前会话实例契约

1. **身份与所有权**：一个 runtime 管理自己的实例池，以规范化后的 `sessionRootDir` 标识会话。相同会话内 Agent 运行与显式命令共用实例，切换 Pi/Mock 不改变 Isle 插件身份。不同 runtime 或进程不共享闭包，持久 JSON 状态由文件锁协调。
2. **激活与释放**：同一实例只执行一次同步 `setup` 与异步 `onActivate`，发现命令也可能触发激活。`own` 在实例释放时清理，不再随每轮结束触发。没有 `sessionRootDir` 的运行仍为临时实例，结束即释放。
3. **操作范围**：每次操作重新创建 bindings，绑定本次 signal、taskId、审批回调、状态事务与工具/技能白名单；适配器每轮产生原生插件代理。插件闭包长驻不意味着 Pi 的 AgentSession 或模型连接长驻。
4. **顺序**：同一 runtime、同一会话的操作排队执行，命令不能插入当前运行的中间。排队取消不会激活插件或发送 run_started；不同会话可以并行。同一插件处理函数的状态访问继续受事务保护。
5. **失效**：插件来源、配置、能力、风险声明、入口文件 stat 或最终沙箱策略变化，下一操作先释放旧实例再创建新实例。运行中的快照保持不变；禁用全部插件也会释放旧实例。不递归监视依赖文件，生产插件应构建成独立入口。
6. **失败与取消**：普通处理异常只回滚该次 JSON 修改，闭包变量和外部副作用不会回滚；取消的运行结束后丢弃实例。RPC 取消、超时和 worker 退出使实例失效。恢复只读已提交状态，不重放工具或命令。持久会话可用新实例尝试投递 run_finished；runtime 退出时不重建实例来发送终态。
7. **结束会话**：`runtime.extensions.releaseSession(target)` 等待当前操作后释放实例，保留持久状态；下次使用会重新激活。`runtime.shutdown()` 释放所有实例，独立 `createAgentEngine()` 使用 `dispose()`。stdio 输入关闭也执行退出清理。强制杀进程无法保证 `own` 完成。
8. **桌面边界**：Agent 与命令执行使用同一聊天的常驻 stdio 进程；命令发现目前使用短进程，因此发现阶段的闭包不会传给执行阶段。后台回收空闲进程、取消任务或重启服务也会结束实例，插件必须用 `ctx.session` 保存需要恢复的数据。

实例生命周期由宿主提供，Pi 和 Mock 的适配器无需复制实例管理。`ExtensionBindings` 只在借用的操作期间有效，适配器不得缓存它供后续运行使用。当前仍未提供插件可读的会话对象、session_start/shutdown 事件、分叉或会话切换钩子。

## 后续扩展点的准入规则

观察事件与中间件分别定义。每个新扩展点的规格必须包含输入输出、触发时机、插件间顺序、多个返回值的合并方式、短路、异常、取消和权限检查位置。数据使用 Isle 自有类型，不把 Pi 的 SDK 类型放入公共契约。

输入、系统提示、上下文与工具中间件已按注册顺序串行执行，每个处理器接收前一个结果的副本；使用显式 continue、replace 和 block，不接受 undefined。上下文目前采用文本/原生消息引用模型，完整多模态消息编辑与其他返回值语义仍需逐项扩展。

适配器声明 `direct/simulate/ignore/noop/error`，缺失映射默认报错。声明为直接或模拟的能力必须具有跨 Pi/Mock 的行为测试；忽略或空实现必须给出理由和约定结果，报告降级。仅添加名称或返回空对象不算语义支持。涉及工具输入修改时，最后一份参数必须重新校验并审批。

保持原有含义的新增可选字段可扩展同一版本；删除字段、改变事件时序或返回值含义需要新的协议版本及明确迁移。外部导入器将来单独声明源生态版本，不因目标 Agent 能注册工具就宣称兼容所有 Pi 插件。

现有自动验证位于 `extensions-adapter-test.mjs`、`extensions-session-test.mjs`、`extensions-middleware-test.mjs`、`extensions-events-test.mjs` 和 `extensions-compaction-test.mjs`，由 `pnpm --filter @isle/agent-runtime test:extensions` 统一运行。
