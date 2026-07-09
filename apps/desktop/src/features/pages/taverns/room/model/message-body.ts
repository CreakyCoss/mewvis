import type { AgentProtocolOutputKey } from "@/features/pages/taverns/room/agent-protocol/types";
import { getAgentProtocolOutputDefinition } from "@/features/pages/taverns/room/agent-protocol/fields";
import type { TavernMessage, TavernMessageBody } from "@/features/pages/taverns/tavern/types";

const escapeProtocolXmlText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
