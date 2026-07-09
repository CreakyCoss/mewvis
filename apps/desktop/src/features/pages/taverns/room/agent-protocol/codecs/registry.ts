import type {
  AgentProtocolFormat,
  AgentProtocolOptions,
  AgentProtocolOutputKey,
  AgentProtocolParseResult,
  AgentProtocolPrepared,
  AgentProtocolRequest,
} from "../types";
import { xmlAgentProtocolCodec } from "./xml/index";

export type AgentProtocolCodecRenderInput = {
  request: AgentProtocolRequest;
  output: readonly AgentProtocolOutputKey[];
  options: Required<AgentProtocolOptions>;
};

export type AgentProtocolCodec = {
  id: AgentProtocolFormat;
  renderPrompt(input: AgentProtocolCodecRenderInput): string;
  parseOutput(text: string, prepared: AgentProtocolPrepared): AgentProtocolParseResult;
};

const agentProtocolCodecs = {
  xml: xmlAgentProtocolCodec,
} as const satisfies Record<AgentProtocolFormat, AgentProtocolCodec>;

export const getAgentProtocolCodec = (format: AgentProtocolFormat): AgentProtocolCodec => agentProtocolCodecs[format];
