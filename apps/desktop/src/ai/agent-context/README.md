# Agent Context Boundary

This folder owns conversation context policy: token budgets, summary refresh,
relevant text selection, context-material assembly, and agent session sync state.

Feature code should treat this folder as the context boundary. Long-lived
conversation context should be accessed through `agentContext.createSessionManager()`
or the compatibility alias `agentContext.createSession()`. The returned object is
the session handle: callers create it with stable app identity such as `chatId`,
model context, summarizer, and optional adapters for file loading, knowledge
search, prompt building, and prompt execution.

The preferred per-turn API is `session.prompt(...)`. It owns the prompt turn
pipeline: conversation state, referenced-file loading, context preparation,
optional knowledge search, prompt material assembly, runner dispatch, context
finalization, and trace/debug snapshots. Prompt results include a standardized
`debugSnapshot` with context facts, prompt material, runtime messages, and
retrieved knowledge. Feature code may enrich that snapshot with UI/runtime
labels such as mode, provider, model, or agent session id, but should not rebuild
the core context facts itself. Callers can inspect `session.snapshot()`,
`session.getConversation()`, `session.getTrace()`, `session.getLastPrompt()`,
`session.getDebugSnapshot()`, or `session.get()` for the current context. Lower-level lifecycle methods
(`prepareConversation`, `compressConversation`, `rebuildAfterHistoryChange`,
`invalidateAfterHistoryChange`, `finalizeChatTurn`, and `finalizeAgentRun`) remain
available for migration and specialized flows.

Adapters such as `loadFile`, `searchKnowledge`, `buildSystemPrompt`, and
`runPrompt` can be supplied at creation time or refreshed with `session.set(...)`
when application state changes. Per-turn calls should prefer stable data such as
`text`, `conversation`, `references`, `activeFile`, `activeSkills`, and
`selectedAgent` over passing new adapter functions each time.
Resources that enter model context should be resolved by this package, either
inside `session.prompt(...)` / `session.prepareAgentTurn(...)` or explicitly via
`session.loadResources(...)`. UI-only reads such as editor previews can remain
in feature code, but feature code should pass file descriptors and IO adapters
instead of prebuilding model-context resource payloads.

Agent runtime bridge turns should use `session.prepareAgentTurn(...)`. It runs
the same preparation pipeline as `session.prompt(...)`, then derives the runtime
agent session id, bootstrap context, bridge prompt, and history slices from the
session-owned context state.

React state, Tauri calls, workspace file IO, LLM calls, runtime execution,
application identity, tool-use policy, and workflow-specific prompt instructions
should be injected as adapters instead of being hard-coded into this package.

Use `index.ts` for all feature-layer imports. It exposes selected protocol
types from `protocol/` and one stable `agentContext` facade from `public-api.ts`,
so feature code is insulated from internal file layout, helper names, and
implementation type changes.

Internal layers:
- `protocol/`: durable feature-facing data contracts, grouped by domain:
  conversation context, prompt material, RAG, memory, descriptors, and session
  protocol. This is the source of public type exports.
- `session/`: stateful conversation-context session orchestration. It owns the
  session handle, active engine id, current context snapshot, model/summarizer
  selection, per-turn prompt orchestration, trace/debug data, and lifecycle
  methods for prepare/compress/rebuild/invalidate/finalize.
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
and `AgentContextSessionManager` instances. Per-turn work should go through
`session.prompt(...)`; migration code may still call the lower-level lifecycle
methods on the same session. The full `ContextEngine` interface, registry
helpers, built-in engine objects, and raw engine operation inputs are SPI for
this package only.

When passing session capabilities across feature boundaries, prefer the narrow
interfaces exported from `@/ai/agent-context`: `AgentContextSessionTurnRunner`
for prompt turns, `AgentContextConversationSelector` for recent-message
selection, `AgentContextConversationContextController` for maintenance flows,
`AgentContextSessionResourceLoader` for resource resolution, and
`AgentContextSessionStateReader` for UI inspection. Avoid handing a full
`AgentContextSessionManager` to code that only needs one of those capabilities.

Minimal manager shape:

```ts
const session = agentContext.createSessionManager({
  chatId,
  modelContext,
  summarizer,
  loadFile: ({ path }) => readWorkspaceFile(workspacePath, path),
  runPrompt: ({ systemPrompt, runtimeMessages }) =>
    runModel({ systemPrompt, messages: runtimeMessages }),
});

const result = await session.prompt({
  text,
  references: referencedFiles.map(({ path }) => ({ path })),
  activeSkills,
  selectedAgent,
});

const context = session.get();
const trace = session.getTrace();
```

Workspace storage layout:

```text
<workspace>/.novel-claw/chats/<chatId>/
  meta.json
  messages.json
  conversation.json
  context.json
  trace.json
  sessions/<agentId>/<sessionId>/

<workspace>/.novel-claw/tavern/<roomId>/
  meta.json
  room.json
  messages.json
  conversation.json
  context.json
  sessions/<agentId>/<sessionId>/
```

`meta.json` is the lightweight source for sidebar/list rendering. Application
conversation data is split into messages, app conversation state, app context,
and trace files. Agent runtime files live only under the owning chat or tavern
folder's `sessions/` tree; the legacy global `.novel-claw/agent-sessions`
directory is treated as removable old data, not a migration source.
Chat callers can use the default agent session root. Tavern callers should pass
`agentSessionRoot: "tavern"` to `prepareAgentTurn(...)` when they adopt the same
manager path.

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
