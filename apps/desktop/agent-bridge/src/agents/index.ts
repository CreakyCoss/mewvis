import { runEarendilTask } from "./earendil.js";
import type { AgentRunner } from "./types.js";

export const DEFAULT_AGENT = "default";

const agentRunners: Record<string, AgentRunner> = {
  [DEFAULT_AGENT]: runEarendilTask,
};

export const resolveAgentRunner = (): AgentRunner => {
  const runner = agentRunners[DEFAULT_AGENT];
  if (!runner) {
    throw new Error(`未配置默认 Agent：${DEFAULT_AGENT}`);
  }

  return runner;
};
