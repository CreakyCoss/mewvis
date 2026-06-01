# LLM domain

This folder owns application-wide LLM domain data and helpers.

- `models.generated.ts` is the generated model catalog synced from `ai/pi`.
- `model-catalog.ts` exposes catalog lookup and runtime model config assembly.
- `types.ts` contains provider/model settings types shared by settings UI, agents, chat, and runtime adapters.

Feature modules such as `features/llm-settings` should depend on this folder for catalog data, while lower-level runtime modules should not import from feature folders.
