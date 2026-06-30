# Runtime Session Layers

`engines/native/agent/session` owns agent-specific prompt assembly, agent session mutations, and runtime command adapters.

- Shared ledger storage, context projection, and standard metadata live in `../../session/`.
- `core/`: agent prompt budget helpers.
- `metadata/`: app/runtime-specific metadata adapters.
- `operations/`: user/session commands such as create, read, append, edit, delete, rebuild, and compact.
- `runtime/`: runtime command adapters, event recording, system prompt handling, and agent session planning.

Prefer importing from the narrowest layer when editing internals. Use `../../session/index.ts` only for engine-level session queries; public DTOs live in `../../../protocol/session.ts`.
