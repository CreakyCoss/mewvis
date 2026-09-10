import {
  abortAgentRuntimeTask,
  answerAgentRuntimeQuestion,
  answerAgentRuntimeApproval,
  getAgentRuntimeCollaborationTimeline,
  getAgentRuntimeSession,
  getAgentRuntimeSessionDebug,
  listenAgentRuntimeAgentEvents,
  listenAgentRuntimeChatEvents,
  listAgentRuntimeSessions,
  listAgentRuntimeTools,
  runAgentRuntimeAgent,
  runAgentRuntimeChat,
  runAgentRuntimeCollaboration,
  runAgentRuntimeCollaborationMode,
} from "@/api/agent-runtime";
import type {
  AgentClientAgentEvent,
  AgentClientAgentTask,
  AgentClientAgentToolsResult,
  AgentClientChatInput,
  AgentClientChatResult,
  AgentClientListRuntimeSessionsInput,
} from "../contracts";
import type {
  AgentRunParams,
  EmptyParams,
  AnswerQuestionParams,
  AnswerApprovalParams,
  CollaborationModeRunParams,
  CollaborationRunParams,
  CollaborationTimelineParams,
  CollaborationTimelineResult,
  RuntimeSessionDebugParams,
  RuntimeSessionDebugResult,
  RuntimeSessionParams,
  RuntimeSessionResult,
  RuntimeSessionsResult,
} from "../wire";
import { dispatchAgentClientOutputEvent } from "../output";
import type {
  AgentClient,
  AgentClientAgent,
  AgentClientCapabilities,
  AgentClientCollaboration,
  AgentClientEvents,
  AgentClientSession,
  AgentClientSessionDebug,
  AgentClientTasks,
} from "../runtime";

class TauriAgentClientCapabilities implements AgentClientCapabilities {
  async listAgentTools(input: EmptyParams = {}): Promise<AgentClientAgentToolsResult> {
    return listAgentRuntimeTools(input);
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
        ? await listenAgentRuntimeChatEvents((event) => {
            if (event.streamId !== streamId) {
              return;
            }
            dispatchAgentClientOutputEvent(event.event, input);
          })
        : undefined;

    return runAgentRuntimeChat({
      streamId,
      stream: shouldStream,
      runtimeModel: input.runtimeModel,
      systemPrompt: input.systemPrompt ?? "",
      messages: input.messages,
    }).finally(() => {
      unlisten?.();
    });
  }

  async run(input: AgentRunParams): Promise<AgentClientAgentTask> {
    const taskId = input.taskId;
    const result = await runAgentRuntimeAgent({
      ...input,
      taskId,
    });

    if (result.taskId !== taskId) {
      throw new Error(`Agent runtime 返回了不匹配的任务 ID：${result.taskId}`);
    }

    return {
      taskId: result.taskId,
    };
  }
}

class TauriAgentClientSessionDebug implements AgentClientSessionDebug {
  async read(input: RuntimeSessionDebugParams): Promise<RuntimeSessionDebugResult> {
    return getAgentRuntimeSessionDebug(input);
  }
}

class TauriAgentClientSession implements AgentClientSession {
  readonly debug: AgentClientSessionDebug = new TauriAgentClientSessionDebug();

  async list(input: AgentClientListRuntimeSessionsInput): Promise<RuntimeSessionsResult> {
    return listAgentRuntimeSessions(input);
  }

  async read(input: RuntimeSessionParams): Promise<RuntimeSessionResult> {
    return getAgentRuntimeSession(input);
  }
}

class TauriAgentClientCollaboration implements AgentClientCollaboration {
  async run(input: CollaborationRunParams): Promise<AgentClientAgentTask> {
    const result = await runAgentRuntimeCollaboration(input);

    return {
      taskId: result.taskId,
    };
  }

  async runMode(input: CollaborationModeRunParams): Promise<AgentClientAgentTask> {
    const result = await runAgentRuntimeCollaborationMode(input);

    return {
      taskId: result.taskId,
    };
  }

  async readTimeline(input: CollaborationTimelineParams): Promise<CollaborationTimelineResult> {
    return getAgentRuntimeCollaborationTimeline(input);
  }
}

class TauriAgentClientEvents implements AgentClientEvents {
  async subscribe(listener: (event: AgentClientAgentEvent) => void) {
    return listenAgentRuntimeAgentEvents(listener);
  }
}

class TauriAgentClientTasks implements AgentClientTasks {
  async answerApproval(input: AnswerApprovalParams): Promise<void> {
    await answerAgentRuntimeApproval(input);
  }

  async answerQuestion(input: AnswerQuestionParams): Promise<void> {
    await answerAgentRuntimeQuestion(input);
  }

  async abort(taskId: string): Promise<void> {
    await abortAgentRuntimeTask(taskId);
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
