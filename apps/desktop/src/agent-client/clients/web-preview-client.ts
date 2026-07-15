import type {
  CollaborationTimelineQuery,
  RuntimeSessionDebugQuery,
  RuntimeSessionQuery,
} from "@agent-runtime/engines/protocol";
import type { AgentClientAgentInput, AgentClientAgentTask, AgentClientChatResult } from "../contracts/inputs";
import type {
  AgentClientCollaborationTimelineResult,
  AgentClientRuntimeSessionDebugSnapshot,
  AgentClientRuntimeSessionSnapshot,
  AgentClientRuntimeSessionsResult,
} from "../contracts/session";
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

const emptyRuntimeSession = (input: { workspacePath: string; sessionRootDir: string }) => ({
  workspacePath: input.workspacePath,
  sessionRootDir: input.sessionRootDir,
  entryCount: 0,
  traceCount: 0,
  workflowRunIds: [],
  workflowIds: [],
  modeIds: [],
});

class WebPreviewAgentClientCapabilities implements AgentClientCapabilities {
  async listAgentTools(): Promise<AgentClientAgentToolsResult> {
    return {
      tools: [],
      defaultToolNames: [],
    };
  }
}

class WebPreviewAgentClientAgent implements AgentClientAgent {
  async chat(): Promise<AgentClientChatResult> {
    return {
      text: "当前为 Web 预览模式，未连接桌面运行时。",
      thinking: null,
    };
  }

  async run(input: AgentClientAgentInput): Promise<AgentClientAgentTask> {
    return { taskId: input.taskId?.trim() || crypto.randomUUID() };
  }
}

class WebPreviewAgentClientSessionDebug implements AgentClientSessionDebug {
  async read(input: RuntimeSessionDebugQuery): Promise<AgentClientRuntimeSessionDebugSnapshot> {
    return {
      session: emptyRuntimeSession(input),
      ledger: null,
      trace: [],
    };
  }
}

class WebPreviewAgentClientSession implements AgentClientSession {
  readonly debug: AgentClientSessionDebug = new WebPreviewAgentClientSessionDebug();

  async list(): Promise<AgentClientRuntimeSessionsResult> {
    return {
      sessions: [],
    };
  }

  async read(input: RuntimeSessionQuery): Promise<AgentClientRuntimeSessionSnapshot> {
    return {
      session: emptyRuntimeSession(input),
    };
  }
}

class WebPreviewAgentClientCollaboration implements AgentClientCollaboration {
  async run(): Promise<AgentClientAgentTask> {
    return { taskId: crypto.randomUUID() };
  }

  async runMode(): Promise<AgentClientAgentTask> {
    return { taskId: crypto.randomUUID() };
  }

  async readTimeline(input: CollaborationTimelineQuery): Promise<AgentClientCollaborationTimelineResult> {
    return {
      session: emptyRuntimeSession(input),
      workflowRunId: input.workflowRunId ?? null,
      events: [],
    };
  }
}

class WebPreviewAgentClientEvents implements AgentClientEvents {
  async subscribe(): Promise<() => void> {
    return () => undefined;
  }
}

class WebPreviewAgentClientTasks implements AgentClientTasks {
  async answerQuestion(): Promise<void> {
    return undefined;
  }

  async abort(): Promise<void> {
    return undefined;
  }
}

class WebPreviewAgentClient implements AgentClient {
  readonly capabilities: AgentClientCapabilities = new WebPreviewAgentClientCapabilities();
  readonly agent: AgentClientAgent = new WebPreviewAgentClientAgent();
  readonly session: AgentClientSession = new WebPreviewAgentClientSession();
  readonly collaboration: AgentClientCollaboration = new WebPreviewAgentClientCollaboration();
  readonly events: AgentClientEvents = new WebPreviewAgentClientEvents();
  readonly tasks: AgentClientTasks = new WebPreviewAgentClientTasks();
}

export const createWebPreviewAgentClient = (): AgentClient => new WebPreviewAgentClient();
