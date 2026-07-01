import type { RuntimeAgent } from "../types.js";
import { MockAgent } from "./agent.js";
import { MockChatRuntime } from "./chat.js";

export const mockRuntimeAgent = {
  id: "mock",
  label: "Mock",
  description: "本地模拟回复，用于验证 agent-runtime 与 engines/drivers/native/agent 链路。",
  capabilities: ["agent", "chat"],
  requiresModel: false,
  agent: new MockAgent(),
  chat: new MockChatRuntime(),
} satisfies RuntimeAgent;
