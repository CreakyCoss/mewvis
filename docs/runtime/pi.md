# Pi 接入、沙箱与子 Agent

Isle 在 `tools/worker.ts` 装配工具实现，构建为 `pi-tool-worker.js`。`tools/index.ts` 将该可执行入口交给通用执行器，注册基于 RPC 的工具；`agent/resources.ts` 加载工具与技能。仓库内 Pi 版本为 0.85.1，实现参考其 [sandbox 示例](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/sandbox)与 [subagent 示例](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent)。

`model/index.ts` 使用内存凭据和 Isle 提供的模型／端点创建异步 `ModelRuntime`，Agent 会话与普通聊天共用模型／认证适配器。升级后的 API 保留 Anthropic 缺失 usage 的修复，并有 SSE 回归测试。运行时打包显式使用 Isle tsconfig，避免 Pi 开发别名混用源码与 `dist` 包导出。

`tools/shell.ts` 使用 Pi Bash 或 PowerShell 工厂。POSIX 保留 Bash；Windows 优先原生 Bash，其后 PowerShell 7、Windows PowerShell。检测属于 `security/platforms/*/process.ts`。模型收到实际工具名与语言。两者均为默认能力，但只注册选中 shell；显式白名单和子 Agent 能力上限仍适用。

## 执行安全与工具分配

前端选择 `ask`、`auto`、`full`，宿主与插件请求共用策略。`resources.tools.allowed` 独立控制场景能力；子 Agent 与角色工具取交集。工具定义不声明权限，`agent/tools/list` 返回工具及 `permissionOptions`（模式、标签、说明、是否默认），所有来源共用同一目录。

`security/safety/policy.ts` 定义档位、共享边界、调用规则、风险、可执行规则与显示文字；`security/safety/index.ts` 校验契约并执行审批。协议模式和 Chat 类型通过 `pnpm generate:agent-runtime:protocol` 生成。

文件、shell、内置业务和插件工具实现在 Node 子进程执行，插件代码也加载于其中。`security/execution/policy.ts` 独立控制 OS 隔离。Pi 与 Agent／模型／会话控制留在宿主。安全层启用时，`beforeToolCall` 在远程调用前校验最终参数并处理审批。`ask_user`、`subagent` 是宿主控制操作，子 Agent 工具仍走同一执行链。

| 模式 | 默认审批策略                                 | 默认应用写入范围             |
| ---- | -------------------------------------------- | ---------------------------- |
| ask  | 低风险直接执行，其他及未知操作需审批         | 工作区、临时目录             |
| auto | 低／中风险直接执行，高风险与未知操作需审批   | 工作区、临时目录             |
| full | 风险／未知操作直接执行，显式规则仍可要求审批 | 工作区、用户主目录、临时目录 |

两份配置各有默认 true 的 `enabled`，支持检查加隔离、仅检查、仅隔离、两者都不启用。安全与沙箱范围分别配置，启用时共享层／档位层拒绝优先，审批不能扩大沙箱范围。网络通过 HTTP/HTTPS/SOCKS 代理；三个沙箱档位允许域名，但仍遵守拒绝项。安全层保留 ask 对已解码网络操作的限制；auto/full 允许网络，其他审批规则不变。后端系统写入路径显式声明。

启用的沙箱启动失败会阻止执行，只有明确禁用沙箱才选择普通进程。每个执行器拥有独立受信任 SRT 启动器，不共享代理状态。Windows 使用共用账户，相同资源范围可并发，不同范围在现有任务结束前被拒绝；可在「应用设置 → Agent 沙箱」初始化。

取消或超时销毁执行进程树并释放资源。审批期间主／子 Agent 空闲计时继续，审批从创建起一分钟过期，包含排队时间；普通问题回答不能批准工具。详见 [审批规则](security/approval.md)与 [程序执行](security/execution.md)。

## 子 Agent

Isle 在同一进程创建独立的内存 Pi SDK 会话，无需另装 Pi CLI。子 Agent 继承父级模型凭据、工作区、安全／执行快照（含禁用状态）、已启用技能，以及父工具与角色工具的交集。不继承父消息历史、不续写父会话文件、不将工具记录写入其中，委派任务必须明确提供相关上下文。

| 角色     | 工具                         | 用途               |
| -------- | ---------------------------- | ------------------ |
| scout    | 父级启用的 read/ls/find/grep | 查找相关文件与事实 |
| planner  | 父级启用的 read/ls/find/grep | 规划请求的工作     |
| reviewer | 父级启用的 read/ls/find/grep | 审查并报告问题     |
| worker   | 父工具减去 subagent/ask_user | 执行任务           |

不支持递归委派或子级 ask_user，缺少信息时报告给父 Agent。运行时审批仍在根宿主 UI 展示，使用父权限模式。当前接入提供四个内置角色，不发现自定义 Markdown Agent，也不为每个子级选择不同模型。

单任务、并行和链式调用示例：

```json
{ "agent": "scout", "task": "查找会话创建代码并列出相关文件。" }
```

```json
{
  "tasks": [
    { "agent": "scout", "task": "检查身份认证。" },
    { "agent": "reviewer", "task": "审查输入校验。" }
  ]
}
```

```json
{
  "chain": [
    { "agent": "scout", "task": "定位登录实现。" },
    { "agent": "planner", "task": "根据这些发现规划修改：{previous}" }
  ]
}
```

三种模式互斥，每次最多八项任务、四个并发子会话。链式在首个失败步骤停止；并行收集成功与失败后再报告工具错误。未写 `{previous}` 时，将上一步结果附加到后续任务。单项返回最多 12,000 字符，超出附截断标记。进度、token 与费用统计使用现有工具事件返回。

父级取消会中止活动子会话；子级还有四分钟无活动超时及 32 轮上限。Agent 上下文与工具进程独立，但工作区文件共享；并行任务应分配不同文件，本实现不创建 worktree。

## 验证

在 `apps/desktop` 执行：

```sh
pnpm test:agent-runtime:sandbox
pnpm test:agent-runtime:pi-extensions
pnpm test:agent-runtime:pi-chat
pnpm test:agent-runtime:permissions
pnpm test:agent-runtime:shell
```

测试使用真实 OS 沙箱允许／拒绝检查、真实 Pi SDK 与本地流式模型桩，验证注册、上下文隔离、工具权限、文件执行、结果、进度、并发、链式、取消、超时和失败清理，不使用外部模型账号。任何平台缺少沙箱依赖都会失败，不跳过隔离检查。
