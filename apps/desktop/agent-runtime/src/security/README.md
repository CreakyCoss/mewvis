# Runtime security

Approval, sandbox execution and their platform implementations live in this
directory. Agent adapters call the public safety/execution entries; resource and
platform helpers are internal to this module.

```text
security/
  access/                Protocol parsing and a generic, immutable access ceiling
    index.ts             Resolve host path bases, intersect ranges and reject undeclared operations
  safety/                Pre-call rules, approval and rechecking
    index.ts             Public flow and configuration validation
    policy.ts            Executable rules and permission profiles
    types.ts             Safety contracts
  execution/             Program execution and optional OS isolation
    index.ts             Config validation, policy resolution, execution and status
    policy.ts            Independent execution and sandbox configuration
    runtime/             Launcher, RPC and sandbox lifecycle
    cli/                 Sandbox status and setup command
    types.ts             Execution contracts
  platforms/             All OS-specific implementations
    index.ts             Process/channel selection and backend loading
    resources.ts         Shared path/domain helpers and platform path selection
    posix/               Config parsing, paths, process, channel and sandbox
    windows/             Config parsing, paths, process, channel, sandbox, ACL and setup
```

Use [`safety/index.ts`](safety/index.ts) to resolve permission profiles and check an
invocation, and [`execution/index.ts`](execution/index.ts) to run an injected
program. Their workflows remain separate so approval and isolation can be enabled
independently. Configuration lives in [`safety/policy.ts`](safety/policy.ts) and
[`execution/policy.ts`](execution/policy.ts).

Both layers use `platforms/resources.ts` for platform selection, canonical paths,
directory variables and shared domain matching. This resource entry has no sandbox
imports, so using approval alone does not load an execution backend.
`platforms/index.ts` selects execution implementations and loads SRT/setup modules
only when requested. Platform implementations share the same platform selector.

[`build-entries.json`](../../build-entries.json) declares the source locations and
output names for the execution launcher and sandbox control command. Agent SDK
tools and argument decoding remain in their engine adapters.

See [approval rules](safety/README.md) and [program execution](execution/README.md)
for configuration, lifecycle and verification details.

`agentAccess` is an optional host-supplied ceiling separate from `permissions.mode`.
Its source of truth is `protocol/v1/schema/access.schema.json`; SDK declarations
are generated from it. `access/index.ts` validates the schema, resolves path bases
and defaults missing capabilities to deny. The ordinary host omits the ceiling;
the plugin boundary always supplies its installed declaration, including `{}` when
none was declared. The security module has no plugin identity or enablement logic.

The pre-call gate rejects known out-of-scope operations before approval, even with
approval disabled. Execution intersects filesystem/network policies with the same
ceiling; opaque tools and subprocesses stay in that sandbox. Node workers also use
the Node permission model to gate process creation and disable native addon/FFI/worker
escape routes. This does not isolate the separate native plugin service itself.
Scoped execution requires an enabled sandbox and an adapted execution program;
unsupported programs/platform restrictions fail closed. Child agents inherit the
entire policy snapshot. Disabling a plugin cancels its tasks through the native host.

Run `pnpm test:agent-runtime:access` for real filesystem, symlink, process and network
containment tests; `pi-extensions-e2e.mjs` also exercises full mode and child inheritance.
