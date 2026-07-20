import type {
  AnswerQuestionInput,
  CollaborationTimelineQuery,
  RuntimeSessionDebugQuery,
  RuntimeSessionQuery,
} from "@agent-runtime/engines/protocol";
import {
  abortAgentRuntimeTask,
  answerAgentRuntimeQuestion,
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
import type { AgentClientAgentEvent } from "../contracts/events";
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

type AgentClientResourceFields = {
  allowedTools?: string[];
  enabledSkills?: string[];
};

const allowedToolsFor = (input: AgentClientResourceFields) => input.allowedTools ?? undefined;

const enabledSkillsFor = (input: AgentClientResourceFields) => input.enabledSkills ?? undefined;

class TauriAgentClientCapabilities implements AgentClientCapabilities {
  async listAgentTools(): Promise<AgentClientAgentToolsResult> {
    return listAgentRuntimeTools();
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
            dispatchAgentClientOutputEvent(event, input);
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

  async run(input: AgentClientAgentInput): Promise<AgentClientAgentTask> {
    const taskId = input.taskId?.trim() || crypto.randomUUID();
    const result = await runAgentRuntimeAgent({
      taskId,
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
  async read(input: RuntimeSessionDebugQuery): Promise<AgentClientRuntimeSessionDebugSnapshot> {
    return getAgentRuntimeSessionDebug(input);
  }
}

class TauriAgentClientSession implements AgentClientSession {
  readonly debug: AgentClientSessionDebug = new TauriAgentClientSessionDebug();

  async list(input: AgentClientListRuntimeSessionsInput): Promise<AgentClientRuntimeSessionsResult> {
    return listAgentRuntimeSessions(input);
  }

  async read(input: RuntimeSessionQuery): Promise<AgentClientRuntimeSessionSnapshot> {
    return getAgentRuntimeSession(input);
  }
}

class TauriAgentClientCollaboration implements AgentClientCollaboration {
  async run(input: AgentClientCollaborationInput): Promise<AgentClientAgentTask> {
    const result = await runAgentRuntimeCollaboration({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      workflow: input.workflow,
      agents: input.agents,
      input: input.input,
      allowedTools: allowedToolsFor(input),
      enabledSkills: enabledSkillsFor(input),
    });

    return {
      taskId: result.taskId,
    };
  }

  async runMode(input: AgentClientCollaborationModeInput): Promise<AgentClientAgentTask> {
    const result = await runAgentRuntimeCollaborationMode({
      workspacePath: input.workspacePath,
      sessionRootDir: input.sessionRootDir,
      mode: input.mode,
      participants: input.participants,
      context: input.context,
      options: input.options,
      allowedTools: allowedToolsFor(input),
      enabledSkills: enabledSkillsFor(input),
    });

    return {
      taskId: result.taskId,
    };
  }

  async readTimeline(input: CollaborationTimelineQuery): Promise<AgentClientCollaborationTimelineResult> {
    return getAgentRuntimeCollaborationTimeline(input);
  }
}

class TauriAgentClientEvents implements AgentClientEvents {
  async subscribe(listener: (event: AgentClientAgentEvent) => void) {
    return listenAgentRuntimeAgentEvents(listener);
  }
}

class TauriAgentClientTasks implements AgentClientTasks {
  async answerQuestion(input: AnswerQuestionInput): Promise<void> {
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
