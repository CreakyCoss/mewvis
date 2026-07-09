import { uniq } from "lodash-es";
import { getAgentProtocolCodec } from "./codecs/registry";
import { AGENT_PROTOCOL_OUTPUT_FIELDS } from "./fields";
import type {
  AgentProtocolFormat,
  AgentProtocolOptions,
  AgentProtocolOutputKey,
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
  const requestedOutput = uniq(request.output).filter(
    (output): output is AgentProtocolOutputKey => output in AGENT_PROTOCOL_OUTPUT_FIELDS,
  );
  const output: AgentProtocolOutputKey[] = requestedOutput.length > 0 ? requestedOutput : ["publicReply"];
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
