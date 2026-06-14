# AI domain

This folder owns shared AI capabilities used by desktop features.

- `agent-runtime/` owns runtime-facing contracts, Tauri runtime calls, and runtime model config assembly.
- `agent-context/` owns prompt assembly, token budgets, conversation summaries, context engines, and memory interfaces.
- `llm/` exposes the shared LLM model catalog; implementation details live under `llm/model/`.
- Feature-owned LLM settings and provider/model UI state live under `features/ai/llm/`.
- Feature-level chat, task, and summary runtime helpers live under `features/ai/runtime/`.

Feature modules should depend on these domain modules. Domain modules should not import from feature folders; feature-owned data should be adapted at the call site into the minimal types exposed by the domain module.
