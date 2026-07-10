export type AgentProtocolFormat = "xml";

export type AgentProtocolVisibility = "public" | "private" | "self";

export type AgentProtocolOutputKey =
  "privateThought" | "publicReply" | "narrative" | "action" | "decision" | "summary" | "statePatch" | "memoryPatch";

export type AgentProtocolRole = {
  name?: string;
  description?: string;
  speakingStyle?: string;
  goals?: string[];
  constraints?: string[];
  memory?: string | string[];
};

export type AgentProtocolTask = {
  goal?: string;
  instruction?: string;
  successCriteria?: string[];
  constraints?: string[];
};

export type AgentProtocolProgress = {
  summary?: string;
  facts?: string[];
  recentEvents?: string[];
  openQuestions?: string[];
};

export type AgentProtocolMessageRole = "user" | "agent" | "assistant" | "system" | "narrator" | "tool" | "other";

export type AgentProtocolMessage = {
  role?: AgentProtocolMessageRole;
  speaker?: string;
  content: string;
  visibility?: AgentProtocolVisibility;
  createdAt?: string | number;
};

export type AgentProtocolReference = {
  title?: string;
  content: string;
  source?: string;
};

export type AgentProtocolOptions = {
  format?: AgentProtocolFormat;
};

export type AgentProtocolRequest = {
  system?: string;
  role?: AgentProtocolRole;
  task?: AgentProtocolTask;
  progress?: AgentProtocolProgress;
  messages?: AgentProtocolMessage[];
  references?: AgentProtocolReference[];
  output: AgentProtocolOutputKey[];
  options?: AgentProtocolOptions;
};

export type AgentProtocolPrepared = {
  format: AgentProtocolFormat;
  prompt: string;
  output: AgentProtocolOutputKey[];
  options: Required<AgentProtocolOptions>;
};

export type AgentProtocolParseResult = {
  data: Partial<Record<AgentProtocolOutputKey, string>>;
};
