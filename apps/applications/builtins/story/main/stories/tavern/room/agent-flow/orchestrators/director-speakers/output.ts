import type { AgentProtocolData } from "@/stories/tavern/room/agent-protocol/types";

const normalizeTavernAgentFlowText = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```(?:json|xml|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

export const getTavernAgentFlowPublicText = (data: AgentProtocolData[]) =>
  data
    .flatMap((item) => {
      if (item.type === "unwrappedText") {
        return [normalizeTavernAgentFlowText(item.content)];
      }

      if (item.type === "action") {
        const action = normalizeTavernAgentFlowText(item.content);
        return action ? [`动作：${action}`] : [];
      }

      if (item.type === "publicReply" || item.type === "narrative") {
        return [normalizeTavernAgentFlowText(item.content)];
      }

      return [];
    })
    .filter(Boolean)
    .join("\n");
