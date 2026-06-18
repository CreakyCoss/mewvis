import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RuntimeAgentDefinition } from "@/ai/runtime-protocol";
import type {
  AgentRuntimeAgentEvent,
  AgentRuntimeChatEvent,
  AgentRuntimeAgentInput,
  AgentRuntimeAgentTask,
  AgentRuntimeChatInput,
  AgentRuntimeChatResult,
} from "./contracts";
import { dispatchAgentRuntimeOutputEvent } from "./output";

export type AgentRuntimeAgentDefinitionsResult = Readonly<{
  defaultAgentId: string;
  agents: readonly RuntimeAgentDefinition[];
}>;

export interface AgentRuntime {
  listAgents(): Promise<AgentRuntimeAgentDefinitionsResult>;
  run(input: AgentRuntimeAgentInput): Promise<AgentRuntimeAgentTask>;
  run(input: AgentRuntimeChatInput): Promise<AgentRuntimeChatResult>;
  answerQuestion(taskId: string, questionId: string, answer: string): Promise<void>;
  abortTask(taskId: string): Promise<void>;
  subscribe(listener: (event: AgentRuntimeAgentEvent) => void): Promise<() => void>;
}

// These names must match the Rust Tauri command and event names exactly.
const TAURI_AGENT_RUNTIME_COMMANDS = {
  listAgents: "list_agent_runtime_agents",
  runAgent: "run_agent_runtime_agent",
  runChat: "run_agent_runtime_chat",
  answerQuestion: "answer_agent_runtime_question",
  abortTask: "abort_agent_runtime_agent",
} as const;

const TAURI_AGENT_RUNTIME_EVENTS = {
  agent: "agent_runtime_agent_event",
  chat: "agent_runtime_chat_event",
} as const;

type RunAgentOutput = {
  taskId: string;
};

class TauriAgentRuntime implements AgentRuntime {
  async listAgents(): Promise<AgentRuntimeAgentDefinitionsResult> {
    return invoke<AgentRuntimeAgentDefinitionsResult>(TAURI_AGENT_RUNTIME_COMMANDS.listAgents);
  }

  async run(input: AgentRuntimeAgentInput): Promise<AgentRuntimeAgentTask>;
  async run(input: AgentRuntimeChatInput): Promise<AgentRuntimeChatResult>;
  async run(
    input: AgentRuntimeAgentInput | AgentRuntimeChatInput,
  ): Promise<AgentRuntimeAgentTask | AgentRuntimeChatResult> {
    if (input.type === "chat") {
      return this.runChat(input);
    }

    return this.runAgent(input);
  }

  private async runAgent(input: AgentRuntimeAgentInput): Promise<AgentRuntimeAgentTask> {
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
        dispatchAgentRuntimeOutputEvent(event.payload, input);
      })
      : undefined;

    return invoke<AgentRuntimeChatResult>(TAURI_AGENT_RUNTIME_COMMANDS.runChat, {
      input: {
        agentId: input.agentId,
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        streamId,
        stream: shouldStream,
        runtimeModel: input.runtimeModel,
        systemPrompt: input.systemPrompt,
        userMessage: input.userMessage,
        requestContext: input.requestContext,
        runtimeInstruction: input.runtimeInstruction,
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

  async subscribe(listener: (event: AgentRuntimeAgentEvent) => void) {
    return listen<AgentRuntimeAgentEvent>(TAURI_AGENT_RUNTIME_EVENTS.agent, (event) => {
      listener(event.payload);
    });
  }
}

class WebPreviewAgentRuntime implements AgentRuntime {
  async listAgents(): Promise<AgentRuntimeAgentDefinitionsResult> {
    return {
      defaultAgentId: "web-preview",
      agents: [
        {
          id: "web-preview",
          label: "Web 预览",
          description: "用于普通浏览器预览界面的占位运行时。",
          capabilities: ["chat", "agent"],
          requiresModel: false,
        },
      ],
    };
  }

  async run(input: AgentRuntimeAgentInput): Promise<AgentRuntimeAgentTask>;
  async run(input: AgentRuntimeChatInput): Promise<AgentRuntimeChatResult>;
  async run(input: AgentRuntimeAgentInput | AgentRuntimeChatInput) {
    if (input.type === "chat") {
      return this.runChat();
    }

    return this.runAgent();
  }

  private async runAgent(): Promise<AgentRuntimeAgentTask> {
    return { taskId: crypto.randomUUID() };
  }

  private async runChat(): Promise<AgentRuntimeChatResult> {
    return {
      text: "当前为 Web 预览模式，未连接桌面运行时。",
      thinking: null,
    };
  }

  async answerQuestion(): Promise<void> {
    return undefined;
  }

  async abortTask(): Promise<void> {
    return undefined;
  }

  async subscribe(): Promise<() => void> {
    return () => undefined;
  }
}

export const createAgentRuntime = (): AgentRuntime =>
  isTauri() ? new TauriAgentRuntime() : new WebPreviewAgentRuntime();
