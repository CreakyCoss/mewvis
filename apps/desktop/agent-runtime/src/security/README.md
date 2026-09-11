# Runtime security

Approval, sandbox execution and their platform implementations live in this
directory. Agent adapters call the public safety/execution entries; resource and
platform helpers are internal to this module.

```text
security/
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
