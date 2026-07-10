import { getAgentProtocolCodec } from "./codecs/registry";
import type {
  AgentProtocolFormat,
  AgentProtocolOptions,
  AgentProtocolParseResult,
  AgentProtocolPrepared,
  AgentProtocolRequest,
} from "./types";

export type AgentProtocol = {
  prepare(request: AgentProtocolRequest): AgentProtocolPrepared;
  parse(text: string, format?: AgentProtocolFormat): AgentProtocolParseResult;
};

export const AgentProtocol: AgentProtocol = {
  prepare(request: AgentProtocolRequest): AgentProtocolPrepared {
    return prepare(request);
  },
  parse(text: string, format: AgentProtocolFormat = "xml"): AgentProtocolParseResult {
    return getAgentProtocolCodec(format).parseOutput(text);
  },
} as const;

const prepare = (request: AgentProtocolRequest): AgentProtocolPrepared => {
  const output = request.output;
  const options: Required<AgentProtocolOptions> = {
    format: "xml",
    ...request.options,
  };
  const codec = getAgentProtocolCodec(options.format);
  const prompt = codec.renderPrompt({ request, output, options });

  return {
    format: codec.id,
    prompt,
    output,
    options,
  };
};
