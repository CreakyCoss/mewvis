# Native Runtime Session

`engines/native/session` is the single native session subsystem. It serves both
external runtime APIs and internal agent/collaboration runtime needs without
requiring callers to know which storage implementation is active.

Public DTOs and command shapes live in `../../protocol/session.ts` and related
protocol files. This directory is native implementation only; do not add storage,
ledger, provider, or recorder details to the public protocol for internal
convenience.

## Layers

- `manager.ts`: session-bound manager and list helper. Callers create a manager
  with `workspacePath` and `sessionRootDir`; the manager initializes the native
  session through the active provider and exposes pure runtime session
  capabilities such as read/append/edit/delete/rebuild, summarize, compact,
  whole-session delete, runtime snapshot, collaboration timeline, artifact
  paths, agent-visible context, and session-backed runtime turn preparation.
  The manager resolves the active provider once and delegates standard session
  operations to that provider.
- `internal/`: manager implementation helpers. `service.ts` handles
  read/append/edit/delete/rebuild/summarize operations; `writer.ts` owns handle
  opening, manifest refresh, and JSONL-backed runtime turn preparation;
  `storage.ts` contains the JSONL-style storage adapter contract used only by
  providers that choose that implementation strategy.
- `recorder.ts`: session-owned runtime event/message recorder used by native
  agent and chat execution. It delegates to the active provider's semantic
  recorder interface.
- `model/`: ledger entry types, context projection, metadata normalization,
  runtime command/link types, and prompt budget helpers.
- `providers/`: replaceable session providers. Provider selection follows the
  same static manifest/registry style as native agent runtimes. The default
  provider is `providers/jsonl/`; future SQLite or remote providers should
  implement the standard session operations in `providers/types.ts` and be
  added to `providers/registry.ts`. Callers must not depend on JSONL, ledger
  entries, or leaf ids, and non-JSONL providers do not need to simulate them.
- `artifacts.ts`: provider-backed session-scoped artifact locations. Runtime
  features choose their own artifact namespaces without depending on storage
  files.

Runtime consumers keep their own integration code outside this directory. Agent
prompt/artifact/maintenance integration lives under `../agent/session`, and
collaboration session recording lives under `../collaboration/`.
Agent-owned session operations, such as compacting or rebuilding an underlying
agent session, should stay there instead of becoming runtime session manager
methods. Runtime session compaction is a separate manager capability that
compacts this subsystem's own session content.

## Provider Contract

External callers should depend on `createRuntimeSessionManager()` or
`listRuntimeSessions()`, not provider resolution or JSONL files. Session
internals may use `providers/resolver.ts`. Switching to SQLite or a remote
session provider should be a provider registry change, not a public protocol
change.

Provider implementations own their storage model. The required contract is the
semantic session API: initialize/refresh, prepare a runtime turn, create a run
recorder, read/list snapshots, mutate messages, compact/delete runtime session
content, record session events and traces, expose agent-visible context, and
resolve session artifacts. Ledger entries and leaf ids are JSONL details only.

The session subsystem owns the internal command and link protocol in
`model/runtime-command.ts`. Agent and chat runtimes may structurally satisfy that
protocol, but the session layer should not import runtime implementation types
from `agent/`.

The JSONL provider currently persists:

- `ledger.jsonl`: messages, request context, runtime instructions, and custom
  maintenance records.
- `trace.jsonl`: streamed runtime events and collaboration workflow events.
- `session.json`: derived manifest refreshed after writes and rebuilt by queries
  when missing or stale.
