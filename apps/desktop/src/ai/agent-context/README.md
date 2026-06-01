# Agent Context Boundary

This folder owns conversation context policy: token budgets, summary refresh,
relevant text selection, prompt context assembly, and agent session sync state.

Feature code should treat this folder as the context boundary and pass in plain
inputs such as conversation messages, model context limits, referenced files,
minimal workspace/skill/agent prompt profiles, and an optional summarizer
function. React state, Tauri calls, workspace file IO, LLM calls, and runtime
execution stay in the feature/API layers.

Use `runtime-context.ts` for orchestration-level calls from UI code. It exposes
the `ContextEngine` interface, registry helpers, and the built-in engines, so
feature code can switch context implementations without branching around
summary, prompt, or agent-session details.

Internal layers:
- `core/`: durable context data types, token budgeting, conversation hashing,
  rolling summary updates, runtime history selection, and per-agent sync state.
- `prompt/`: prompt assembly and relevant text selection. This layer may read
  core conversation state, but it does not perform runtime or LLM calls.
- `engine/`: context engine interfaces, engine registry, built-in engines, and
  placeholder RAG/memory service contracts.
- `memory/`: agent execution memory extraction and summarization helpers.

`index.ts` is the single public entry point that re-exports the layered
implementation. New code inside this package should import from the internal
layer it actually needs; feature code should import from `@/ai/agent-context`.

`ChatContextSummary.engine` records the active engine id/version and reserves
slots for future RAG index snapshots and memory layer snapshots. Engines can
also accept optional RAG and memory-layer services through `ContextEngineServices`.
The default engine keeps today's rolling-summary behavior and preserves those
future extension slots when rewriting context.

Built-in engines:
- `rolling-summary`: stable current behavior.
- `rag-index`: experimental RAG skeleton with a placeholder index service.
- `hybrid-memory`: experimental RAG + multi-layer memory skeleton.

Register new engines with `registerContextEngine(engine)` and expose them through
`listContextEngines()`. The workspace chat settings panel already switches by
engine id through `getContextEngine(engineId)`.
