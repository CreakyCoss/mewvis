# Agent Client Contracts

This directory is the frontend contract boundary for agent-runtime features.

- `index.ts` directly defines all application-level payloads whose semantics
  differ from wire data: client inputs/results, event envelopes, session options,
  and ledger operations. It is the single import entry for application contracts.
- `tauri.ts` is the authoritative map of Tauri command arguments/results and event payloads.
- `../wire.ts` is the only frontend import of the TypeScript Protocol SDK under
  `agent-runtime/protocol/v1/sdk`; unchanged wire payloads keep their generated
  names and types. Semantically different frontend or
  Tauri payloads are independent application contracts connected by explicit
  adapters or envelopes; they are not `Pick`/`Omit` projections of wire types.
  The SDK re-exports generated bindings and generated discriminator helpers.
  These contracts must not import generated files directly or depend on the
  runtime engine's internal command types.
- JSON-RPC envelopes (`jsonrpc`, `id`, `method`, `params`) belong to the Rust-to-runtime transport and must not leak into React components.

When adding an agent-runtime Tauri command or event, update `tauri.ts` first and call it through `src/api/agent-runtime.ts`.
