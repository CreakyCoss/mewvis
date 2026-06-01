# AI domain

This folder owns shared AI capabilities used by desktop features.

- `llm/` owns provider/model settings types, model catalog data, and runtime model config assembly.
- `agent-runtime/` owns runtime-facing contracts, Tauri runtime calls, and provider/model conversion for execution.
- `agent-context/` owns prompt assembly, token budgets, conversation summaries, context engines, and memory interfaces.

Feature modules should depend on these domain modules. Domain modules should not import from feature folders; feature-owned data should be adapted at the call site into the minimal types exposed by the domain module.
