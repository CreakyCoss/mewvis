import type { TavernAgentFlowRunAgent } from "../types";

/** The built-in application injects an Application Chat backed runner for every flow. */
export const runTavernAgentFlowRuntimeAgent: TavernAgentFlowRunAgent = async () => {
  throw new Error("章节酒馆缺少应用聊天运行器");
};
