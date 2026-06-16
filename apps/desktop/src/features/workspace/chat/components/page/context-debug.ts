import type {
  AgentContextSessionDebugSnapshot,
} from "@/ai/agent-context";
import type {
  ChatMode,
  ContextDebugPayload,
  ContextDebugSnapshot,
} from "../../page-types";

export const buildContextDebugSnapshot = ({
  base,
  mode,
  engineId,
  contextWindow,
  runtimeAgentId,
  agentSessionId = null,
  providerName,
  modelName,
  payloads,
  overrides,
}: {
  base: AgentContextSessionDebugSnapshot;
  mode: ChatMode;
  engineId: string;
  contextWindow: number;
  runtimeAgentId: string;
  agentSessionId?: string | null;
  providerName?: string | null;
  modelName?: string | null;
  payloads: ContextDebugPayload[];
  overrides?: Omit<Partial<ContextDebugSnapshot>, "payloads">;
}): ContextDebugSnapshot => ({
  ...base,
  mode,
  engineId,
  contextWindow,
  runtimeAgentId,
  agentSessionId,
  providerName,
  modelName,
  payloads,
  ...overrides,
});
