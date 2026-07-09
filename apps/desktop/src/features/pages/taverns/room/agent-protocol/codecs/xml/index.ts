import type { AgentProtocolParseResult, AgentProtocolPrepared } from "../../types";
import type { AgentProtocolCodec, AgentProtocolCodecRenderInput } from "../registry";
import { parseXmlOutput } from "./parse";
import { renderXmlPrompt } from "./render";

class XmlAgentProtocolCodec implements AgentProtocolCodec {
  readonly id = "xml";

  renderPrompt(input: AgentProtocolCodecRenderInput): string {
    return renderXmlPrompt(input);
  }

  parseOutput(text: string, prepared: AgentProtocolPrepared): AgentProtocolParseResult {
    return parseXmlOutput(text, prepared);
  }
}

export const xmlAgentProtocolCodec = new XmlAgentProtocolCodec();
