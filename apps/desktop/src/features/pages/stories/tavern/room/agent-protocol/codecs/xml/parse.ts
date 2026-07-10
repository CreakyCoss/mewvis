import { getAllAgentProtocolOutputDefinitions } from "../../fields";
import type { AgentProtocolOutputKey, AgentProtocolParseResult } from "../../types";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const parseXmlOutput = (text: string): AgentProtocolParseResult => {
  const data: Partial<Record<AgentProtocolOutputKey, string>> = {};

  for (const definition of getAllAgentProtocolOutputDefinitions()) {
    const tag = escapeRegExp(definition.canonicalTag);
    const match = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`).exec(text);
    if (match) {
      data[definition.key] = match[1].trim();
    }
  }

  return { data };
};
