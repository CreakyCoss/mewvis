# Runtime Session Layers

`session` owns the runtime-side ledger, context projection, runtime prompt assembly, and session mutations.

- `core/`: pure ledger and prompt algorithms. Keep this layer free of filesystem writes and runtime-specific command handling.
- `storage/`: filesystem paths, JSONL ledger persistence, and context cache writes.
- `metadata/`: standard runtime metadata normalization plus app/runtime-specific metadata adapters.
- `operations/`: user/session commands such as create, read, append, edit, delete, rebuild, and compact.
- `runtime/`: runtime command adapters, event recording, system prompt handling, and agent session planning.

Prefer importing from the narrowest layer when editing internals. Use `session/index.ts` for stable public exports.
