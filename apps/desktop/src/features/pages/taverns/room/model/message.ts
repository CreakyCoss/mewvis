import { getAgentProtocolOutputDefinition } from "@/features/pages/taverns/room/agent-protocol/fields";
import type { AgentProtocolFormat, AgentProtocolOutputKey } from "@/features/pages/taverns/room/agent-protocol/types";
import type { TavernPresentationProfileId } from "@/features/pages/taverns/manage/model";

export type TavernMessageBody =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "agent_output";
      format: AgentProtocolFormat;
      rawText: string;
      output?: AgentProtocolOutputKey[];
    };

export type TavernMessage = {
  id: string;
  roomId: string;
  turnId?: string;
  kind: "user_text" | "director_narration" | "character_agent_output";
  role: "user" | "character" | "narrator";
  characterId?: string;
  presentationProfileId?: TavernPresentationProfileId;
  body: TavernMessageBody;
  targetCharacterIds?: string[];
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

const escapeProtocolXmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const createTavernTextMessageBody = (text: string): TavernMessageBody => ({
  type: "text",
  text,
});

export const createTavernAgentOutputMessageBody = ({
  rawText,
  output,
}: {
  rawText: string;
  output?: AgentProtocolOutputKey[];
}): TavernMessageBody => ({
  type: "agent_output",
  format: "xml",
  rawText,
  output,
});

export const createTavernAgentOutputFieldMessageBody = ({
  field,
  text,
}: {
  field: AgentProtocolOutputKey;
  text: string;
}): TavernMessageBody => {
  const tag = getAgentProtocolOutputDefinition(field).canonicalTag;

  return createTavernAgentOutputMessageBody({
    rawText: `<${tag}>${escapeProtocolXmlText(text)}</${tag}>`,
    output: [field],
  });
};

export const getTavernMessageRawText = (message: TavernMessage) =>
  message.body.type === "agent_output" ? message.body.rawText : message.body.text;
