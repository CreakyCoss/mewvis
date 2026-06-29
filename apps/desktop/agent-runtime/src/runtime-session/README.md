# Runtime Session Layers

`runtime-session` owns the runtime-wide append-only ledger, trace paths, metadata normalization, and context projection.

- `contracts/`: session result shapes shared by agent and collaboration APIs.
- `core/`: ledger entry types and pure projection helpers.
- `metadata/`: standard metadata normalization shared by runtime features.
- `storage/`: filesystem paths and JSONL ledger persistence.
- `trace/`: JSONL trace helpers for runtime timeline events.

Agent-specific prompt assembly and agent session maintenance stay under `agent-engine/session/`.
