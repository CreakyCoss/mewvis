import { PiAgent } from "./agent.js";
import { PiChatRuntime } from "./chat.js";
import type { BridgeAgent } from "../../contracts/runtime.js";

export const piBridgeAgent = {
  id: "pi",
  agent: new PiAgent(),
  chat: new PiChatRuntime(),
} satisfies BridgeAgent;
