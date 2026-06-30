# Runtime Session Layers

`session` owns the runtime-wide append-only ledger, trace paths, summary manifest, metadata normalization, and context projection.

- `core/`: ledger entry types and pure projection helpers.
- `manifest/`: `session.json` summary index for fast session listing/debug panels.
- `metadata/`: standard metadata normalization shared by runtime features.
- `storage/`: filesystem paths and JSONL ledger persistence.
- `trace/`: JSONL trace helpers for runtime timeline events.

Public session DTOs live in `../../protocol/session.ts`; this directory is engine implementation.

The authoritative data remains append-only:

- `ledger.jsonl`: user/system/assistant messages, request context, runtime instructions, and custom maintenance records.
- `trace.jsonl`: streamed runtime events and collaboration workflow events.
- `session.json`: derived manifest refreshed after runtime writes and rebuilt by queries when missing or stale.

Agent-specific prompt assembly and agent session maintenance stay under `../agent/session/`.
