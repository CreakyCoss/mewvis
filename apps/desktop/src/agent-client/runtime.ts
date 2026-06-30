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
  AgentClientCollaborationTimelineResult,
  AgentClientCollaborationInput,
  AgentClientCollaborationModeInput,
  AgentClientGetCollaborationTimelineInput,
  AgentClientGetRuntimeSessionInput,
  AgentClientListRuntimeSessionsInput,
  AgentClientRuntimeSessionSnapshot,
  AgentClientRuntimeSessionsResult,
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
  run(input: AgentClientCollaborationInput): Promise<AgentClientAgentTask>;
  run(input: AgentClientCollaborationModeInput): Promise<AgentClientAgentTask>;
  listRuntimeSessions(
    input: AgentClientListRuntimeSessionsInput,
  ): Promise<AgentClientRuntimeSessionsResult>;
  getRuntimeSession(
    input: AgentClientGetRuntimeSessionInput,
  ): Promise<AgentClientRuntimeSessionSnapshot>;
  getCollaborationTimeline(
    input: AgentClientGetCollaborationTimelineInput,
  ): Promise<AgentClientCollaborationTimelineResult>;
  answerQuestion(taskId: string, questionId: string, answer: string): Promise<void>;
  abortTask(taskId: string): Promise<void>;
  subscribe(listener: (event: AgentClientAgentEvent) => void): Promise<() => void>;
}

// These names must match the Rust Tauri command and event names exactly.
const TAURI_AGENT_CLIENT_COMMANDS = {
  listAgents: "list_agent_runtime_agents",
  runAgent: "run_agent_runtime_agent",
  runChat: "run_agent_runtime_chat",
  runCollaboration: "run_agent_runtime_collaboration",
  runCollaborationMode: "run_agent_runtime_collaboration_mode",
  listRuntimeSessions: "list_agent_runtime_sessions",
  getRuntimeSession: "get_agent_runtime_session",
  getCollaborationTimeline: "get_agent_runtime_collaboration_timeline",
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
  runtimeSession?: AgentClientSession | null;
};

type TauriAgentClientDoneEvent =
  Omit<Extract<AgentClientAgentEvent, { type: "done" }>, "agentSession"> & {
    runtimeSession?: AgentClientSession | null;
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

  const { runtimeSession, ...rest } = event;
  return {
    ...rest,
    agentSession: runtimeSession ?? null,
  };
};

const normalizeChatResult = ({
  runtimeSession,
  ...result
}: TauriAgentClientChatResult): AgentClientChatResult => ({
  ...result,
  agentSession: runtimeSession ?? null,
});

class TauriAgentClient implements AgentClient {
  async listAgents(): Promise<AgentClientAgentDefinitionsResult> {
    return invoke<AgentClientAgentDefinitionsResult>(TAURI_AGENT_CLIENT_COMMANDS.listAgents);
  }

  async run(input: AgentClientAgentInput): Promise<AgentClientAgentTask>;
  async run(input: AgentClientChatInput): Promise<AgentClientChatResult>;
  async run(input: AgentClientCollaborationInput): Promise<AgentClientAgentTask>;
  async run(input: AgentClientCollaborationModeInput): Promise<AgentClientAgentTask>;
  async run(
    input:
      | AgentClientAgentInput
      | AgentClientChatInput
      | AgentClientCollaborationInput
      | AgentClientCollaborationModeInput,
  ): Promise<AgentClientAgentTask | AgentClientChatResult> {
    if (input.type === "chat") {
      return this.runChat(input);
    }

    if (input.type === "collaboration") {
      return this.runCollaboration(input);
    }

    if (input.type === "collaborationMode") {
      return this.runCollaborationMode(input);
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

  private async runCollaboration(
    input: AgentClientCollaborationInput,
  ): Promise<AgentClientAgentTask> {
    const { type: _type, ...taskInput } = input;
    const result = await invoke<RunAgentOutput>(
      TAURI_AGENT_CLIENT_COMMANDS.runCollaboration,
      { input: taskInput },
    );

    return {
      taskId: result.taskId,
    };
  }

  private async runCollaborationMode(
    input: AgentClientCollaborationModeInput,
  ): Promise<AgentClientAgentTask> {
    const { type: _type, ...taskInput } = input;
    const result = await invoke<RunAgentOutput>(
      TAURI_AGENT_CLIENT_COMMANDS.runCollaborationMode,
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

  async listRuntimeSessions(
    input: AgentClientListRuntimeSessionsInput,
  ): Promise<AgentClientRuntimeSessionsResult> {
    return invoke<AgentClientRuntimeSessionsResult>(
      TAURI_AGENT_CLIENT_COMMANDS.listRuntimeSessions,
      { input },
    );
  }

  async getRuntimeSession(
    input: AgentClientGetRuntimeSessionInput,
  ): Promise<AgentClientRuntimeSessionSnapshot> {
    return invoke<AgentClientRuntimeSessionSnapshot>(
      TAURI_AGENT_CLIENT_COMMANDS.getRuntimeSession,
      { input },
    );
  }

  async getCollaborationTimeline(
    input: AgentClientGetCollaborationTimelineInput,
  ): Promise<AgentClientCollaborationTimelineResult> {
    return invoke<AgentClientCollaborationTimelineResult>(
      TAURI_AGENT_CLIENT_COMMANDS.getCollaborationTimeline,
      { input },
    );
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
  async run(input: AgentClientCollaborationInput): Promise<AgentClientAgentTask>;
  async run(input: AgentClientCollaborationModeInput): Promise<AgentClientAgentTask>;
  async run(
    input:
      | AgentClientAgentInput
      | AgentClientChatInput
      | AgentClientCollaborationInput
      | AgentClientCollaborationModeInput,
  ) {
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

  async listRuntimeSessions(): Promise<AgentClientRuntimeSessionsResult> {
    return {
      sessions: [],
    };
  }

  async getRuntimeSession(
    input: AgentClientGetRuntimeSessionInput,
  ): Promise<AgentClientRuntimeSessionSnapshot> {
    return {
      session: {
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        entryCount: 0,
        traceCount: 0,
        workflowRunIds: [],
        workflowIds: [],
        modeIds: [],
      },
    };
  }

  async getCollaborationTimeline(
    input: AgentClientGetCollaborationTimelineInput,
  ): Promise<AgentClientCollaborationTimelineResult> {
    return {
      session: {
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        entryCount: 0,
        traceCount: 0,
        workflowRunIds: [],
        workflowIds: [],
        modeIds: [],
      },
      workflowRunId: input.workflowRunId ?? null,
      events: [],
    };
  }

  async abortTask(): Promise<void> {
    return undefined;
  }

  async subscribe(): Promise<() => void> {
    return () => undefined;
  }
}

const canUseTauriAgentClient = () =>
  typeof window !== "undefined" && isTauri();

export const createAgentClient = (): AgentClient =>
  canUseTauriAgentClient() ? new TauriAgentClient() : new WebPreviewAgentClient();
