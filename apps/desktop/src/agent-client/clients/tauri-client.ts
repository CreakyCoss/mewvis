import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AnswerQuestionInput,
  CollaborationTimelineQuery,
  RuntimeSessionDebugQuery,
  RuntimeSessionQuery,
} from "@agent-runtime/engines/protocol";
import type { AgentClientAgentEvent, AgentClientChatEvent } from "../contracts/events";
import type {
  AgentClientAgentInput,
  AgentClientAgentTask,
  AgentClientChatInput,
  AgentClientChatResult,
  AgentClientCollaborationInput,
  AgentClientCollaborationModeInput,
} from "../contracts/inputs";
import type {
  AgentClientCollaborationTimelineResult,
  AgentClientListRuntimeSessionsInput,
  AgentClientRuntimeSessionDebugSnapshot,
  AgentClientRuntimeSessionSnapshot,
  AgentClientRuntimeSessionsResult,
} from "../contracts/session";
import { dispatchAgentClientOutputEvent } from "../output";
import type {
  AgentClient,
  AgentClientAgent,
  AgentClientAgentToolsResult,
  AgentClientCapabilities,
  AgentClientCollaboration,
  AgentClientEvents,
  AgentClientSession,
  AgentClientSessionDebug,
  AgentClientTasks,
} from "../runtime";

// These names must match the Rust Tauri command and event names exactly.
const TAURI_AGENT_CLIENT_COMMANDS = {
  listAgentTools: "list_agent_runtime_tools",
  runAgent: "run_agent_runtime_agent",
  runChat: "run_agent_runtime_chat",
  runCollaboration: "run_agent_runtime_collaboration",
  runCollaborationMode: "run_agent_runtime_collaboration_mode",
  listRuntimeSessions: "list_agent_runtime_sessions",
  getRuntimeSession: "get_agent_runtime_session",
  getRuntimeSessionDebug: "get_agent_runtime_session_debug",
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

type AgentClientResourceFields = {
  allowedTools?: string[];
  enabledSkills?: string[];
};

const allowedToolsFor = (input: AgentClientResourceFields) => input.allowedTools ?? undefined;

const enabledSkillsFor = (input: AgentClientResourceFields) => input.enabledSkills ?? undefined;

class TauriAgentClientCapabilities implements AgentClientCapabilities {
  async listAgentTools(): Promise<AgentClientAgentToolsResult> {
    return invoke<AgentClientAgentToolsResult>(TAURI_AGENT_CLIENT_COMMANDS.listAgentTools, { input: {} });
  }
}

class TauriAgentClientAgent implements AgentClientAgent {
  async chat(input: AgentClientChatInput): Promise<AgentClientChatResult> {
    const shouldStream = input.stream ?? true;
    const hasOutputHandlers = Boolean(input.onTextDelta || input.onThinkingDelta);
    const streamId =
      shouldStream && (hasOutputHandlers || input.streamId) ? (input.streamId ?? crypto.randomUUID()) : undefined;
    const unlisten =
      streamId && hasOutputHandlers
        ? await listen<AgentClientChatEvent>(TAURI_AGENT_CLIENT_EVENTS.chat, (event) => {
            if (event.payload.streamId !== streamId) {
              return;
            }
            dispatchAgentClientOutputEvent(event.payload, input);
          })
        : undefined;

    return invoke<AgentClientChatResult>(TAURI_AGENT_CLIENT_COMMANDS.runChat, {
      input: {
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        streamId,
        stream: shouldStream,
        runtimeModel: input.runtimeModel,
        systemPrompt: input.systemPrompt ?? "",
        userMessage: input.userMessage,
        requestContext: input.requestContext,
        runtimeInstruction: input.runtimeInstruction,
        bootstrapInstruction: input.bootstrapInstruction,
        messages: input.messages,
      },
    }).finally(() => {
      unlisten?.();
    });
  }

  async run(input: AgentClientAgentInput): Promise<AgentClientAgentTask> {
    const result = await invoke<RunAgentOutput>(TAURI_AGENT_CLIENT_COMMANDS.runAgent, {
      input: {
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        agentRoleId: input.agentRoleId,
        userMessage: input.userMessage,
        systemPrompt: input.systemPrompt,
        requestContext: input.requestContext,
        runtimeInstruction: input.runtimeInstruction,
        bootstrapInstruction: input.bootstrapInstruction,
        runtimeModel: input.runtimeModel,
        allowedTools: allowedToolsFor(input),
        enabledSkills: enabledSkillsFor(input),
      },
    });

    return {
      taskId: result.taskId,
    };
  }

  async answerQuestion(input: AnswerQuestionInput): Promise<void> {
    await invoke(TAURI_AGENT_CLIENT_COMMANDS.answerQuestion, { input });
  }
}

class TauriAgentClientSessionDebug implements AgentClientSessionDebug {
  async read(input: RuntimeSessionDebugQuery): Promise<AgentClientRuntimeSessionDebugSnapshot> {
    return invoke<AgentClientRuntimeSessionDebugSnapshot>(TAURI_AGENT_CLIENT_COMMANDS.getRuntimeSessionDebug, {
      input,
    });
  }
}

class TauriAgentClientSession implements AgentClientSession {
  readonly debug: AgentClientSessionDebug = new TauriAgentClientSessionDebug();

  async list(input: AgentClientListRuntimeSessionsInput): Promise<AgentClientRuntimeSessionsResult> {
    return invoke<AgentClientRuntimeSessionsResult>(TAURI_AGENT_CLIENT_COMMANDS.listRuntimeSessions, { input });
  }

  async read(input: RuntimeSessionQuery): Promise<AgentClientRuntimeSessionSnapshot> {
    return invoke<AgentClientRuntimeSessionSnapshot>(TAURI_AGENT_CLIENT_COMMANDS.getRuntimeSession, { input });
  }
}

class TauriAgentClientCollaboration implements AgentClientCollaboration {
  async run(input: AgentClientCollaborationInput): Promise<AgentClientAgentTask> {
    const result = await invoke<RunAgentOutput>(TAURI_AGENT_CLIENT_COMMANDS.runCollaboration, {
      input: {
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        workflow: input.workflow,
        agents: input.agents,
        input: input.input,
        allowedTools: allowedToolsFor(input),
        enabledSkills: enabledSkillsFor(input),
      },
    });

    return {
      taskId: result.taskId,
    };
  }

  async runMode(input: AgentClientCollaborationModeInput): Promise<AgentClientAgentTask> {
    const result = await invoke<RunAgentOutput>(TAURI_AGENT_CLIENT_COMMANDS.runCollaborationMode, {
      input: {
        workspacePath: input.workspacePath,
        sessionRootDir: input.sessionRootDir,
        mode: input.mode,
        participants: input.participants,
        context: input.context,
        options: input.options,
        allowedTools: allowedToolsFor(input),
        enabledSkills: enabledSkillsFor(input),
      },
    });

    return {
      taskId: result.taskId,
    };
  }

  async readTimeline(input: CollaborationTimelineQuery): Promise<AgentClientCollaborationTimelineResult> {
    return invoke<AgentClientCollaborationTimelineResult>(TAURI_AGENT_CLIENT_COMMANDS.getCollaborationTimeline, {
      input,
    });
  }
}

class TauriAgentClientEvents implements AgentClientEvents {
  async subscribe(listener: (event: AgentClientAgentEvent) => void) {
    return listen<AgentClientAgentEvent>(TAURI_AGENT_CLIENT_EVENTS.agent, (event) => {
      listener(event.payload);
    });
  }
}

class TauriAgentClientTasks implements AgentClientTasks {
  async abort(taskId: string): Promise<void> {
    await invoke(TAURI_AGENT_CLIENT_COMMANDS.abortTask, { taskId });
  }
}

class TauriAgentClient implements AgentClient {
  readonly capabilities: AgentClientCapabilities = new TauriAgentClientCapabilities();
  readonly agent: AgentClientAgent = new TauriAgentClientAgent();
  readonly session: AgentClientSession = new TauriAgentClientSession();
  readonly collaboration: AgentClientCollaboration = new TauriAgentClientCollaboration();
  readonly events: AgentClientEvents = new TauriAgentClientEvents();
  readonly tasks: AgentClientTasks = new TauriAgentClientTasks();
}

export const createTauriAgentClient = (): AgentClient => new TauriAgentClient();
