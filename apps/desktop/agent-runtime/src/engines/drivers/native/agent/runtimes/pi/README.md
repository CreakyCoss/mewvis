# Pi sandbox and subagents

Isle registers these extensions through `agent/resources.ts`. Pi itself is not
modified. The implementations follow Pi's
[`sandbox` example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/sandbox)
and [`subagent` example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent).

## Enable the tools

Select **Shell** (`bash`) and/or **子 Agent** (`subagent`) in the agent tool list.
Both are opt-in. SDK callers include the tools in the existing resource contract:

```json
{
  "resources": {
    "tools": {
      "allowed": ["read", "ls", "find", "grep", "edit", "write", "bash", "subagent"]
    }
  }
}
```

`subagent` is implemented by the Pi runtime only. Existing LangGraph workflows
remain available; this tool is for delegation chosen by an agent during a turn.

## Bash sandbox

When `bash` is enabled, it uses `@anthropic-ai/sandbox-runtime` 0.0.26, matching the
vendored Pi example. This integration supports macOS and Linux. macOS needs
`ripgrep`; Linux also needs `bubblewrap` and `socat` on PATH. Packaging includes
SRT's Linux seccomp assets for x64 and arm64.

Only **bash and its descendants** run in the OS sandbox. Pi's `read`, `write`,
`edit`, `ls`, `find`, `grep`, the model connection, and in-process plugins are
outside that boundary. This is not whole-agent or plugin isolation.

Configuration is read once when creating the parent session, then inherited by
its children. It merges defaults, `<Pi agent directory>/extensions/sandbox.json`,
and `<workspace>/.pi/sandbox.json`, in that order. The agent directory comes from
Pi's `getAgentDir()` using Isle's packaged Pi configuration. Relative filesystem
paths are resolved against the task workspace, not the host process directory.
Arrays replace the earlier array; missing properties retain earlier values.

Supported configuration example:

```json
{
  "enabled": true,
  "network": {
    "allowedDomains": ["github.com", "*.github.com", "registry.npmjs.org"],
    "deniedDomains": []
  },
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws", "~/.gnupg"],
    "allowWrite": ["."],
    "denyWrite": [".env", ".pi"]
  }
}
```

Defaults allow writes to the workspace and the OS temporary directory; deny reads
of the three credential directories above; deny writes to the workspace's `.env`
and `.pi`; and allow network access to GitHub/raw.githubusercontent.com,
registry.npmjs.org, pypi.org and files.pythonhosted.org. Other file reads remain
allowed. An empty `allowedDomains` array blocks network access. Use literal paths
for portable macOS/Linux configuration; this SRT version does not support Linux
glob rules.

Invalid configuration, unsupported platforms, missing dependencies, or failed
initialization reject execution. They never silently run the command outside the
sandbox. Explicit `{"enabled": false}` selects ordinary local bash; only use this
for workspaces you trust. Project configuration is trusted configuration, not a
security boundary against a hostile repository or unrestricted file tools.

SRT has process-global state. Sandboxed bash calls in the same Isle worker are
serialized through initialization, execution and proxy cleanup, so parallel
sessions cannot overwrite each other's policy. Cancellation also removes waiting
calls; running commands use Pi's normal process-tree cancellation and timeout.

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

There is no recursive delegation or child user-input flow. Children report missing
information to the parent. This initial integration has four built-in roles; it
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
```

The test runs actual OS sandbox allow/deny checks and the real Pi SDK against a
local streaming model stub. It checks registration, context separation, tool
permissions, file execution, results, progress, concurrency, chains, cancellation,
timeouts and failure cleanup. No external model account is used. On macOS/Linux,
missing sandbox dependencies fail this test rather than skipping isolation checks.
