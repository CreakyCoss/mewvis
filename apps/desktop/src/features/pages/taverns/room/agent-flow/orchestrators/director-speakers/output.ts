import { AgentProtocol } from "@/features/pages/taverns/room/agent-protocol";
import type {
  AgentProtocolOutputKey,
  AgentProtocolParseResult,
} from "@/features/pages/taverns/room/agent-protocol/types";

const publicOutputFallbackOrder = ["publicReply", "narrative", "summary", "action", "decision"] as const;

export const normalizeTavernAgentFlowText = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```(?:json|xml|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

export const parseTavernAgentFlowOutput = (text: string): AgentProtocolParseResult => AgentProtocol.parse(text);

export const getTavernAgentFlowPublicText = ({
  parsed,
  preferredOutput,
}: {
  parsed: AgentProtocolParseResult;
  preferredOutput?: Extract<AgentProtocolOutputKey, "publicReply" | "narrative">;
}) => {
  const preferredText = preferredOutput ? parsed.data[preferredOutput]?.trim() : "";
  const actionText = normalizeTavernAgentFlowText(parsed.data.action ?? "");

  if (preferredOutput === "publicReply") {
    const normalizedPreferredText = preferredText ? normalizeTavernAgentFlowText(preferredText) : "";
    if (actionText && normalizedPreferredText) {
      return `动作：${actionText}\n${normalizedPreferredText}`;
    }

    if (actionText) {
      return `动作：${actionText}`;
    }

    if (normalizedPreferredText) {
      return normalizedPreferredText;
    }
  }

  if (preferredText) {
    return normalizeTavernAgentFlowText(preferredText);
  }

  const fallbackKey = publicOutputFallbackOrder.find((key) => parsed.data[key]?.trim());
  if (fallbackKey) {
    return normalizeTavernAgentFlowText(parsed.data[fallbackKey] ?? "");
  }

  return normalizeTavernAgentFlowText(parsed.unwrappedText ?? "");
};
