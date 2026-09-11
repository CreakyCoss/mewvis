# Program execution

This module launches adapter-supplied programs and owns RPC, cancellation, timeouts
and cleanup. OS sandboxing is an optional backend. Execution does not import an
Agent SDK or the safety module, construct tools, load plugins or interpret skills.

## Configuration and flow

[`policy.ts`](policy.ts) controls execution independently from
[`../safety/policy.ts`](../safety/policy.ts):

- `enabled: true`: initialize the configured sandbox before starting the program.
  Missing dependencies, configuration drift and startup failures reject execution.
- `enabled: false`: start an ordinary child process using executable + argument
  vector directly, with no SRT initialization, OS isolation or proxy injection.
- `baseline` and `profiles`: sandbox read/write/domain scopes. The request's mode
  selects a sandbox profile only when enabled. Profiles do not contain approval
  thresholds or permission labels.
- `backend.name` / `backend.version`: selected backend and declared SDK version.
- `backend.options`: backend parameters, currently SRT mandatory file protections.
- `backend.platforms`: platform parameters; POSIX system write paths/scratch directory
  and Windows helper, ACL, proxy and setup settings. Only the running platform is
  resolved. These settings have no effect on pre-call safety rules.
- `environment`: the worker's environment allowlist in both execution modes. Model
  credentials in host commands are never forwarded to the execution process.

Both layers are enabled by default. Turning off either flag does not change the
other layer or the frontend's mode. Turning off both runs ordinary child processes
without approval/range checks or OS isolation. The process environment contract,
RPC, diagnostics, cancellation and timeouts remain active in all combinations.
The two scopes are independent; approving a call never expands a sandbox grant.

Configuration is bundled; rebuild and restart after edits. `resolveExecutionPolicy()`
returns a run snapshot containing workspace, environment and an optional sandbox
policy. Main and child Agents inherit the same pair of safety/execution snapshots.
A disabled sandbox reports `state: disabled` in application settings and requires
no setup. Status/install commands do not resolve or initialize a disabled backend.

`index.ts` validates the common data contract, selects the profile, merges resource
scopes, and calls `platforms/index.ts` to resolve backend parameters. Platform
schemas and path conversion live in `platforms/posix/config.ts` and
`platforms/windows/config.ts`. The common parser contains no OS branches, SRT field
schema or fixed SDK version. Backend options must be JSON data: functions are
rejected and snapshots share no mutable arrays/objects with the source config.

Application settings and CLI use the public `getSandboxStatus()` and
`installSandbox()` methods. They accept optional `config`, `workspacePath` and
`runtimePath`, resolve the same backend parameters as execution and pass that
snapshot into backend status/setup methods. The CLI handles argument parsing and
JSON output only; platform setup never reads the global configuration itself.
SRT version, intrinsic protections and platform compatibility are checked before
reporting readiness or starting execution. Unsupported or incompatible backends
report unavailable, and failed startup never retries without isolation.

Adapters construct `ProgramExecutor({ policy, program })`, with an executable and
literal arguments selected by trusted adapter code. The launcher chooses the
sandbox backend or ordinary spawning. Node workers call `serveWorker()` and provide
method handlers; RPC uses `id`, `method`, `input` and result/error/progress replies.
An arbitrary CLI needs a bridge implementing that protocol.

[`build-entries.json`](../../../build-entries.json) declares source entries and output
filenames for the build, runtime, desktop controller and fixtures. The generic
launcher is `executionHost`; bundles and SRT assets share the `dist` root.

## Sandbox scopes

Paths accept absolute names and `${workspace}`, `${home}`, `${temp}`, `${runtime}`.
Backend paths also use `${nodeDirectory}`, `${programData}` and `${arch}`. Paths are
canonicalized including symlinks. Reads are allowed except for denied paths;
writes require an allowed root and must not match any denial. Baseline and profile
denials are combined. The default full profile permits workspace/home/temp writes;
ask/auto permit workspace/temp writes. Backend-required write roots also apply.

Network uses HTTP/HTTPS/SOCKS proxies, including local targets. `network.allow`
accepts exact domains, `*.example.com` or `"all"`; deny takes precedence. All three
sandbox profiles permit proxy domains by default. The independent safety policy
retains the ask profile's restriction on decoded network operations. This is not
unrestricted raw sockets/UDP or server binding. Programs must honor proxy settings;
the sandboxed Node worker enables environment-proxy support. Rules cannot express
HTTP paths or whether an operation publishes/deletes remote data.

The SRT backend is pinned to 0.0.75. It compares declared mandatory protections with
the installed backend and rejects drift. Its Unix system write paths and scratch
directory (`/tmp/claude`) are explicit; the launcher avoids SRT's implicit macOS
system-temp-parent grant. Adding application restrictions belongs in baseline or
profiles. Editing the declaration cannot remove an intrinsic backend protection.

Each isolated executor owns its SRT instance and proxy servers. The POSIX backend
uses Seatbelt or bubblewrap; Windows uses the existing experimental backend below.
Worker output is diagnostic; Unix RPC uses a separate descriptor and Windows uses
an authenticated named pipe. Cancellation/timeout stops the execution tree; later
calls can recreate the worker with the same execution policy. Process cleanup does
not promise that malicious plugins cannot deliberately detach background processes.

## Layout

- `policy.ts`: the one editable execution configuration.
- `index.ts`: common validation, snapshot resolution, status/setup and execution lifecycle.
- `types.ts`: pure transport/status contracts, also used by the frontend.
- `runtime/client.ts`, `runtime/server.ts`: RPC framing and replies.
- `runtime/launcher.ts`: backend selection, program spawning and cleanup.
- `runtime/sandbox.ts`: backend dispatch; unknown backend names are rejected.
- `runtime/srt.ts`: SRT contract/version checks, command wrapping and status/setup delegation.
- `runtime/workspace-queue.ts`: host-process queues for per-workspace operation ordering.
- `../platforms/index.ts`: platform selection for processes, channels and sandbox setup.
- `../platforms/posix`, `../platforms/windows`: platform parameter parsing and execution implementations.
  Their `config.ts` files contain parsers, not another set of editable settings.
- `cli/control.ts`: application status/setup entry.

Pi owns its tool factories in `runtimes/pi/tools/worker.ts` and `tools/shell.ts`.
`platforms/*/process.ts` selects the available command shell. Model/session
control, questions and delegation stay in the host.
Adapters opt operations into `serializeWorkspaceOperation` through `index.ts`.
Queue state stays in the host process when operations are dispatched to execution workers.
The same worker runs in either execution mode. PluginHost and plugin UI are outside
this Agent-tool boundary.

Validation: `pnpm test:agent-runtime:sandbox` covers isolated and ordinary spawning,
RPC, resource boundaries, startup failure, cancellation, timeout and cleanup.
`pnpm test:agent-runtime:pi-extensions` covers all four layer combinations and
subagent inheritance. Windows native validation remains outstanding.

## Windows setup and limitations

Open **应用设置 → Agent 沙箱** to inspect readiness and initialize/repair Windows
sandboxing. Setup invokes the bundled `sandbox-control.js install`, which calls
SRT's installer; the OS requests one UAC confirmation. Agent tools never invoke
this setup action. A cancelled installation leaves execution unavailable. The
same controller supports `node sandbox-control.js status` for diagnostics.
Both x64 and ARM64 helpers ship in runtime resources. Command tools prefer native
Git Bash/MSYS2/Cygwin; WSL launchers are not selected as native Bash. When native
Bash is absent, the adapter selects PowerShell 7 or Windows PowerShell, including
the standard system location when it is missing from PATH. It exposes Pi's
`powershell` tool with PowerShell syntax, UTF-8 output and no profile loading.
The default allocation permits either tool; explicit tool allowlists must include
`powershell` to use it. If neither shell exists, file and plugin tools remain
available. Both command tools retain the same approval, sandbox and timeout flow.
Windows sandbox initialization is separate from shell selection.

The Windows backend is **alpha** and applies ACLs to one machine-wide sandbox
account. Separate SRT instances alone do not isolate their grants. Isle uses an
SQLite lease transaction under SRT's protected state directory before applying
ACLs: equal filesystem/network scopes may run concurrently; different scopes are
rejected until the active tasks finish. Approval thresholds are not part of that
scope, so ask/auto can coexist when their resource ranges match. Parents and
subagents share the same snapshot. Cleanup waits for initialization, terminates
the helper process tree/job, checks SRT's per-path ACL cleanup results, resets SRT,
then releases the lease. The next start reconciles a dead launcher's ACL records
before removing its lease; failed reconciliation retains the record and rejects
execution. Different applications
using the same SRT account do not participate in Isle's lease protocol.

Windows mandatory protections cover concrete workspace paths (including targets
not yet present) plus existing matches under writable roots to the configured
`mandatorySearchDepth`. As with Linux's startup discovery, new nested matching
paths appearing after startup are not covered by that discovery pass. Use explicit
baseline directory denials for persistent resource restrictions. File-tool
prechecks additionally match protected names on each invocation. macOS uses
runtime path patterns. These backend differences must not be mistaken for
identical hostile-process isolation on all operating systems.

For missing literal deny targets, SRT temporarily materializes empty placeholders
on the real filesystem and removes its untouched placeholders during cleanup.
The adapter collapses overlapping denials so a parent placeholder does not conflict
with a child target; it also avoids treating a Git worktree marker file as a
directory. Explicit read/write grants inside a denied ancestor are removed, so
Windows ACL inheritance does not accidentally turn them into denial exceptions.

Windows per-user tool installations need readable paths in
`backend.platforms.windows.readGrantPaths`; this defaults to the caller's home and bundled
runtime in addition to the workspace. Native tools using Schannel may encounter
certificate-revocation requests that cannot traverse the proxy. We do not disable
certificate revocation globally. See the pinned SRT Windows documentation for
backend-specific network and account limitations.

Validation from `apps/desktop`: `pnpm test:agent-runtime:sandbox` runs the platform
contract/lease/packaging checks and real OS execution checks. On Windows, first
initialize the sandbox. The Bash-specific sandbox suite still requires native Bash;
`pnpm test:agent-runtime:shell` also checks PowerShell without Git Bash. The suite checks conflicting
scopes are rejected, equal scopes coexist, and cleanup preserves remaining grants.
Native Windows runtime claims require running that suite on a Windows machine;
cross-compilation and macOS tests alone do not prove Windows isolation.
