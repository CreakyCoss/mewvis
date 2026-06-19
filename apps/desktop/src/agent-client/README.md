# Agent Client

Renderer-side client SDK for agent capabilities. The desktop implementation uses Tauri to reach the native agent service.

- `runtime.ts` wraps Tauri commands and event subscriptions for agent and chat runs.
- `contracts/` defines the renderer-facing client input, output, and event types.
- `protocol.ts` adapts native agent contracts and model catalog exports into app-owned aliases.
- `output.ts` contains small helpers for collecting streamed output events.

Feature modules should adapt their own data into these SDK types at the call site.
