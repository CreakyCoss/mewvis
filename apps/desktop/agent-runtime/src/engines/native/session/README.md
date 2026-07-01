# Native Runtime Session

`engines/native/session` is the single native session subsystem. It serves both
external runtime APIs and internal agent/collaboration runtime needs without
requiring callers to know which storage implementation is active.

Public DTOs and command shapes live in `../../protocol/session.ts` and related
protocol files. This directory is native implementation only; do not add storage,
ledger, provider, or recorder details to the public protocol for internal
convenience.

## Layers

- `native-session-service.ts`: native-facing adapter for public
  runtime/session APIs. `native/index.ts` talks to this file. Runtime-specific
  behavior, such as agent compact/rebuild or summary generation, is injected as
  handlers instead of imported by the session subsystem.
- `service.ts`: session application service for create/read/append/edit/delete,
  rebuild, and summarize. It uses the provider contract and does not know which
  backend is active.
- `writer.ts`: stable internal write/turn helpers used by runtime consumers.
  It owns opening a session handle, refreshing manifests, and preparing
  session-backed runtime turns.
- `model/`: ledger entry types, context projection, metadata normalization,
  runtime command/link types, and prompt budget helpers.
- `providers/`: replaceable storage providers. The default provider is
  `providers/jsonl/`; future SQLite or remote providers should implement
  `providers/types.ts` and register through `providers/registry.ts`.
- `artifacts.ts`: provider-backed session-scoped artifact locations. Runtime
  features choose their own artifact namespaces without depending on storage
  files.

Runtime consumers keep their own integration code outside this directory. Agent
session prompt/recorder/maintenance lives under `../agent/session`, and
collaboration session recording lives under `../collaboration/`.

## Provider Contract

Callers should depend on `resolveRuntimeSessionProvider()` or
`createNativeSessionService()`, not on JSONL files. Switching to SQLite or a
remote session backend should be a provider change, not a public protocol change.

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
