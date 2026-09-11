# Pre-call safety

[`policy.ts`](./policy.ts) is the executable host configuration for pre-call rules,
profile metadata, resource boundaries and operation risks. [`index.ts`](./index.ts)
is the public entry: validate configuration, resolve a run snapshot, evaluate all
rules, await approval and recheck the call. [`types.ts`](./types.ts) defines the
common contracts. Agent-specific operation decoding stays in the runtime adapter.

## Independent switches

`SAFETY_CONFIG.enabled` in `policy.ts` controls this entire pre-call layer. It is
independent of `enabled` in
[`../execution/policy.ts`](../execution/policy.ts). Both default
to true.

| Safety enabled | Sandbox enabled | Behavior                                                   |
| -------------- | --------------- | ---------------------------------------------------------- |
| true           | true            | Check/approve, then execute with OS isolation.             |
| true           | false           | Check/approve, then execute in an ordinary child process.  |
| false          | true            | Skip pre-call safety; OS isolation enforces its own scope. |
| false          | false           | Execute in an ordinary child process without either check. |

`resolveSafetyPolicy()` returns `null` when disabled. The adapter leaves
`beforeToolCall` untouched and skips plugin startup approval. Worker RPC,
cancellation, timeouts and tool allocation remain independent of these switches.
Full is an ordinary profile; configured denials and explicit approval rules apply
to it as well.

## Changing rules

Change settings or add rules in `policy.ts`. The generic entry has no filesystem,
network, command or tool-specific decision branches and no per-domain schema to
update. The factory `rules(context)` resolves paths and snapshots data once per
Agent run, then returns rules with:

- `id`, `description`: stable identity and explanation.
- `scope: "operation"`: evaluate each decoded operation independently.
- `scope: "invocation"`: evaluate the whole call once, including calls with no decoded operations.
- `evaluate({ request, operation, workspacePath })`: return `undefined` for no match,
  or `{ risk, reason, effect? }`. `effect: "deny"` forbids a call; `effect: "ask"`
  requires approval regardless of the risk threshold.

For example, add this object to the returned rule list to require confirmation for
a matching command in every profile:

```ts
{
  id: "confirm-git-push",
  description: "此 Git push 调用需要确认。",
  scope: "invocation",
  evaluate({ request }) {
    if (request.entry === "bash" && typeof request.input.command === "string" &&
        /\bgit\s+push\b/.test(request.input.command)) {
      return { risk: "high", effect: "ask", reason: "此 Git push 调用需要确认。" };
    }
  },
}
```

Deny takes precedence over explicit approval, then risk and unknown-operation
policy decide. Every decoded operation must match an operation rule to be
recognized. A matched invocation rule does not classify its operations, and a
low-risk match does not conceal other unrecognized operations or partial analysis.
Malformed rules, duplicate IDs and invalid findings fail closed.

Rules are trusted, synchronous host code. Keep their evaluation free of side
effects and capture private snapshot data in the factory. For stateful regexes,
avoid `g`/`y` or reset `lastIndex` before each match: approval rechecks evaluate the
same rules again. Functions never cross worker RPC and cannot be structured-cloned.
The resolved rule objects, list and approval settings are frozen; subagents share
this host snapshot. Serializable execution settings are cloned separately. New
runs resolve fresh snapshots; files are bundled, not hot-reloaded. After changing
configuration, run `pnpm generate:agent-runtime:protocol`, rebuild and restart.
Frontend modes and descriptions are generated from the same executable config.

## Resources and platforms

Paths accept absolute names and `${workspace}`, `${home}`, `${temp}`, `${runtime}`.
Directories include descendants. Reads are allowed except for denials; writes need
an allowed root and must not match a denial. Recursive access also checks protected
descendants. File writes to multiple hard links are denied when configured.
Unknown variables and path globs are rejected. Network rules check decoded URLs.
The ask profile denies decoded network requests by default; auto/full permit
network destinations. Network access is medium risk, so it does not itself require
approval in auto. Other high-risk or partially analyzed effects retain their
existing approval policy. Bash and custom tools still follow process/unknown
analysis: this layer does not enumerate network requests hidden inside arbitrary
code. The sandbox's three profiles independently allow proxy network access.

[`../platforms/resources.ts`](../platforms/resources.ts) selects platform path
semantics and handles symlinks (including dangling links and existing parents of
new files), directory variables, path validation and shared domain matching.
`platforms/posix/paths.ts` and `platforms/windows/paths.ts` implement OS differences.
Approval and execution share this resource entry without importing each other's
configuration or backends. `../platforms/index.ts` selects process, channel and
sandbox launcher implementations using the same platform selector. Windows native sandbox support remains
paused; path contract tests do not substitute for a native Windows isolation test.

## Approval flow

`checkExecution()` analyzes final arguments, evaluates rules and waits if needed.
After approval it analyzes and evaluates again; changed arguments, targets or
decisions invalidate that approval. Approval expires after one minute including
queue time, and main/child Agent timeouts continue. Approval resumes only the
original invocation and never expands sandbox scope.

Command regexes inspect invocation text; they do not discover hidden script,
expansion or subprocess effects. Pre-call checking supplies no OS isolation or
complete analysis of arbitrary code. Configure the independent sandbox for
filesystem/network enforcement.

Tests: `pnpm test:agent-runtime:permissions`,
`pnpm test:agent-runtime:pi-extensions`, `pnpm test:agent-runtime:sandbox-platform`.
The Pi suite checks all four switch combinations and inherited child policies with
real sessions and a local model stub.
