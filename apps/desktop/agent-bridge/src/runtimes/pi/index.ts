import { PiAgent } from "./agent.js";
import { PiLLM } from "./llm.js";
import type { BridgeRuntimeProvider } from "../../contracts/runtime.js";

export const piRuntimeProvider = {
  id: "pi",
  agent: new PiAgent(),
  llm: new PiLLM(),
} satisfies BridgeRuntimeProvider;
