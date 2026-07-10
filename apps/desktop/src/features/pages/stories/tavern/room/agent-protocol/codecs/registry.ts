import type {
  AgentProtocolFormat,
  AgentProtocolOptions,
  AgentProtocolOutputKey,
  AgentProtocolParseResult,
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
  parseOutput(text: string): AgentProtocolParseResult;
};

const agentProtocolCodecs = {
  xml: xmlAgentProtocolCodec,
} as const satisfies Record<AgentProtocolFormat, AgentProtocolCodec>;

export const getAgentProtocolCodec = (format: AgentProtocolFormat): AgentProtocolCodec => agentProtocolCodecs[format];
