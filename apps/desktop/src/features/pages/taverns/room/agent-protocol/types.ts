export type AgentProtocolFormat = "xml";

export type AgentProtocolVisibility = "public" | "private" | "self";

export type AgentProtocolOutputKey =
  | "privateThought"
  | "publicReply"
  | "narrative"
  | "action"
  | "decision"
  | "summary"
  | "statePatch"
  | "memoryPatch";

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
  strict?: boolean;
  allowPartial?: boolean;
  recoverUnwrappedText?: boolean;
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

export type AgentProtocolIssueCode =
  | "missing_output"
  | "empty_output"
  | "duplicate_output_dropped"
  | "unknown_output_dropped"
  | "outside_text_dropped"
  | "malformed_output_recovered"
  | "unwrapped_text_recovered";

export type AgentProtocolIssue = {
  code: AgentProtocolIssueCode;
  message: string;
  field?: AgentProtocolOutputKey;
  tag?: string;
  text?: string;
};

export type AgentProtocolParseResult = {
  ok: boolean;
  data: Partial<Record<AgentProtocolOutputKey, string>>;
  normalizedText: string;
  issues: AgentProtocolIssue[];
  missing: AgentProtocolOutputKey[];
};
