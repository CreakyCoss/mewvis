import type { AgentProtocolData } from "@/stories/tavern/room/agent-protocol/types";
import type { TavernAgentFlowDirectorDecision } from "../../types";

type DirectorDecisionPayload = {
  speakerIds: string[];
  reason: string;
};

const firstOutputContent = (data: AgentProtocolData[], key: "decision") =>
  data.find((item) => item.type === key)?.content ?? "";

const collectNarratorText = (data: AgentProtocolData[]) =>
  data
    .flatMap((item) => {
      if (item.type === "unwrappedText") {
        return [item.content];
      }

      return item.type === "narrative" || item.type === "publicReply" ? [item.content] : [];
    })
    .join("\n")
    .trim();

export const parseTavernAgentFlowDirectorDecision = ({
  protocolData,
  maxSpeakers,
}: {
  protocolData: AgentProtocolData[];
  maxSpeakers: number;
}): TavernAgentFlowDirectorDecision => {
  const decisionText = firstOutputContent(protocolData, "decision");
  if (!decisionText) {
    throw new Error("导演输出缺少 decision 字段。");
  }

  const payload = JSON.parse(decisionText) as DirectorDecisionPayload;
  const narratorText = collectNarratorText(protocolData);

  return {
    speakerIds: payload.speakerIds.slice(0, maxSpeakers),
    reason: payload.reason.trim(),
    narratorText: narratorText || undefined,
  };
};
