import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RuntimeAgentDefinition } from "@/agent-client/protocol";
import type {
  AgentClientAgentEvent,
  AgentClientChatEvent,
  AgentClientAgentInput,
  AgentClientAgentTask,
  AgentClientChatInput,
  AgentClientChatResult,
  AgentClientSession,
} from "./contracts";
import { dispatchAgentClientOutputEvent } from "./output";

export type AgentClientAgentDefinitionsResult = Readonly<{
  defaultAgentId: string;
  agents: readonly RuntimeAgentDefinition[];
}>;

export interface AgentClient {
  listAgents(): Promise<AgentClientAgentDefinitionsResult>;
  run(input: AgentClientAgentInput): Promise<AgentClientAgentTask>;
  run(input: AgentClientChatInput): Promise<AgentClientChatResult>;
  answerQuestion(taskId: string, questionId: string, answer: string): Promise<void>;
  abortTask(taskId: string): Promise<void>;
  subscribe(listener: (event: AgentClientAgentEvent) => void): Promise<() => void>;
}

// These names must match the Rust Tauri command and event names exactly.
const TAURI_AGENT_CLIENT_COMMANDS = {
  listAgents: "list_agent_runtime_agents",
  runAgent: "run_agent_runtime_agent",
  runChat: "run_agent_runtime_chat",
  answerQuestion: "answer_agent_runtime_question",
  abortTask: "abort_agent_runtime_agent",
} as const;

const TAURI_AGENT_CLIENT_EVENTS = {
  agent: "agent_runtime_agent_event",
  chat: "agent_runtime_chat_event",
} as const;

type RunAgentOutput = {
  taskId: string;
};

type TauriAgentClientChatResult = Omit<AgentClientChatResult, "agentSession"> & {
  bridgeSession?: AgentClientSession | null;
};

type TauriAgentClientDoneEvent =
  Omit<Extract<AgentClientAgentEvent, { type: "done" }>, "agentSession"> & {
    bridgeSession?: AgentClientSession | null;
  };

type TauriAgentClientAgentEvent =
  | Exclude<AgentClientAgentEvent, { type: "done" }>
  | TauriAgentClientDoneEvent;

const normalizeAgentEvent = (
  event: TauriAgentClientAgentEvent,
): AgentClientAgentEvent => {
  if (event.type !== "done") {
    return event;
  }

  const { bridgeSession, ...rest } = event;
  return {
    ...rest,
    agentSession: bridgeSession ?? null,
  };
};

const normalizeChatResult = ({
  bridgeSession,
  ...result
}: TauriAgentClientChatResult): AgentClientChatResult => ({
  ...result,
  agentSession: bridgeSession ?? null,
});

class TauriAgentClient implements AgentClient {
  async listAgents(): Promise<AgentClientAgentDefinitionsResult> {
    return invoke<AgentClientAgentDefinitionsResult>(TAURI_AGENT_CLIENT_COMMANDS.listAgents);
  }

  async run(input: AgentClientAgentInput): Promise<AgentClientAgentTask>;
  async run(input: AgentClientChatInput): Promise<AgentClientChatResult>;
  async run(
    input: AgentClientAgentInput | AgentClientChatInput,
  ): Promise<AgentClientAgentTask | AgentClientChatResult> {
    if (input.type === "chat") {
      return this.runChat(input);
    }

    return this.runAgent(input);
  }

  private async runAgent(input: AgentClientAgentInput): Promise<AgentClientAgentTask> {
    const { type: _type, ...taskInput } = input;
    const result = await invoke<RunAgentOutput>(
      TAURI_AGENT_CLIENT_COMMANDS.runAgent,
      { input: taskInput },
    );

    return {
      taskId: result.taskId,
    };
  }

  private async runChat(input: AgentClientChatInput): Promise<AgentClientChatResult> {
    const shouldStream = input.stream ?? true;
    const streamId = shouldStream && (input.onTextDelta || input.onThinkingDelta)
      ? crypto.randomUUID()
      : undefined;
    const unlisten = streamId
      ? await listen<AgentClientChatEvent>(TAURI_AGENT_CLIENT_EVENTS.chat, (event) => {
        if (event.payload.streamId !== streamId) {
          return;
        }
        dispatchAgentClientOutputEvent(event.payload, input);
      })
      : undefined;

    return invoke<TauriAgentClientChatResult>(TAURI_AGENT_CLIENT_COMMANDS.runChat, {
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
    }).then(normalizeChatResult).finally(() => {
      unlisten?.();
    });
  }

  async abortTask(taskId: string): Promise<void> {
    await invoke(TAURI_AGENT_CLIENT_COMMANDS.abortTask, { taskId });
  }

  async answerQuestion(taskId: string, questionId: string, answer: string): Promise<void> {
    await invoke(TAURI_AGENT_CLIENT_COMMANDS.answerQuestion, {
      input: { taskId, questionId, answer },
    });
  }

  async subscribe(listener: (event: AgentClientAgentEvent) => void) {
    return listen<TauriAgentClientAgentEvent>(TAURI_AGENT_CLIENT_EVENTS.agent, (event) => {
      listener(normalizeAgentEvent(event.payload));
    });
  }
}

class WebPreviewAgentClient implements AgentClient {
  async listAgents(): Promise<AgentClientAgentDefinitionsResult> {
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

  async run(input: AgentClientAgentInput): Promise<AgentClientAgentTask>;
  async run(input: AgentClientChatInput): Promise<AgentClientChatResult>;
  async run(input: AgentClientAgentInput | AgentClientChatInput) {
    if (input.type === "chat") {
      return this.runChat();
    }

    return this.runAgent();
  }

  private async runAgent(): Promise<AgentClientAgentTask> {
    return { taskId: crypto.randomUUID() };
  }

  private async runChat(): Promise<AgentClientChatResult> {
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

export const createAgentClient = (): AgentClient =>
  isTauri() ? new TauriAgentClient() : new WebPreviewAgentClient();
