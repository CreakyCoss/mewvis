import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AgentRuntimeAgentInput,
  AgentRuntimeChatEvent,
  AgentRuntimeChatInput,
  AgentRuntimeChatResult,
  CodingAgentEvent,
  CodingAgentTask,
} from "./contract";

export interface AgentRuntime {
  run(input: AgentRuntimeAgentInput): Promise<CodingAgentTask>;
  run(input: AgentRuntimeChatInput): Promise<AgentRuntimeChatResult>;
  answerQuestion(taskId: string, questionId: string, answer: string): Promise<void>;
  abortTask(taskId: string): Promise<void>;
  subscribe(listener: (event: CodingAgentEvent) => void): Promise<() => void>;
}

// These names must match the Rust Tauri command and event names exactly.
const TAURI_AGENT_RUNTIME_COMMANDS = {
  runAgent: "start_coding_agent_task",
  runChat: "run_agent_runtime_chat",
  answerQuestion: "answer_coding_agent_question",
  abortTask: "abort_coding_agent_task",
} as const;

const TAURI_AGENT_RUNTIME_EVENTS = {
  agent: "coding_agent_event",
  chat: "agent_runtime_chat_event",
} as const;

type RunAgentOutput = {
  taskId: string;
};

class TauriAgentRuntime implements AgentRuntime {
  async run(input: AgentRuntimeAgentInput): Promise<CodingAgentTask>;
  async run(input: AgentRuntimeChatInput): Promise<AgentRuntimeChatResult>;
  async run(input: AgentRuntimeAgentInput | AgentRuntimeChatInput) {
    if (input.type === "chat") {
      return this.runChat(input);
    }

    return this.runAgent(input);
  }

  private async runAgent(input: AgentRuntimeAgentInput): Promise<CodingAgentTask> {
    const { type: _type, ...taskInput } = input;
    const result = await invoke<RunAgentOutput>(
      TAURI_AGENT_RUNTIME_COMMANDS.runAgent,
      { input: taskInput },
    );

    return {
      taskId: result.taskId,
    };
  }

  private async runChat(input: AgentRuntimeChatInput): Promise<AgentRuntimeChatResult> {
    const shouldStream = input.stream ?? true;
    const streamId = shouldStream && (input.onTextDelta || input.onThinkingDelta)
      ? crypto.randomUUID()
      : undefined;
    const unlisten = streamId
      ? await listen<AgentRuntimeChatEvent>(TAURI_AGENT_RUNTIME_EVENTS.chat, (event) => {
        if (event.payload.streamId !== streamId) {
          return;
        }
        if (event.payload.type === "text_delta") {
          input.onTextDelta?.(event.payload.delta);
        }
        if (event.payload.type === "thinking_delta") {
          input.onThinkingDelta?.(event.payload.delta);
        }
      })
      : undefined;

    return invoke<AgentRuntimeChatResult>(TAURI_AGENT_RUNTIME_COMMANDS.runChat, {
      input: {
        bridgeAgentId: input.bridgeAgentId,
        streamId,
        stream: shouldStream,
        provider: input.provider,
        model: input.model,
        systemPrompt: input.systemPrompt,
        messages: input.messages,
      },
    }).finally(() => {
      unlisten?.();
    });
  }

  async abortTask(taskId: string): Promise<void> {
    await invoke(TAURI_AGENT_RUNTIME_COMMANDS.abortTask, { taskId });
  }

  async answerQuestion(taskId: string, questionId: string, answer: string): Promise<void> {
    await invoke(TAURI_AGENT_RUNTIME_COMMANDS.answerQuestion, {
      input: { taskId, questionId, answer },
    });
  }

  async subscribe(listener: (event: CodingAgentEvent) => void) {
    return listen<CodingAgentEvent>(TAURI_AGENT_RUNTIME_EVENTS.agent, (event) => {
      listener(event.payload);
    });
  }
}

export const createAgentRuntime = (): AgentRuntime =>
  new TauriAgentRuntime();
