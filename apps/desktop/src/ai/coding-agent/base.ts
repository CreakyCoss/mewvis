import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";

export type CodingAgentProvider = LlmProvider;
export type CodingAgentModel = ProviderModel;

export type CodingAgentTaskInput = {
  workspacePath: string;
  prompt: string;
  provider: CodingAgentProvider;
  model: CodingAgentModel;
  allowedTools?: string[];
};

export type CodingAgentTask = {
  taskId: string;
};

export type CodingAgentEvent =
  | { type: "started"; taskId: string }
  | { type: "text_delta"; taskId: string; delta: string }
  | { type: "thinking_delta"; taskId: string; delta: string }
  | { type: "thinking_end"; taskId: string; content: string }
  | { type: "tool_start"; taskId: string; toolName: string; args: unknown }
  | { type: "tool_update"; taskId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; taskId: string; toolName: string; isError: boolean; result: unknown }
  | { type: "done"; taskId: string; text: string }
  | { type: "stderr"; taskId: string; message: string }
  | { type: "exit"; taskId: string; success: boolean; code: number | null }
  | { type: "error"; taskId?: string; message: string; raw?: string };

export interface CodingAgentAdapter {
  readonly id: string;
  readonly name: string;
  startTask(input: CodingAgentTaskInput): Promise<CodingAgentTask>;
  abortTask(taskId: string): Promise<void>;
  subscribe(listener: (event: CodingAgentEvent) => void): Promise<() => void>;
}
