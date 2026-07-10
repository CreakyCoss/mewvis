import type {
  AgentProtocolOutputKey,
  AgentProtocolParseResult,
} from "@/features/pages/taverns/room/agent-protocol/types";

export const getTavernAgentFlowPublicText = ({
  parsed,
  preferredOutput,
}: {
  parsed: AgentProtocolParseResult;
  preferredOutput: Extract<AgentProtocolOutputKey, "publicReply" | "narrative">;
}) => {
  const publicText = parsed.data[preferredOutput]!.trim();
  const actionText = parsed.data.action?.trim() ?? "";

  if (preferredOutput !== "publicReply" || !actionText) {
    return publicText;
  }

  return publicText ? `动作：${actionText}\n${publicText}` : `动作：${actionText}`;
};
