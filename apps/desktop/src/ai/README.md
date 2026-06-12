# AI domain

This folder owns shared AI capabilities used by desktop features.

- `agent-runtime/` owns runtime-facing contracts, Tauri runtime calls, and runtime model config assembly.
- `agent-context/` owns prompt assembly, token budgets, conversation summaries, context engines, and memory interfaces.
- Feature-owned LLM settings, catalog data, and provider/model UI state live under `features/llm-settings/`.

Feature modules should depend on these domain modules. Domain modules should not import from feature folders; feature-owned data should be adapted at the call site into the minimal types exposed by the domain module.
