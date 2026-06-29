import { PiAgent } from "./agent/index.js";
import { PiChatRuntime } from "./chat/index.js";
import type { RuntimeAgent } from "../types.js";

export const piRuntimeAgent = {
  id: "pi",
  label: "Pi",
  description: "使用 Pi coding agent 和 Pi AI 运行真实任务。",
  capabilities: ["agent", "chat"],
  requiresModel: true,
  agent: new PiAgent(),
  chat: new PiChatRuntime(),
} satisfies RuntimeAgent;
