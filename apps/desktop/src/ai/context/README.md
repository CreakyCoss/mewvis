# Context Internals

This directory contains the stateless context algorithms and protocol shapes
still reused by the application: token budgeting, conversation types,
prompt/reference formatting, RAG contracts, resource loading helpers, and
memory-backed Tavern context.

Feature code should import from `@/ai/context` for public types and helpers.
That facade deliberately exposes only stateless context utilities; chat/session
ledger ownership lives in `agent-bridge`.

Current boundary:

- `core/`: conversation normalization, summary shape helpers, and token budget
  utilities.
- `prompt/`: context-material assembly and reference formatting helpers.
- `engine/`: context engine descriptors and memory/RAG-oriented algorithms still
  used by non-chat flows.
- `protocol/`: durable type contracts for context, prompts, memory, RAG, and the
  slim helper facade.
- `agent.ts`, `debug.ts`, `resources.ts`: app-facing types and helpers that do
  not own chat/session state.
- `public-api.ts`: internal adapter that backs the public facade.

Removed boundary:

- Stateful `session/` orchestration has been deleted. Chat context, ledger,
  compaction, branch/edit/delete/rebuild, and agent session distribution now
  belong to `agent-bridge`.
- App-side chat storage keeps only UI-owned session metadata and raw messages;
  it does not own conversation summaries, traces, or runtime context files.
