import type { AgentProtocolParseResult } from "@/features/pages/stories/tavern/room/agent-protocol/types";
import type { TavernAgentFlowDirectorDecision } from "../../types";

type DirectorDecisionPayload = {
  speakerIds: string[];
  reason: string;
};

export const parseTavernAgentFlowDirectorDecision = ({
  parsed,
  maxSpeakers,
}: {
  parsed: AgentProtocolParseResult;
  maxSpeakers: number;
}): TavernAgentFlowDirectorDecision => {
  const payload = JSON.parse(parsed.data.decision!) as DirectorDecisionPayload;

  return {
    speakerIds: payload.speakerIds.slice(0, maxSpeakers),
    reason: payload.reason.trim(),
    narratorText: parsed.data.narrative!.trim() || undefined,
  };
};
