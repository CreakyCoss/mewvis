# AI domain

This folder owns shared AI capabilities used by desktop features.

- `agent-runtime/` owns runtime-facing contracts, Tauri runtime calls, and runtime model config assembly.
- `context/` owns stateless prompt assembly, token budgets, conversation summaries, context engines, resource loading helpers, and memory interfaces.
- `runtime-protocol/` adapts bridge protocol contracts into app-owned runtime aliases.
- `llm/` exposes the shared LLM model catalog protocol and facade; built-in raw data conversion lives under `llm/built-in-catalog/`.
- Feature-owned LLM settings and provider/model UI state live under `features/ai/llm/`.
- Feature-level chat, task, and summary runtime helpers live under `features/ai/runtime/`.

Feature modules should depend on these domain modules. Domain modules should not import from feature folders; feature-owned data should be adapted at the call site into the minimal types exposed by the domain module.
