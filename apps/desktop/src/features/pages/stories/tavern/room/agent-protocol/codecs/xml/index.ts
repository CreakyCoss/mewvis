import type { AgentProtocolParseResult } from "../../types";
import type { AgentProtocolCodec, AgentProtocolCodecRenderInput } from "../registry";
import { parseXmlOutput } from "./parse";
import { renderXmlPrompt } from "./render";

class XmlAgentProtocolCodec implements AgentProtocolCodec {
  readonly id = "xml";

  renderPrompt(input: AgentProtocolCodecRenderInput): string {
    return renderXmlPrompt(input);
  }

  parseOutput(text: string): AgentProtocolParseResult {
    return parseXmlOutput(text);
  }
}

export const xmlAgentProtocolCodec = new XmlAgentProtocolCodec();
