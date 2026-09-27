# 程序执行与沙箱

源码目录 `apps/agent-runtime/src/security/execution` 负责启动适配器提供的程序，以及 RPC、取消、超时和清理。操作系统沙箱是可选后端。执行模块不导入 Agent SDK 或安全审批模块，不构造工具、不加载应用、不解释技能。

## 配置与流程

`policy.ts` 独立于 `../safety/policy.ts` 控制执行：

- `enabled: true`：启动程序前初始化沙箱；依赖缺失、配置漂移或启动失败都会拒绝执行。
- `enabled: false`：直接使用可执行文件和参数数组启动普通子进程，不初始化 SRT、不做系统隔离、不注入代理。
- `baseline`、`profiles`：沙箱读、写和域名范围。仅启用时才按请求模式选择档位；其中不含审批阈值或权限标签。
- `backend.name`、`backend.version`：选定后端与声明的 SDK 版本。
- `backend.options`：后端参数，当前包括 SRT 强制文件保护。
- `backend.platforms`：POSIX 系统写入路径／临时目录，Windows 辅助程序、ACL、代理及初始化配置。只解析当前平台，不影响调用前安全规则。
- `environment`：两种执行模式共用的 Worker 环境变量白名单，宿主命令内的模型凭据不会传入执行进程。

审批默认启用；沙箱在 Windows 默认关闭，在 macOS/Linux 默认启用。设置页可手动启停沙箱，关闭任意一层不改变另一层或前端模式。两层都关闭时使用普通子进程，不做审批／范围检查及系统隔离；环境契约、RPC、诊断、取消和超时始终保留。两个范围独立，批准调用不扩大沙箱授权。

策略和后端配置参与打包，修改后必须重新构建并重启。沙箱开关通过「M 菜单 → 设置 → 沙箱设置」保存到 Server 数据目录的 `sandbox.json`，Server 使用 `ISLE_SANDBOX_SETTINGS_PATH` 将路径传给控制程序和 Agent Runtime；独立 CLI 默认使用产品配置目录。开关从下一次 Agent 运行生效，无需重启，正在运行的任务及其子 Agent 保持原快照。带有 `agentAccess` 限制的请求仍需沙箱，关闭时会明确拒绝执行。`resolveExecutionPolicy()` 返回包含工作区、环境和可选沙箱策略的快照，主／子 Agent 继承同一对安全与执行快照。禁用沙箱时应用设置显示 `state: disabled`，无需初始化；状态／安装命令也不解析或加载禁用的后端。

`index.ts` 校验公共契约、选择档位、合并资源范围，再调用 `platforms/index.ts` 解析后端参数。平台 Schema 与路径转换位于 `platforms/posix/config.ts`、`platforms/windows/config.ts`，公共解析器没有 OS 分支、SRT 字段 Schema 或固定 SDK 版本。后端选项必须为 JSON 数据，函数会被拒绝；快照不与源码配置共享可变数组或对象。

应用设置和 CLI 共用公开的 `getSandboxStatus()`、`installSandbox()`，支持可选 `config`、`workspacePath`、`runtimePath`，解析与执行相同的后端参数，并把快照传入后端状态／初始化方法。CLI 只解析参数和输出 JSON，平台初始化不自行读取全局配置。

报告就绪或开始执行前检查 SRT 版本、内置保护和平台兼容性。不支持或不兼容的后端显示不可用，隔离启动失败不会以无隔离模式重试。

适配器构造 `ProgramExecutor({ policy, program })`，由受信任的适配器代码选择可执行程序与字面参数。启动器选择沙箱或普通进程。Node Worker 调用 `serveWorker()` 并提供方法处理器；RPC 使用 `id`、`method`、`input` 及结果／错误／进度响应。任意 CLI 接入都需要实现该协议的桥。

运行时根目录 `build-entries.json` 为构建、运行时、桌面控制器与样例声明入口及输出文件名。通用启动器名为 `executionHost`，打包文件与 SRT 资源共享 `dist` 根目录。

## 沙箱资源范围

路径支持绝对路径及 `${workspace}`、`${home}`、`${temp}`、`${runtime}`；后端路径还支持 `${nodeDirectory}`、`${programData}`、`${arch}`。路径规范化包含符号链接解析。读取除拒绝项外允许；写入需位于允许根目录且不命中拒绝项。基础层与档位层的拒绝项合并。full 默认可写工作区、用户主目录、临时目录；ask/auto 默认可写工作区和临时目录，另加后端必需的写入根目录。

网络经 HTTP/HTTPS/SOCKS 代理，包括本地目标。`network.allow` 支持精确域名、`*.example.com`、`"all"`，拒绝优先。三个沙箱档位默认允许代理域名，安全审批层另行保留 ask 对已解码网络操作的限制。这不等于任意原始套接字、UDP 或服务端绑定。程序必须遵循代理环境，沙箱 Node Worker 启用环境代理支持。规则不能表达 HTTP 路径，也不能判断请求是否发布／删除远程数据。

SRT 固定为 0.0.75，校验声明的强制保护与已安装后端一致，不接受漂移。Unix 系统写入路径及临时目录 `/tmp/claude` 显式配置，启动器避免使用 SRT 隐含的 macOS 系统临时目录父目录授权。应用限制应放在 baseline 或 profiles，修改声明不能取消后端自身保护。

每个隔离执行器独享 SRT 实例和代理。POSIX 使用 Seatbelt 或 bubblewrap；Windows 使用下述实验后端。Worker 输出仅供诊断，Unix RPC 使用独立文件描述符，Windows 使用认证命名管道。取消／超时停止执行树，后续调用可按同一策略重建 Worker。进程清理不保证恶意应用无法故意脱离并遗留后台进程。

## 源码布局

- `policy.ts`：唯一可编辑执行配置。
- `index.ts`：公共校验、快照解析、状态／初始化及执行生命周期。
- `types.ts`：纯传输与状态契约，前端也使用。
- `runtime/client.ts`、`runtime/server.ts`：RPC 帧与响应。
- `runtime/launcher.ts`：后端选择、程序启动与清理。
- `runtime/sandbox.ts`：后端分发，未知后端名会被拒绝。
- `runtime/srt.ts`：SRT 契约／版本校验、命令封装与状态／初始化委派。
- `runtime/workspace-queue.ts`：宿主进程内按工作区排序的操作队列。
- `../platforms/index.ts`：进程、通道、沙箱初始化的平台选择。
- `../platforms/posix`、`../platforms/windows`：参数解析与执行实现，`config.ts` 是解析器，不是另一份可编辑设置。
- `cli/control.ts`：应用状态／初始化入口。

Pi 在 `runtimes/pi/tools/worker.ts` 和 `tools/shell.ts` 管理工具工厂，`platforms/*/process.ts` 选择可用 shell。模型、会话控制、追问和委派留在宿主。适配器经 `index.ts` 使用 `serializeWorkspaceOperation`，即使操作派到执行 Worker，队列仍留在宿主。两种执行模式使用同一 Worker。ApplicationHost 和应用 UI 不在此 Agent 工具边界内。

## Windows 初始化与限制

Windows 用户可以保持沙箱关闭，无需创建隔离账户或安装沙箱。打开「M 菜单 → 设置 → 沙箱设置」手动开启后，可查看就绪状态并按需初始化／修复；开启开关本身不会触发安装。该操作调用内置 `sandbox-control.js install`，再调用 SRT 安装器，由系统要求一次 UAC 确认。Agent 工具不会触发安装；取消安装后，启用状态下工具执行仍不可用，也可关闭沙箱使用普通执行。关闭不会删除已安装账户或网络规则。`node sandbox-control.js status` 可输出诊断，`enable`／`disable` 保存开关设置。

运行时同时携带 x64 和 ARM64 辅助程序。命令工具优先使用原生 Git Bash/MSYS2/Cygwin，不把 WSL 启动器作为原生 Bash。缺少 Bash 时依次选择 PowerShell 7、Windows PowerShell；PATH 缺失时也检查标准位置。此时注册 Pi 的 `powershell` 工具，使用 PowerShell 语法、UTF-8 输出且不加载 profile。

默认能力分配允许两种工具；显式白名单需包含 `powershell` 才能使用。两种 shell 都缺失时，文件和应用工具仍可用。两种命令工具遵守相同审批、沙箱及超时流程。Windows 沙箱初始化独立于 shell 选择。

Windows 后端处于 **alpha**，ACL 施加到整机共用的沙箱账户，单独创建 SRT 实例不足以隔离授权。Isle 在 SRT 受保护状态目录中通过 SQLite 租约事务协调 ACL：文件／网络范围相同可并发，不同范围在现有任务结束前被拒绝。审批阈值不属于资源范围，所以 ask/auto 范围相同时可共存。主／子 Agent 共用快照。

清理等待初始化完成，终止辅助程序树／作业，检查逐路径 ACL 清理结果，重置 SRT，再释放租约。下次启动先对账已死启动器的 ACL，再移除租约；对账失败保留记录并拒绝执行。使用同一 SRT 账户的其他应用不参与 Isle 租约协议。

Windows 强制保护覆盖具体工作区路径（含尚不存在的目标），并在允许写入根目录下按 `mandatorySearchDepth` 扫描已有匹配。与 Linux 启动扫描一样，启动后新出现的嵌套匹配路径不在此次扫描内。持久限制应明确配置 baseline 目录拒绝；文件工具每次调用还会检查受保护名称。macOS 使用运行时路径模式，各平台后端不能视为具有完全相同的恶意进程隔离能力。

对不存在的字面拒绝目标，SRT 临时在真实文件系统创建空占位，并在清理时删除未被修改的占位。适配器合并重叠拒绝项，避免父子占位冲突，也避免将 Git worktree 标记文件视为目录。被拒绝祖先内的显式读写授权会移除，防止 ACL 继承意外制造例外。

Windows 用户级工具安装路径需加入 `backend.platforms.windows.readGrantPaths`，默认除工作区外包含当前用户主目录和内置运行时。使用 Schannel 的原生工具可能遇到证书吊销请求无法经过代理的问题；不会全局禁用吊销检查。其他网络及账户限制以固定 SRT 版本的 Windows 文档为准。

## 验证

从 `apps/client` 运行 `pnpm test:agent-runtime:sandbox`，检查隔离／普通启动、RPC、资源边界、启动失败、取消、超时、清理，以及平台契约、租约和打包。`pnpm test:agent-runtime:pi-extensions` 检查四种开关组合和子 Agent 继承。

Windows 上先初始化沙箱；Bash 专项套件仍需原生 Bash，`pnpm test:agent-runtime:shell` 另检查没有 Git Bash 时的 PowerShell。套件检查不同范围被拒绝、相同范围共存、清理保留其余授权。Windows 原生验收仍待完成，交叉编译或 macOS 测试不能证明 Windows 隔离成立。
