# Pi sandbox and subagents

Isle assembles tool implementations in `tools/worker.ts`, built as
`pi-tool-worker.js`. `tools/index.ts` passes that executable entry to the common
program executor and registers RPC-backed tools. `agent/resources.ts` loads those
tools and skills. The vendored Pi version is 0.85.1. The implementations follow Pi's
[`sandbox` example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/sandbox)
and [`subagent` example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent).

`model/index.ts` creates Pi's async `ModelRuntime` with in-memory credentials and
the model/endpoint supplied by Isle. Agent sessions and plain chat share this
model/auth adapter. The previous Anthropic missing-usage fix is retained in the
upgraded API implementation and covered by its SSE regression test.
Runtime bundling explicitly uses Isle's tsconfig so Pi's development aliases do
not mix its source modules with package exports from `dist`.

`tools/shell.ts` uses Pi's Bash or PowerShell factory. POSIX keeps Bash; Windows
prefers native Bash and falls back to PowerShell 7, then Windows PowerShell.
Detection belongs to `security/platforms/*/process.ts`. The model receives the
actual tool name and language. Both tools are default capabilities, but only the
selected shell is registered; explicit allowlists and child ceilings still apply.

## Execution safety and tool allocation

The frontend selects `ask`, `auto` or `full`; host and plugin requests use the same
policy. `resources.tools.allowed` controls scene capabilities independently of safety.
Children intersect that allocation with their role's tools. Tool definitions carry
no permission declarations. `agent/tools/list` returns tools and `permissionOptions`
(mode, label, description, isDefault). Every source receives the same permission catalog.

`security/safety/policy.ts` defines profiles, shared boundaries, invocation rules,
risk levels, executable rules and display text. `security/safety/index.ts` validates the common contract and runs approval; protocol modes
and Chat types are generated with `pnpm generate:agent-runtime:protocol`.

File, shell, builtin business and plugin implementations execute in a Node child
process. `security/execution/policy.ts` independently enables or disables OS isolation. Plugin code is loaded there too. Pi itself and its Agent/model/session
control remain in the host. When safety is enabled, `beforeToolCall` validates final arguments and handles
approval before invoking the remote implementation. `ask_user` and `subagent` are
host control operations; child tool effects use the same execution path.

| Mode   | Default approval policy                                               | Default application write range              |
| ------ | --------------------------------------------------------------------- | -------------------------------------------- |
| `ask`  | Low risk direct; other/unknown calls need approval                    | Workspace and temporary directory            |
| `auto` | Low/medium risk direct; high/unknown calls need approval              | Workspace and temporary directory            |
| `full` | Risk/unknown calls direct, unless a configured rule requires approval | Workspace, user home and temporary directory |

Each configuration has its own `enabled` flag; both default to true. The four
combinations support checking plus isolation, checking only, isolation only, or
neither. Safety and sandbox scopes are separately configured. When enabled, their
shared/profile denials take precedence; approval never expands the sandbox scope. Network access is through configured
HTTP/HTTPS/SOCKS proxies: all three sandbox profiles allow domains while respecting
configured denials. The safety layer retains ask's restriction on decoded network
operations; auto/full allow network access, with other approval rules unchanged. Backend system write paths are declared explicitly.
An enabled sandbox that fails startup blocks execution; ordinary spawning is selected only by disabling it.

Each sandboxed executor has its own trusted SRT launcher, so concurrent policies do not share
proxy state. Windows SRT uses a shared account: equal resource scopes may run
concurrently, while conflicting scopes are rejected until active tasks finish.
Windows setup is available under 应用设置 → Agent 沙箱. Cancellation and timeout
dispose the execution process tree and release its resources. Parent
and child idle timers continue while approval is pending. Approval expires one
minute after creation (queue time included); question answers cannot approve tools.

See [pre-call safety](../../../../../../security/safety/README.md) for approval rules and
[program execution](../../../../../../security/execution/README.md) for independent sandbox
configuration, backend constraints and supported platforms.

## Subagents

Unlike the CLI example, Isle creates independent **in-memory Pi SDK sessions** in
the same process. No separate Pi CLI installation is needed. Children inherit the
parent's model credentials, workspace, both safety/execution policy snapshots (including disabled states), enabled skills and an
intersection of the parent's tools with the role's tools. They do not inherit the
parent's message history, continue its session file, or write their tool transcript
to it. Supply relevant context in the delegated task.

| Role       | Tools                                   | Purpose                       |
| ---------- | --------------------------------------- | ----------------------------- |
| `scout`    | Parent-enabled read/ls/find/grep        | Find relevant files and facts |
| `planner`  | Parent-enabled read/ls/find/grep        | Plan the requested work       |
| `reviewer` | Parent-enabled read/ls/find/grep        | Review and report issues      |
| `worker`   | Parent's tools, minus subagent/ask_user | Carry out a task              |

There is no recursive delegation or child ask_user flow. Children report missing
information to the parent. Runtime approvals still surface in the root host UI,
using the parent permission mode. This initial integration has four built-in roles; it
does not discover custom Markdown agents or select different models per child.

Tool argument examples:

```json
{ "agent": "scout", "task": "Find the session creation code and list the relevant files." }
```

```json
{
  "tasks": [
    { "agent": "scout", "task": "Inspect authentication." },
    { "agent": "reviewer", "task": "Review input validation." }
  ]
}
```

```json
{
  "chain": [
    { "agent": "scout", "task": "Locate the login implementation." },
    { "agent": "planner", "task": "Plan the requested change using these findings: {previous}" }
  ]
}
```

Single/parallel/chain modes are mutually exclusive. There are at most eight tasks
per call and four concurrent child sessions. Chains stop at the first failed step;
parallel mode gathers successes and failures before reporting a tool error. Without
`{previous}`, a later chain step receives the previous result appended to its task.
Each returned result is capped at 12,000 characters, plus a truncation marker.
Progress and token/cost statistics are returned through the existing tool events.
Parent cancellation aborts active child sessions. Children also have a four-minute
inactivity timeout and a 32-turn limit.

Agent contexts and tool execution processes are separate; workspace files are shared.
Assign different files to parallel workers; this implementation does not create worktrees.

## Validation

From `apps/desktop`:

```sh
pnpm test:agent-runtime:sandbox
pnpm test:agent-runtime:pi-extensions
pnpm test:agent-runtime:pi-chat
pnpm test:agent-runtime:permissions
pnpm test:agent-runtime:shell
```

The test runs actual OS sandbox allow/deny checks and the real Pi SDK against a
local streaming model stub. It checks registration, context separation, tool
permissions, file execution, results, progress, concurrency, chains, cancellation,
timeouts and failure cleanup. No external model account is used. On all platforms,
missing sandbox dependencies fail this test rather than skipping isolation checks.
