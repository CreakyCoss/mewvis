import type { RuntimeLedgerEntry } from "./ledger.js";
import type { RuntimeAgentVisibleContext, RuntimeMessage, RuntimeMessageMetadata } from "./context.js";

export type { RuntimeAgentVisibleContext } from "./context.js";

const roleLabel = (role: RuntimeMessage["role"]) => (role === "assistant" ? "assistant" : "user");

const metadataAgentRoleId = (metadata?: RuntimeMessageMetadata | null) =>
  metadata?.agentRoleId?.trim() || metadata?.agentKey?.trim() || null;

const belongsToAgent = (metadata: RuntimeMessageMetadata | null | undefined, agentRoleId: string) =>
  metadataAgentRoleId(metadata) === agentRoleId;

export const buildRuntimeAgentVisibleContext = (
  entries: RuntimeLedgerEntry[],
  agentRoleId: string,
): RuntimeAgentVisibleContext => {
  const recentMessages: RuntimeAgentVisibleContext["recentMessages"] = [];
  const requestContexts: RuntimeAgentVisibleContext["requestContexts"] = [];
  const runtimeInstructions: RuntimeAgentVisibleContext["runtimeInstructions"] = [];

  for (const entry of entries) {
    if (entry.type === "message" && belongsToAgent(entry.message.metadata, agentRoleId)) {
      recentMessages.push({
        id: entry.id,
        role: roleLabel(entry.message.role),
        content: entry.message.content,
        timestamp: entry.message.timestamp,
        metadata: entry.message.metadata ?? null,
      });
      continue;
    }

    if (entry.type === "request_context" && belongsToAgent(entry.metadata, agentRoleId)) {
      requestContexts.push({
        id: entry.id,
        role: "user",
        content: entry.content,
        timestamp: new Date(entry.timestamp).getTime(),
        metadata: entry.metadata ?? null,
      });
      continue;
    }

    if (entry.type === "runtime_instruction" && belongsToAgent(entry.metadata, agentRoleId)) {
      runtimeInstructions.push({
        id: entry.id,
        role: "user",
        content: entry.content,
        timestamp: new Date(entry.timestamp).getTime(),
        metadata: entry.metadata ?? null,
      });
    }
  }

  return {
    agentRoleId,
    recentMessages,
    requestContexts,
    runtimeInstructions,
  };
};
