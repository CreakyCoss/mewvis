import type { AgentClientAgentTask, AgentClientAgentToolsResult, AgentClientChatResult } from "../contracts";
import {
  AgentRuntimeResultType,
  agentPermissionOptions,
  type AgentRunParams,
  type CollaborationTimelineParams,
  type CollaborationTimelineResult,
  type RuntimeSessionDebugParams,
  type RuntimeSessionDebugResult,
  type RuntimeSessionParams,
  type RuntimeSessionResult,
  type RuntimeSessionsResult,
} from "../wire";
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
      permissionOptions: agentPermissionOptions,
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

  async run(input: AgentRunParams): Promise<AgentClientAgentTask> {
    return { taskId: input.taskId };
  }
}

class WebPreviewAgentClientSessionDebug implements AgentClientSessionDebug {
  async read(input: RuntimeSessionDebugParams): Promise<RuntimeSessionDebugResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionDebugResult,
      session: emptyRuntimeSession(input),
      ledger: null,
      trace: [],
    };
  }
}

class WebPreviewAgentClientSession implements AgentClientSession {
  readonly debug: AgentClientSessionDebug = new WebPreviewAgentClientSessionDebug();

  async list(): Promise<RuntimeSessionsResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionsResult,
      sessions: [],
    };
  }

  async read(input: RuntimeSessionParams): Promise<RuntimeSessionResult> {
    return {
      type: AgentRuntimeResultType.RuntimeSessionResult,
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

  async readTimeline(input: CollaborationTimelineParams): Promise<CollaborationTimelineResult> {
    return {
      type: AgentRuntimeResultType.CollaborationTimelineResult,
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
  async answerApproval(): Promise<void> {
    throw new Error("网页预览不支持执行审批");
  }

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
