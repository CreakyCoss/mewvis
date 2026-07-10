import type {
  AgentProtocolData,
  AgentProtocolFormat,
  AgentProtocolOptions,
  AgentProtocolOutputKey,
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
  parseOutput(text: string): AgentProtocolData[];
};

const agentProtocolCodecs = {
  xml: xmlAgentProtocolCodec,
} as const satisfies Record<AgentProtocolFormat, AgentProtocolCodec>;

export const getAgentProtocolCodec = (format: AgentProtocolFormat): AgentProtocolCodec => agentProtocolCodecs[format];
