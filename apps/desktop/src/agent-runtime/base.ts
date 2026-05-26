import type {
  CodingAgentEvent,
  CodingAgentTask,
  CodingAgentTaskInput,
} from "./contract";

export type {
  AgentToolCategory,
  AgentToolDefinition,
  AgentToolName,
  AgentToolRiskLevel,
  BuiltInAgentToolName,
  CodingAgentEvent,
  CodingAgentModelConfig,
  CodingAgentProviderConfig,
  CodingAgentQuestionInput,
  CodingAgentTask,
  CodingAgentTaskInput,
  KnownAgentToolName,
  AskUserAgentToolName,
} from "./contract";

export interface AgentRuntimeAdapter {
  readonly id: string;
  readonly name: string;
  startTask(input: CodingAgentTaskInput): Promise<CodingAgentTask>;
  answerQuestion(taskId: string, questionId: string, answer: string): Promise<void>;
  abortTask(taskId: string): Promise<void>;
  subscribe(listener: (event: CodingAgentEvent) => void): Promise<() => void>;
}

export type CodingAgentAdapter = AgentRuntimeAdapter;
