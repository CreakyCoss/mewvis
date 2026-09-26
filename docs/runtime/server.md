# Node 后端服务

桌面和 Web 共用的唯一 Node 业务后端，已覆盖迁移前 Tauri 注册的全部 104 个命令，包括 Agent、配置、工作区、文件、聊天、酒馆、Git、技能、知识库、应用与数据库维护。前端共用命令传输层：桌面与浏览器均连接 Node，Tauri 仅保留桌面交互和 Node 主进程管理。完整范围与宿主交互适配见 [Server 业务接口](server-interfaces.md)。

```text
Web 静态页面 / HTTP 命令 / SSE 事件
        ↓
CommandRegistry              按名称分发全部后端命令
        ├─ AgentRuntimeHost → AgentRuntimeSupervisor → stdio Runtime
        ├─ 业务 Service → Repository / 文件系统 / Git / SQLite
        └─ Applications → Node ApplicationHost（按需托管的子进程）
```

## 目录分层

按业务聚合，模块内就近放置服务、查询和类型。跨业务共用的数据库与系统工具单独保留，避免一个功能同时散落在顶层 `services`、`repositories`、`domain` 下。

```text
apps/server/
├── src/
│   ├── cli.ts                 CLI 与信号处理
│   ├── maintenance.ts         配置库初始化与重建 CLI
│   ├── server.ts              startServer 公共入口
│   ├── bootstrap/
│   │   ├── services.ts        依赖组装、资源初始化与关闭
│   │   └── commands.ts        104 个原命令及新增命令的显式注册
│   ├── config/runtime.ts      运行参数、产品配置及原数据路径
│   ├── modules/               按业务聚合
│   │   ├── agent/             Agent 宿主、沙箱、runtime 进程管理
│   │   ├── applications/      应用包、SDK 数据与 ApplicationHost
│   │   ├── settings/          模型、Agent 配置、协作流程
│   │   ├── workspaces/        工作区登记与默认工作区保护
│   │   ├── knowledge/         知识配置、文档分块、Embedding、索引
│   │   ├── files/             工作区文件与监听
│   │   ├── chats/             聊天存档
│   │   ├── tavern/            酒馆存档
│   │   ├── stories/           故事登记
│   │   ├── skills/            技能安装与分组
│   │   ├── version-control/   Git 操作
│   │   └── database-admin/    数据库维护接口
│   ├── storage/               跨模块共用的原数据存储
│   │   ├── config/            config.db 连接、schema、升级和默认记录
│   │   ├── workspace.ts       workspace.db 及目录初始化
│   │   ├── lease.ts           原 apps/.layout.lock 的持有与释放
│   │   └── errors.ts          数据库错误转换
│   ├── infrastructure/        文件路径/JSON/归档、文件锁、进程、网络、事件
│   ├── transport/             HTTP/SSE、Web 静态资源、命令注册表与参数封装
│   └── shared/                输入校验、记录 ID、会话 ID、串行执行
├── test/
│   ├── modules/               配置、工作区和存储测试
│   ├── runtime/               Supervisor 与进程可靠性测试
│   ├── transport/             HTTP/SSE 与关闭行为测试
│   ├── integration/           完整接口、真实 Runtime、Rust 互操作测试
│   └── support/               共享 helper 与 fixtures
└── scripts/                   构建、依赖边界检查和测试入口
```

小模块先使用一个 `service.ts`。复杂模块再按职责增加文件，例如 `settings/` 就近放置 `llm-service.ts`、`llm-repository.ts` 和 `types.ts`；`knowledge/` 则将文档处理、Embedding 调用、索引编排和 `storage/` 分开。只有多个模块共用的存储才进入顶层 `storage/`；RAG 数据库属于知识库模块。

`bootstrap/services.ts` 负责创建依赖和持有资源，即使初始化中途失败也能关闭已创建的对象。`bootstrap/commands.ts` 只注册命令，不打开数据库或启动 worker。`server.ts` 连接这两部分与 HTTP 生命周期，保留现有 `startServer()` 调用方式。

依赖方向由构建时的 `scripts/check-boundaries.mjs` 检查：

- `shared/` 不依赖其他层；`infrastructure/` 只依赖自身和通用工具。
- `storage/` 可以使用系统工具，不能反向依赖业务模块或传输层。
- 业务服务可以使用共用存储、系统工具和其他模块，不能依赖启动组装或 HTTP；模块中的 `commands.ts` 允许使用通用命令注册接口。
- `bootstrap/` 统一完成组装；源码不允许循环依赖。

构建会清理 Server 自己的 `dist/` 后重新编译，避免旧路径留下兼容空壳。测试入口递归收集 `*.test.mjs`；真实 Runtime 和 Rust 互操作测试使用显式命令运行。开发文档统一放在 `docs/runtime/`。

## 启动

需要 Node 22.13.0 或更高版本，版本控制接口另需系统 `git`；配置库存储使用内置 `node:sqlite`，知识索引加载与 Rust 一致的 sqlite-vec 0.1.9。macOS/Windows 文件锁使用预编译扩展；Linux 使用 `fs-ext` 的 `flock`，安装时需要 Python、C/C++ 编译工具和 make。缺少锁模块时启动会明确失败，不降级为无锁运行。版本要求对应 [Node SQLite 文档](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html)。

在仓库根目录执行：

```sh
pnpm install
pnpm build:runtime
pnpm dev:server
```

默认监听 `http://127.0.0.1:1422`，启动时输出本次进程的 Bearer token。Server 自动按需启动 Runtime worker，无需手动启动第二个服务，也不需要启动 Tauri。

构建和运行也可以分开：

```sh
pnpm build:server
pnpm start:server
```

`GET /` 和 `GET /health` 返回服务信息。`dev:server` 只启动 API；执行一次编译后启动，修改服务源码后需要重启。

### 启动 Web 页面

```sh
pnpm dev:web
```

开发模式构建 Server 和 Runtime，在同一个启动进程中运行 Node API（默认 1422）和 Vite 热更新页面（默认 `http://127.0.0.1:1420`）。无需启动 Tauri 或手动管理 Runtime worker。按 Ctrl+C 关闭服务及其子进程。数据目录仍与桌面共用，启动前先退出桌面后端。

构建后可以在本机运行页面：

```sh
pnpm build:web
pnpm start:web
```

`start:web` 执行 Node Server 的 `--web` 模式：一个 Node 进程、一个端口（默认 `http://127.0.0.1:4173`）直接提供已构建的 React 页面、API 和 SSE，不启动 Vite 或额外代理。页面使用原组件和同源 `/api/` 调用；Runtime worker 与 ApplicationHost 仍按需创建。静态文件支持正确的媒体类型、HEAD 和 ETag 条件请求，HTML 不缓存，缺失的资源与 API 不回退为页面，路径穿越和越界符号链接被拒绝。

正式 Web 模式在页面响应中设置本次进程的 HttpOnly、SameSite=Strict 会话 Cookie，API 验证此 Cookie 及精确的 Host、Origin、Fetch Metadata；凭证不出现在 URL、页面脚本或持久配置中。服务重启后需刷新页面取得新会话。开发模式的 Vite 同源代理仍在服务端注入 Bearer token。单独 API 和桌面模式继续使用 Bearer 鉴权。所有模式仅监听本机回环地址，不提供公网或多用户服务。

桌面与 Web 不能同时使用同一数据目录；第二个启动入口明确失败，不发现、不连接、不接管已有后端。切换入口前先退出当前进程。

`apps/client/src/transport/` 集中提供命令、HTTP 错误、SSE 订阅和连接状态；连接提示 UI 位于 `workbench/shell/feedback.tsx`，传输层不依赖 UI 组件。浏览器的模型、Agent、知识库、工作区、文件、聊天、故事、技能、应用及维护接口均读取真实 Node 数据；生产客户端不再使用 Web mock。Agent 共用 `backend-client.ts`，保留已有类型契约及模型配置缓存。

事件先订阅再派发。临时断线使用 Last-Event-ID 重连、补发；文件监听按 watch ID 路由。服务重启或游标过期时明确提示用户保留未保存编辑并刷新，重新加载持久数据和建立文件/应用连接；当前不做活动任务的跨重启热接管，也不会自动重试写请求。

`src/api/native.ts` 统一提供系统文件/目录选择接口：桌面使用 Tauri 原生选择器，Web 请求本机 Node 调用系统选择器并返回真实绝对路径。业务页面直接引用该接口，不自行判断运行环境。应用工作区交互监听是 `chat-integration.tsx` 的局部方法，通过 SSE 接收选择/确认请求，再回复一次性交互 ID；共享确认队列、弹窗和连接提示集中在 `workbench/shell/feedback.tsx`，由 `Workbench` 在 `StartupGate` 外挂载 `SystemFeedback`。打开外部链接、定位或复制数据库路径的逻辑留在各自调用点。数据库状态在两端均检查，服务不可达显示连接错误和重试入口，不误报为需要重建。

Node 新增 `open_system_dialog`，接收 `{ input: { directory, multiple, title, defaultPath, filters } }`，返回绝对路径、多选路径数组或取消时的 `null`。选择发生在 **Node 服务所在电脑**：macOS 使用系统脚本选择器，Windows 使用 PowerShell 的系统对话框，Linux 使用 Zenity（单选可使用 KDialog）。Windows 目录多选暂不支持。无图形环境或缺少系统工具时明确报错，不回退到手输路径。一次只打开一个选择器；等待最多 5 分钟，请求中断或 Server 关闭会终止选择器子进程。应用工作区交互仍受原 60 秒回复期限约束。

开发验证使用 `pnpm test:web`，临时目录覆盖真实 HTTP 代理、持久化、Agent 流及交互、文件监听、应用数据、SSE 补发与过期处理。

| 环境变量                       | 用途                                              |
| ------------------------------ | ------------------------------------------------- |
| `ISLE_WEB_PORT`                | Web 端口，默认开发 1420、正式模式 4173          |
| `ISLE_SERVER_WEB_ROOT`         | 正式 Web 构建目录，默认 `apps/client/dist`      |
| `ISLE_SERVER_PORT`             | HTTP 端口，默认 1422；0 表示分配空闲端口          |
| `ISLE_SERVER_TOKEN`            | 自定义 Bearer token，至少 24 字节；省略时随机生成 |
| `ISLE_SERVER_DATA_DIR`         | 共用业务数据目录，默认 `~/.isle-claw`             |
| `ISLE_SERVER_RUNTIME_DATA_DIR` | 覆盖 Tauri runtime 数据目录，通常无需设置         |
| `ISLE_SERVER_RESOURCES`       | 打包后的 Runtime、协议和产品资源根目录          |
| `ISLE_SERVER_RUNTIME_CLI`      | Runtime CLI 构建产物的绝对路径                    |
| `AGENT_RUNTIME_PROFILE_ID`     | Runtime profile；`mock` 用于离线验证              |

开发时 Server 从 `apps/agent-runtime` 读取协议，从 `apps/product.config.json` 读取产品配置。桌面构建会将 Server、原生依赖、协议、产品配置及技能打包进 Runtime 资源目录；通过 `ISLE_SERVER_RESOURCES` 定位，不依赖源码仓库或系统 Node。Node 可执行文件继续随桌面分发。当前 sqlite-vec 0.1.9 无 Windows ARM64 产物，该目标会明确拒绝打包；其他跨平台构建也会检查目标原生依赖。

当前定位为本机单用户服务：仅监听 loopback，API 和事件订阅要求 Bearer token，校验 Host / Origin。开发 Web 使用同源代理，正式 Web 使用同端口会话鉴权。桌面模式只为 Tauri 包内页面和本次开发页面的精确 Origin 提供 CORS，预检只允许 GET/POST 与规定请求头，实际请求仍需 token；不提供通用跨站访问或多用户隔离。

## 共用数据目录

默认直接使用原来的数据，不创建另一份 Server 用户目录：

| 数据                                        | 默认位置                                                    |
| ------------------------------------------- | ----------------------------------------------------------- |
| 模型、Agent、工作区、故事、技能、知识库配置 | `~/.isle-claw/config.db`，schema v25                        |
| 默认工作区                                  | `~/.isle-claw/default-workspace`                            |
| 宿主技能                                    | `~/.isle-claw/skills`                                       |
| 应用包、配置、SDK 数据、应用工作区          | `~/.isle-claw/apps/<应用命名空间>/`                         |
| 应用目录锁                                  | `~/.isle-claw/apps/.layout.lock`                            |
| 知识索引                                    | `~/.isle-claw/rag/index.sqlite`                             |
| 工作区聊天、酒馆、Runtime 会话              | 原工作区内的 `.isle-claw/`                                  |
| Agent runtime 持久目录、诊断日志            | Tauri 系统应用数据目录下的 `pi-agent/`、`agent-runtime.log` |

Tauri 的系统应用数据目录与业务根目录不同：macOS 为 `~/Library/Application Support/com.isle-claw.desktop`；Windows 为 `%APPDATA%/com.isle-claw.desktop`；Linux 为 `${XDG_DATA_HOME:-~/.local/share}/com.isle-claw.desktop`。这些名称均来自现有产品配置。

桌面和 Web 都使用 Node，并持有同一个 `.layout.lock`。同一目录不能同时启动两个独立后端；第二个进程会明确提示数据正在使用。旧版本 Rust 保存的配置和会话文件可以直接继续使用，不支持跨进程热接管正在运行的任务。

`ISLE_SERVER_DATA_DIR` 仍可用于临时测试或指定业务根目录；显式指定时，Runtime 数据也默认写入该根目录，避免测试触碰桌面真实数据。需要分别指定时使用 `ISLE_SERVER_RUNTIME_DATA_DIR`。常规切换不需要设置这两个变量。

两端业务命令与事件固定使用 `transport/index.ts` 的 HTTP/SSE，不再有 `backendKind()`。桌面保留包内页面加载方式，`transport/http.ts` 首次请求通过唯一的壳命令 `get_backend_connection` 获取 Node 地址与本次进程凭证，后续业务请求直接访问 Node；Web 继续使用同源 `/api/`。凭证不写入源码、URL或持久配置。

### 桌面启动与退出

`apps/desktop/src-tauri/src/node_backend.rs` 只管理 Node 主进程。首次连接时启动随包携带的 Node，使用随机空闲端口，通过私有 stdout 管道接收就绪消息。并发首次请求共用同一进程；启动异常可由恢复界面显示，运行中崩溃不自动重放业务任务。

关闭桌面时关闭 Node 的 stdin，触发服务清理。Rust 最多等待 15 秒，超时清理进程树；Unix 使用独立进程组，Windows 使用带关闭清理标记的 Job Object。桌面窗口和原生文件选择继续由 Tauri 插件处理。Rust 不再初始化数据库、持有业务目录锁或托管 Runtime worker。

原 Rust 业务模块和数据库 CLI 已移除；`init:config-db`、`rebuild:config-db` 改用 Node 的维护入口，保留旧库备份及目录锁保护。

## HTTP 契约

`POST /api/commands/<Tauri 命令名>` 接受原 `invoke(name, args)` 中的 `args`，成功时直接返回原命令结果；void 对应 JSON `null`。失败时返回非 2xx 状态与：

```json
{ "error": { "code": "INVALID_ARGUMENT", "message": "错误说明" } }
```

所有命令采用显式白名单，不提供任意 Runtime 方法或任意 shell 命令的 HTTP 转发入口。Agent 命令输入和 Runtime 输出使用现有 `apps/agent-runtime/protocol/v1/schema` 验证。配置与工作区命令由独立业务服务验证，详见 [Server 配置接口](server-settings.md)和 [Server 工作区管理](server-workspaces.md)。

| 命令                                       | 行为                                   |
| ------------------------------------------ | -------------------------------------- |
| `list_agent_runtime_tools`                 | 独立短进程查询工具                     |
| `run_agent_runtime_chat`                   | 独立短进程完成无状态聊天，可发送流事件 |
| `run_agent_runtime_agent`                  | 提交 Agent 任务，立即返回 `{taskId}`   |
| `run_agent_runtime_collaboration`          | 提交协作工作流                         |
| `run_agent_runtime_collaboration_mode`     | 提交 Runtime 已注册的协作模式          |
| `answer_agent_runtime_question`            | 将追问回答路由到活动任务               |
| `answer_agent_runtime_approval`            | 将审批回答路由到活动任务               |
| `abort_agent_runtime_agent`                | 取消排队任务或终止运行中的 worker      |
| `read_agent_runtime_session`               | 读取会话账本                           |
| `get_agent_runtime_session`                | 读取 Runtime 会话摘要                  |
| `get_agent_runtime_session_debug`          | 读取账本与 trace 调试信息              |
| `get_agent_runtime_collaboration_timeline` | 读取协作时间线                         |
| `list_agent_runtime_sessions`              | 列出工作区数据目录内的 Runtime 会话    |
| `summarize_agent_runtime_session`          | 会话摘要或 Agent 角色摘要              |
| `release_agent_runtime_session`            | 停止会话的 worker 与队列，保留文件     |
| `delete_agent_runtime_session`             | 先停止会话，再删除对应会话目录         |

上表除 `abort_agent_runtime_agent` 使用 `{ "taskId": "..." }` 外，其余命令使用 `{ "input": {...} }`。工具列表也可以传 `{}`。协议语义仍由现有 Runtime 定义；使用持久化 Agent 会话时需要稳定的 `agentRoleId`。

额外提供：

- `GET /api/commands`：列出本版已实现的命令。
- `GET /api/status`：worker 状态与任务快照，不包含提交时的模型配置、凭据和完整指令。
- `GET /api/tasks/<taskId>`：单任务快照；等待用户输入时包含 `pendingInput`。
- `GET /api/events`：SSE 事件流。

示例：先以 mock profile 启动，避免调用真实模型。

```sh
AGENT_RUNTIME_PROFILE_ID=mock pnpm dev:server
```

在另一个终端设置启动时输出的 token，并使用真实存在的工作区绝对路径：

```sh
export ISLE_SERVER_TOKEN='<启动时输出的 Session token>'

curl http://127.0.0.1:1422/api/commands/list_agent_runtime_tools \
  -H "Authorization: Bearer $ISLE_SERVER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"input":{}}'

curl http://127.0.0.1:1422/api/commands/run_agent_runtime_agent \
  -H "Authorization: Bearer $ISLE_SERVER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"input":{"taskId":"demo-1","workspacePath":"/absolute/existing/workspace","sessionRootDir":"sessions/demo","agentRoleId":"assistant","userMessage":"你好"}}'
```

真实模型仍通过原接口的 `runtimeModel` 传入，由 Runtime 处理。配置 API 可持久化模型设置；任务提交时仍由调用方选择模型并构造 `runtimeModel`，未增加隐式模型选择，也不提供配置 UI。

## Supervisor 行为

保留 Tauri 的队列和进程边界，并收紧异常状态处理：

- 普通 Agent 按工作区与会话 scope 复用 worker；同会话 FIFO，不同会话可同时执行。
- 新 worker 先完成 `runtime/ping` 握手，默认 10 秒超时。握手成功前任务保留在宿主队列中，不发送执行命令；`starting` 表示仍在等待可用 Runtime。
- 协作与协作模式继续使用各自的会话键，模式键包含 mode 名称。
- 取消排队任务不会影响活动任务。取消活动任务会终止对应 Runtime 子进程，未执行的队列任务由新 worker 接手。
- 崩溃或协议错误将活动任务标记失败，恢复尚未开始的任务；不自动重跑可能已经产生副作用的活动任务。
- 只有确认旧 Runtime 主进程退出后才创建替代 worker。自动恢复默认最多 3 次，退避为 200 / 400 / 800 毫秒；后续成功完成一个任务会重置失败计数。连续启动失败不会把队列中的任务逐个派发到坏进程。
- 恢复等待期间保留会话与队列，新请求返回 `409 SESSION_STOPPING`，不会插队或并行启动同一个 worker 键。释放会话或关闭 Server 会取消未执行的恢复计时器。
- 心跳每 15 秒检查，等待阈值 10 秒，连续两次无响应标记不健康；活动任务和等待用户期间同样检测。
- 空闲 180 秒后回收，每 5 秒检查；正常 pong 不延长业务空闲时间。
- 空闲关闭先发送 `runtime/shutdown`，默认最多等待 500 毫秒后强制终止；取消、会话释放和不健康进程直接请求强制终止。停止等待的总期限默认 5 秒。
- `exit` 表示主进程退出，`close` 还需要输出管道关闭。已收到 `exit` 后最多排空输出 250 毫秒，避免继承了 stdout 的后代进程把宿主永久拖住。使用单调时钟计算运行期时长，不受系统时间校准影响。
- 停止超时仍未确认主进程退出时，返回 `WORKER_EXIT_UNCONFIRMED`，保留隔离状态与进程容量占位，失败的活动任务不会被重跑，队列停止恢复。此时禁止同一会话的新任务和文件删除；以后观察到真实退出才解除隔离。
- 释放会话时取消其活动任务和队列，确认所有相关 worker 退出后才能删除文件。任一退出无法确认都会保留文件，不把“请求终止”当作“终止成功”。
- Server 收到 SIGINT / SIGTERM 时停止接收新任务，关闭事件连接并清理 worker 和短进程请求。中断尚未上传完的 HTTP 请求，等待已经派发的异步业务操作收尾，再关闭共享配置库，避免工作区目录操作完成后访问已关闭的数据库。

HTTP 断开和任务生命周期分离。关闭网页或 SSE 连接不会取消 Agent。显式取消必须调用取消接口。

相对 `sessionRootDir` 仍解析到 `<workspace>/.isle-claw/<sessionRootDir>`，目录名读取现有产品配置。释放与删除检查数据目录边界和符号链接，禁止删除数据根目录。内置、宿主与工作区技能由 Node 宿主注入；宿主技能位于 `<ISLE_SERVER_DATA_DIR>/skills`。

默认最多 32 个 Runtime 进程（包含短请求），每个会话最多 128 个排队任务。通过编程接口 `startServer({token, runtime: {...}})` 可调整进程、队列、心跳和超时参数。

生命周期控制同样覆盖短进程 RPC：请求超时、服务关闭、启动失败和输出管道不关闭都有对应处理。这里确认的是直接托管的 Runtime 进程；不会把关闭输出管道当成已清理所有工具后代进程，也不承诺终止任意自行脱离的进程树。这部分仍需结合 Runtime 的执行沙箱逐平台处理。

## 宿主诊断日志

日志继续写入 Tauri runtime 数据目录中的 `agent-runtime.log`。原 Rust 日志保留，Node 追加 JSON 行，继续使用有界队列和脱敏字段。`GET /api/status` 中的 `diagnostics` 返回当前文件路径、写入失败标记、丢弃条数和排队字节数。

- 记录 worker 创建、就绪、停止、退出、心跳失败、恢复次数与任务状态，以及短 RPC 的耗时、退出码和 stderr 字节数。
- 只序列化明确允许的字段，不记录完整命令、模型配置、提示词、凭据、绝对工作区路径或原始 stderr。任务和会话身份使用本次进程的加盐摘要关联。
- 原始 stderr 仍可通过受认证的任务事件实时查看；它不进入持久诊断文件。Runtime 自己的会话 trace 不受此策略影响。
- 异步串行写入，默认队列上限 256 KiB；拥塞时丢弃额外诊断记录，不阻塞 Agent 或无限积压。
- 每个文件默认最多 2 MiB，最多保留当前日志以及 `.1`、`.2` 两个轮转文件。启动时计入已有日志大小，不清空原文件。
- 新建日志目录和文件权限分别为 0700 / 0600（按平台文件权限支持生效）。写盘失败时停止日志写入并报告状态，不使 Agent 执行失败。关闭时最多额外等待 1 秒刷新日志。

参数分别为 `diagnosticMaxBytes`、`diagnosticQueueBytes` 和 `diagnosticFlushTimeoutMs`；生命周期参数为 `startupTimeoutMs`、`shutdownGraceMs`、`stopTimeoutMs`、`outputDrainTimeoutMs`、`restartBackoffMs` 与 `maxRecoveryAttempts`。

## 事件与恢复

SSE 事件保留 Tauri 的名称和 payload：

```text
event: agent_runtime_agent_event
data: {"taskId":"demo-1","event":{"type":"text_delta","delta":"你好"}}

event: agent_runtime_chat_event
data: {"streamId":"chat-1","event":{"type":"text_delta","delta":"你好"}}
```

每条事件有 SSE `id`。浏览器需要使用支持 Authorization header 的 `fetch` 流读取方式；原生 `EventSource` 不能直接设置该 header，服务不接受 URL query token。

```sh
curl -N http://127.0.0.1:1422/api/events \
  -H "Authorization: Bearer $ISLE_SERVER_TOKEN"
```

建议先订阅，再提交任务。重连时使用 `Last-Event-ID` 补发缓存中的事件。缓存最多 1024 条、8 MiB，游标包含进程 epoch；缓存过期或 Server 重启时返回 `409 EVENT_CURSOR_EXPIRED`。此时先建立不带旧游标的新订阅，再查询任务快照恢复显示状态，避免在查询和订阅之间遗漏事件。

任务状态保留全部活动任务及最近最多 512 个终态任务。任务快照和事件缓存都在内存中，Server 重启不会恢复运行中的任务或审批；Runtime 会话文件仍按原逻辑持久化。第一版不承诺持久化任务调度或完整事件重放。

请求上限 1 MiB，响应与 Runtime 单行输出上限 16 MiB。SSE 慢消费者达到缓冲阈值时断开，随后可按游标重连，避免拖住 worker 或持续占用内存。

## 本版边界

- 全部 104 个历史 Tauri 业务命令已提供 Node 实现，另有 `answer_application_workspace_interaction` 与 `open_system_dialog`，共 106 个业务命令。历史命令清单保存在测试快照中；Tauri 仅注册一个启动连接命令。
- `applicationId` 由应用登记与权限声明解析，只注入所属应用；应用必须启用并声明 `chat`。客户端不能直接注入 `resources.applications` 或 `agentAccess`。
- 配置、应用数据、知识索引及 Runtime 持久数据直接复用 Rust 原目录、命名与格式。切换后端无需导入或搬动历史数据；活动进程与内存中的排队任务不跨后端接管。
- Tauri Channel 文件监听及原生目录选择/共享确认已改为 SSE 和宿主回复接口，详见 [交互适配](server-interfaces.md#宿主交互适配)。Web 前端已接入这些事件。
- Tauri 的业务 Supervisor 已移除，Node 管理所有 Runtime worker。Runtime 源码与产物位于 `apps/agent-runtime`，Supervisor 留在 `apps/server`。桌面分发资源已包含 Node Server 及其依赖，可脱离仓库运行。

## 验证

```sh
pnpm test:server
pnpm test:server:runtime
pnpm test:server:interop
```

前者还核对全部 Tauri 注册命令覆盖，使用真实 Git 临时仓库、真实 Node ApplicationHost、临时文件/数据库及本地 Embedding HTTP fixture 验证新业务。沙箱安装使用控制程序 fixture，不在测试中安装用户沙箱；技能 ZIP 安装使用离线包，公开市场下载不作为离线测试依赖。基础进程测试使用真实子进程 fixture 验证排队、取消、追问、审批、崩溃、错误输出、心跳、空闲回收、关闭清理、HTTP 与 SSE，并使用临时 SQLite 验证配置接口、持久化、回滚、锁冲突和 schema 边界。后者使用现有 Runtime 构建和 mock profile，通过 HTTP 验证 Agent、协作、聊天、会话读取、摘要、释放与删除；不消耗模型额度。缺少 Runtime 构建时测试失败并提示构建，不静默跳过。

`test:server:interop` 需要 Rust 工具链，会编译 `test/support/legacy-rust` 中冻结的旧版 schema、迁移和 vector store 快照到测试辅助程序。测试在临时目录中验证 Rust → Node HTTP → Rust 的配置读写、同一 sqlite-vec 索引的双向搜索、原文件锁互斥及崩溃释放，以及原应用目录和旧版目录升级。辅助程序仅用于测试，启动 Node Server 不需要 Rust 服务或 Rust 编译器。常规测试另外核对全部配置/RAG 表定义，以及 v3–v25 历史库升级和回滚。
