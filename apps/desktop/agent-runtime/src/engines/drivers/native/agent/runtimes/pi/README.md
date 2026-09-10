# Pi sandbox and subagents

Isle assembles ordinary tools in `tools/index.ts`; `agent/resources.ts` only registers
them and loads skills. Pi itself is not modified. The implementations follow Pi's
[`sandbox` example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/sandbox)
and [`subagent` example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent).

## Execution safety and tool allocation

The frontend selects `ask`, `auto` or `full`; host and plugin requests use the same
policy. `resources.tools.allowed` controls scene capabilities independently of safety.
Children intersect that allocation with their role's tools. Tool definitions carry
no permission declarations. `agent/tools/list` returns tools and `permissionOptions`
(mode, label, description, isDefault). Every source receives the same permission catalog.

`engines/safety/permissions.ts` is the single definition of permission options, their
UI text/default and execution policy. Edit `AGENT_PERMISSION_DEFINITIONS`, then run
`pnpm generate:agent-runtime:protocol`: the permission schema, language bindings and
public Chat permission types are generated from that definition. The frontend uses
the returned catalog for rendering, validation and restoring saved selections.
No frontend enum, mode labels or default permission is maintained separately.

Common code lives in `engines/safety`: `types.ts` defines execution requests,
operation analysis, rule findings and decisions; `rules.ts` evaluates operation
risks and protected targets; `policy.ts` applies the permission definitions;
`gate.ts` handles pre-execution approval. Rules do not inspect tool names or caller
identity. Add runtime-specific argument decoding in its adapter, not the rules.

| Mode   | Behavior                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| `ask`  | Low risk runs directly; medium/high or incompletely analyzed execution needs approval.                        |
| `auto` | Low/medium risk runs directly; high or incompletely analyzed execution needs approval.                        |
| `full` | Risk approval, protected-target restrictions and the Shell sandbox are disabled. Invalid requests still fail. |

Workspace reads/list/search are low risk; writes and outside reads are medium;
deletes, outside writes and runtime configuration changes are high. Credential
access and hardlink writes are denied in restricted modes. Multiple effects are
aggregated without lowering another finding's risk. Empty/unmatched/partial
analysis is never implicitly considered low risk.

`safety.ts` decodes Pi file tools, Shell, questions and delegation. Generic commands
remain partially analyzed/high risk: recognizing a command name cannot prove what
scripts, expansions or child processes will do. Custom business and plugin tools
use the same unknown-operation fallback. No plugin permission protocol is required.

After creating a session, Isle installs `session.agent.beforeToolCall` after Pi's
existing extension handler. This hook receives the actual arguments and AbortSignal.
It checks the final extension arguments, canonicalizes file targets and either
allows, blocks, or waits for host approval before Pi executes the original call.
There is no authorization helper tool, grant cache or model-driven retry. A runtime
without a blocking execution hook or controlled executor cannot provide this guarantee.

Approval uses `approval_requested` / `approval_resolved` and `agent/approval/answer`.
The payload contains the execution ID, summary, input/operation details, reason and
expiry. Requests queue per root task and expire **one minute after creation**, including
queue time. Missing approval, denial, cancellation or changed parameters/target policy
prevents execution. Late/duplicate answers cannot authorize another invocation.
Parent and child idle timers continue normally while approval is pending. Ordinary
question answers cannot approve operations. No model reviewer is involved.

## Bash sandbox

Shell uses `@anthropic-ai/sandbox-runtime` 0.0.26 on macOS/Linux. macOS requires
ripgrep; Linux also requires bubblewrap and socat. Packaging includes the Linux
seccomp assets. Unsupported platforms or initialization failures never silently
execute outside the sandbox.

In `ask` and `auto`, the host policy always enables the sandbox, blocks network,
allows writes only within the workspace and OS temporary directory, denies reads
of `~/.ssh`, `~/.aws`, `~/.gnupg`, and protects workspace `.env`, `.pi`, `.git`,
and `.isle` writes. Other Shell file reads remain allowed by SRT.
Global `<Pi agent directory>/extensions/sandbox.json` and project `.pi/sandbox.json`
may further narrow the filesystem policy; they cannot disable or widen the host
policy. Configurations are snapshotted for the parent and its children.

A command that needs broader access can explicitly request `bash` with
`{ "command": "...", "sandbox": false }`. This is a new operation subject to
explicit human approval of that exact unsandboxed command; it is never an automatic retry after
partial execution. `full` disables the sandbox for the session.

SRT has process-global state, so sandboxed commands are serialized around
initialization, execution and cleanup. Waiting and running commands are cancellable.
Only Shell processes use OS isolation. File tools use the common execution safety gate;
plugin modules still run as trusted in-process Node code. This does not sandbox
arbitrary plugin code, nor provide a security boundary against concurrent hostile
filesystem mutations from another process.

## Subagents

Unlike the CLI example, Isle creates independent **in-memory Pi SDK sessions** in
the same process. No separate Pi CLI installation is needed. Children inherit the
parent's model credentials, workspace, sandbox snapshot, enabled skills and an
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

Contexts are separate, but processes and files are shared. Assign different files
to parallel workers; this implementation does not create worktrees or separate OS
sandboxes for whole child agents.

## Validation

From `apps/desktop`:

```sh
pnpm test:agent-runtime:pi-extensions
pnpm test:agent-runtime:permissions
```

The test runs actual OS sandbox allow/deny checks and the real Pi SDK against a
local streaming model stub. It checks registration, context separation, tool
permissions, file execution, results, progress, concurrency, chains, cancellation,
timeouts and failure cleanup. No external model account is used. On macOS/Linux,
missing sandbox dependencies fail this test rather than skipping isolation checks.
