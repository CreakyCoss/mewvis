# Agent Context Boundary

This folder owns conversation context policy: token budgets, summary refresh,
relevant text selection, context-material assembly, and agent session sync state.

Feature code should treat this folder as the context boundary. Long-lived
conversation context should be accessed through `agentContext.createSession()`;
callers may pass a manager created by `agentContext.createSessionManager()` when
they need to own the session handle, or let `createSession()` create the default
in-memory manager.
The returned session exposes lifecycle methods to prepare, compress, rebuild,
invalidate, finalize, and read summary state; engine plans and prompt payload
assembly remain internal.
React state, Tauri calls, workspace file IO, LLM calls, runtime execution,
application identity, tool-use policy, and workflow-specific prompt instructions
stay in the feature/API layers.

Use `index.ts` for all feature-layer imports. It exposes selected protocol
types from `protocol/` and one stable `agentContext` facade from `public-api.ts`,
so feature code is insulated from internal file layout, helper names, and
implementation type changes.

Internal layers:
- `protocol/`: durable feature-facing data contracts, grouped by domain:
  conversation context, prompt material, RAG, memory, descriptors, and session
  protocol. This is the source of public type exports.
- `session/`: stateful conversation-context session orchestration. It owns the
  session manager, active engine id, current context snapshot,
  model/summarizer selection, and lifecycle methods for
  prepare/compress/rebuild/invalidate/finalize.
- `core/`: durable context data types, token budgeting, conversation hashing,
  rolling summary updates, runtime history selection, and per-agent sync state.
- `prompt/`: context-material assembly and relevant text selection. This layer
  may read core conversation state, but it does not perform runtime or LLM calls
  and should not contain product identity or workflow-specific instructions.
- `engine/`: context engine SPI, registry, built-in strategy registration, and
  rolling-summary engine implementation. `engine/types.ts` defines internal SPI,
  `engine/registry.ts` owns registration/lookup, and `engine/runtime-context.ts`
  contains the current rolling-summary strategy.

Public surface:
- `protocol/`: protocol data shapes and session API types. Adding or changing
  feature-facing context contracts starts here.
- `public-api.ts`: facade over internal implementations. It builds the
  `agentContext` object, exposes session/session-manager creation, and keeps full
  engine instances private.
- `index.ts`: the only supported external import path. Feature code should
  import from `@/ai/agent-context`, never from package internals, and keep runtime
  trace helpers in runtime-specific modules.

External callers should keep only engine ids, `ContextEngineDescriptor` objects,
and `AgentContextSession` instances. Context operations should go through a
session instead of calling engine helpers directly. The full `ContextEngine`
interface, registry helpers, built-in engine objects, and raw engine operation
inputs are SPI for this package only.

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
