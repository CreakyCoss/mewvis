import type { AgentRuntimeAdapter } from "./base";
import { TauriBridgeCodingAgentAdapter } from "./adapters/tauri-bridge";

export type AgentRuntimeAdapterId = "tauri-bridge";

const adapters = {
  "tauri-bridge": () => new TauriBridgeCodingAgentAdapter(),
} satisfies Record<AgentRuntimeAdapterId, () => AgentRuntimeAdapter>;

export const createAgentRuntimeAdapter = (
  adapterId: AgentRuntimeAdapterId = "tauri-bridge",
) => adapters[adapterId]();
