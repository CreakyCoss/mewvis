import {
  AgentResultType,
  type AgentDefinitionsResult,
  type AgentToolsResult,
  type PongResult,
  type RuntimeModelsResult,
  type ShutdownAckResult,
  type TaskResult,
} from "../../../protocol/index.js";
import type { AgentRunCommand } from "../runtimes/types.js";
import { runtimeAgentManifest } from "../runtimes/registry.js";
import {
  AGENT_TOOL_DEFINITIONS,
  DEFAULT_ALLOWED_AGENT_TOOLS,
} from "../tools/definitions.js";
import { MODEL_CATALOG } from "../../../models/index.js";

type RequestCommand = {
  requestId?: string | null;
};

type TaskCommand = Pick<AgentRunCommand, "requestId" | "taskId">;

type TaskResultStatus = { success: true } | { success: false; message: string };

export const createAgentDefinitionsResult = (
  command: RequestCommand,
): AgentDefinitionsResult => ({
  type: AgentResultType.AgentDefinitions,
  requestId: command.requestId ?? null,
  defaultAgentId: runtimeAgentManifest.defaultAgentId,
  agents: runtimeAgentManifest.definitions,
});

export const createAgentToolsResult = (
  command: RequestCommand & { agentId?: string | null },
): AgentToolsResult => ({
  type: AgentResultType.AgentTools,
  requestId: command.requestId ?? null,
  agentId: command.agentId ?? null,
  tools: AGENT_TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    enabledByDefault: tool.enabledByDefault,
  })),
  defaultToolNames: [...DEFAULT_ALLOWED_AGENT_TOOLS],
});

export const createRuntimeModelsResult = (
  command: RequestCommand,
): RuntimeModelsResult => ({
  type: AgentResultType.RuntimeModels,
  requestId: command.requestId ?? null,
  catalog: Object.fromEntries(
    Object.entries(MODEL_CATALOG).map(([providerId, provider]) => [
      providerId,
      {
        websiteUrl: provider.websiteUrl,
        apis: provider.apis.map((api) => ({ ...api })),
        models: Object.fromEntries(
          Object.entries(provider.models).map(([modelId, model]) => [
            modelId,
            {
              ...model,
              input: [...model.input],
              cost: { ...model.cost },
              thinkingLevelMap: model.thinkingLevelMap
                ? { ...model.thinkingLevelMap }
                : undefined,
              headers: model.headers ? { ...model.headers } : undefined,
            },
          ]),
        ),
      },
    ]),
  ),
});

export const createPongResult = (command: RequestCommand): PongResult => ({
  type: AgentResultType.Pong,
  requestId: command.requestId ?? null,
});

export const createShutdownAckResult = (command: RequestCommand): ShutdownAckResult => ({
  type: AgentResultType.ShutdownAck,
  requestId: command.requestId ?? null,
});

export const createTaskResult = (
  command: TaskCommand,
  result: TaskResultStatus,
): TaskResult => ({
  type: AgentResultType.TaskResult,
  requestId: command.requestId ?? null,
  taskId: command.taskId,
  ...result,
});
