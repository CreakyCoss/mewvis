# Agent Context Boundary

This folder owns conversation context policy: token budgets, summary refresh,
relevant text selection, context-material assembly, and agent session sync state.

Feature code should treat this folder as the context boundary and pass in plain
inputs such as conversation messages, model context limits, referenced files,
minimal file/skill/agent context profiles, and an optional summarizer function.
React state, Tauri calls, workspace file IO, LLM calls, runtime
execution, application identity, tool-use policy, and workflow-specific prompt
instructions stay in the feature/API layers.

Use `index.ts` for all feature-layer imports. It exposes selected protocol
types from `contracts.ts` and one stable `agentContext` facade from
`public-api.ts`, so feature code is insulated from internal file layout, helper
names, and implementation type changes.

Internal layers:
- `core/`: durable context data types, token budgeting, conversation hashing,
  rolling summary updates, runtime history selection, and per-agent sync state.
- `prompt/`: context-material assembly and relevant text selection. This layer
  may read core conversation state, but it does not perform runtime or LLM calls
  and should not contain product identity or workflow-specific instructions.
- `engine/`: context engine interfaces, engine registry, built-in engines, and
  placeholder RAG/memory service contracts. It also contains reusable
  memory-backed runtime context policy for domain features with their own
  persistent memory fields.

Public surface:
- `contracts.ts`: protocol data shapes and the `AgentContextApi` facade type.
  Adding or changing feature-facing context contracts starts here.
- `public-api.ts`: facade over internal implementations. It builds the
  `agentContext` object and keeps full engine instances private.
- `index.ts`: the only supported external import path. Feature code should
  import from `@/ai/agent-context`, never from package internals, and keep runtime
  trace helpers in runtime-specific modules.

External callers should keep only engine ids and `ContextEngineDescriptor`
objects. They should call `agentContext.*` methods with `engineId` when a context
operation is needed. The full `ContextEngine` interface, registry helpers, and
built-in engine objects are SPI for this package only.

`ChatContextSummary.engine` records the active engine id/version and reserves
slots for future RAG index snapshots and memory layer snapshots. Engines can
also accept optional RAG and memory-layer services through `ContextEngineServices`.
The default engine keeps today's rolling-summary behavior and preserves those
future extension slots when rewriting context.

Built-in engines:
- `rolling-summary`: stable current behavior.
- `rag-index`: experimental RAG skeleton with a placeholder index service.
- `hybrid-memory`: experimental RAG + multi-layer memory skeleton.

Register built-in engines inside the engine layer and expose descriptors/actions
through the public facade. Feature settings can switch by engine id through
`agentContext.getContextEngineDescriptor(engineId)`.
