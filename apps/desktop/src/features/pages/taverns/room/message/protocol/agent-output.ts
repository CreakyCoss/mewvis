import { AgentProtocol } from "@/features/pages/taverns/room/agent-protocol";
import type {
  AgentProtocolIssue,
  AgentProtocolParseResult,
} from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import type { TavernProtocolContentKind } from "./schema";
import { cleanTavernAgentOutputContent, cleanTavernThoughtText } from "./tavern-cleanup";

export type TavernAgentOutputParts = {
  content: string;
  contentSource: "protocol" | "unwrapped" | "empty";
  thought?: string;
  contentKind?: TavernProtocolContentKind;
  unwrappedText?: string;
  issues: AgentProtocolIssue[];
};

const publicContentPriority = ["publicReply", "narrative", "summary", "action", "decision"] as const;

const resolvePreferredContent = ({
  data,
  preferredContentKind,
}: {
  data: AgentProtocolParseResult["data"];
  preferredContentKind?: TavernProtocolContentKind;
}) => {
  if (preferredContentKind === "narrative_beat" && data.narrative?.trim()) {
    return { content: data.narrative, contentKind: "narrative_beat" as const };
  }

  if (preferredContentKind === "reply" && data.publicReply?.trim()) {
    return { content: data.publicReply, contentKind: "reply" as const };
  }

  if (data.publicReply?.trim()) {
    return { content: data.publicReply, contentKind: "reply" as const };
  }

  if (data.narrative?.trim()) {
    return { content: data.narrative, contentKind: "narrative_beat" as const };
  }

  const fallbackKey = publicContentPriority.find((key) => data[key]?.trim());
  return fallbackKey ? { content: data[fallbackKey] ?? "", contentKind: "reply" as const } : null;
};

export const parseTavernAgentOutputText = ({
  text,
  activeCharacter,
  characters,
  userPersonaName,
  preferredContentKind,
}: {
  text: string;
  activeCharacter?: TavernCharacter | null;
  characters?: TavernCharacter[];
  userPersonaName?: string;
  preferredContentKind?: TavernProtocolContentKind;
}): TavernAgentOutputParts => {
  const parsed = AgentProtocol.parse(text);
  const resolved = resolvePreferredContent({
    data: parsed.data,
    preferredContentKind,
  });
  const contentSource = resolved?.content || parsed.unwrappedText || "";
  const resolvedContentSource = resolved?.content ? "protocol" : parsed.unwrappedText ? "unwrapped" : "empty";
  const content =
    activeCharacter && characters && userPersonaName !== undefined
      ? cleanTavernAgentOutputContent({
          text: contentSource,
          activeCharacter,
          characters,
          userPersonaName,
        })
      : contentSource.trim();
  const thought = cleanTavernThoughtText(parsed.data.privateThought || "");

  return {
    content: content.trim(),
    contentSource: resolvedContentSource,
    thought: thought || undefined,
    contentKind: resolved?.contentKind,
    unwrappedText: parsed.unwrappedText,
    issues: parsed.issues,
  };
};
