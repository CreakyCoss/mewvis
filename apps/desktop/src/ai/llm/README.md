# LLM domain

This folder owns application-wide LLM domain data and helpers.

- `@agent-bridge/llm` is the bridge catalog public entrypoint.
- `@agent-bridge/llm/config.ts` contains manually maintained runtime API mappings.
- `@agent-bridge/llm/data.ts` is the internal generated model catalog synced from `models.dev`.
- `model-catalog.ts` re-exports bridge catalog lookup and assembles runtime model config.
- `types.ts` contains provider/model settings types shared by settings UI, agents, chat, and runtime adapters.

Feature modules such as `features/llm-settings` should depend on this folder for catalog data, while lower-level runtime modules should not import from feature folders.
