import type {
  AgentRuntimeCommand,
  AgentRuntimeEvent,
  AgentRuntimeResult,
  PongResult,
  ShutdownAckResult,
  AskUserInput,
  AgentRunInput,
  AgentToolsQuery,
  AgentToolsResult,
  ChatInput,
  ChatResult,
  RuntimeModelsResult,
  TaskResult,
  AppendSessionMessagesInput,
  CompactAgentSessionInput,
  DeleteSessionMessageInput,
  EditSessionMessageInput,
  RebuildAgentSessionInput,
  RebuildSessionInput,
  ReadSessionInput,
  SessionMutationResult,
  SessionResult,
  SummarizeAgentSessionInput,
  SummarizeSessionInput,
  RuntimeSessionDebugQuery,
  RuntimeSessionDebugResult,
  RuntimeSessionQuery,
  RuntimeSessionResult,
  RuntimeSessionsQuery,
  RuntimeSessionsResult,
  CollaborationModesRuntimeResult,
  CollaborationRuntimeResult,
  CollaborationTimelineQuery,
  CollaborationTimelineResult,
  RunCollaborationInput,
  RunCollaborationModeInput,
} from "./protocol/index.js";

export type EmitAgentRuntimeEvent = (event: AgentRuntimeEvent) => void;
export type EmitAgentRuntimeResult = (result: AgentRuntimeResult) => void;

export type RuntimeUserInputRequest = {
  taskId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

export type RuntimeUserInputHandler = (request: RuntimeUserInputRequest) => Promise<string>;

export type RuntimeEngineCallbacks = {
  requestUserInput?: RuntimeUserInputHandler;
  onEvent?: EmitAgentRuntimeEvent;
  onResult?: EmitAgentRuntimeResult;
};

export type RuntimeEngineOptions = {
  callbacks?: RuntimeEngineCallbacks;
  close?: () => void;
  profileId?: string | null;
};

export interface AgentRuntimeCapabilities {
  // 查询 runtime 对前端可见的模型与工具能力；只返回展示/选择所需的稳定协议结果。
  listRuntimeModels(): Promise<RuntimeModelsResult>;
  listAgentTools(input?: AgentToolsQuery): Promise<AgentToolsResult>;
}

export interface AgentRuntimeAgent {
  // chat 是无 session 的轻量模型调用；需要上下文、工具或长期 agent session 时使用 run。
  chat(input: ChatInput): Promise<ChatResult>;
  run(input: AgentRunInput): Promise<TaskResult>;
}

export interface AgentRuntimeSessionAdmin {
  // 底层 session 投影和 ledger 变更能力；普通前端展示优先使用 engine.session.read。
  read(input: ReadSessionInput): Promise<SessionResult>;
  appendMessages(input: AppendSessionMessagesInput): Promise<SessionMutationResult>;
  editMessage(input: EditSessionMessageInput): Promise<SessionMutationResult>;
  deleteMessage(input: DeleteSessionMessageInput): Promise<SessionMutationResult>;
  rebuild(input: RebuildSessionInput): Promise<SessionMutationResult>;
  summarize(input: SummarizeSessionInput): Promise<SessionMutationResult>;
}

export interface AgentRuntimeAgentSession {
  // 绑定 agentRoleId 的长期 agent session 维护能力，保留给需要显式维护上下文的前端/工具。
  compact(input: CompactAgentSessionInput): Promise<SessionMutationResult>;
  rebuild(input: RebuildAgentSessionInput): Promise<SessionMutationResult>;
  summarize(input: SummarizeAgentSessionInput): Promise<SessionMutationResult>;
}

export interface AgentRuntimeSessionDebug {
  // 调试/审计口可读取 raw ledger/trace；业务 UI 不应依赖这里的内部结构。
  read(input: RuntimeSessionDebugQuery): Promise<RuntimeSessionDebugResult>;
}

export interface AgentRuntimeSession {
  // Runtime session 的稳定查询面向前端；read 只返回 summary/timeline 这类协议投影。
  list(input: RuntimeSessionsQuery): Promise<RuntimeSessionsResult>;
  read(input: RuntimeSessionQuery): Promise<RuntimeSessionResult>;
  debug: AgentRuntimeSessionDebug;
  admin: AgentRuntimeSessionAdmin;
  agent: AgentRuntimeAgentSession;
}

export interface AgentRuntimeCollaboration {
  // Collaboration 是业务工作流入口；底层 native/langgraph runtime 由 profile/内部 resolver 决定。
  listModes(): Promise<CollaborationModesRuntimeResult>;
  runMode(input: RunCollaborationModeInput): Promise<CollaborationRuntimeResult>;
  run(input: RunCollaborationInput): Promise<CollaborationRuntimeResult>;
  readTimeline(input: CollaborationTimelineQuery): Promise<CollaborationTimelineResult>;
}

/**
 * Agent runtime 的稳定对外门面。
 *
 * 实现约定：
 * - 这里的输入/输出只能来自 protocol 层，不暴露 native driver、provider、LangGraph 等内部实现。
 * - 前端优先调用语义化方法；stdio/worker 等桥接层可使用 handle(command) 做统一命令分发。
 * - engine.session.read 返回稳定摘要/时间线；raw ledger/trace 只通过 engine.session.debug.read 读取。
 * - collaboration mode 是业务工作流能力；底层 collaboration runtime 由 profile/内部 resolver 决定，前端不指定。
 */
export abstract class AgentRuntimeEngine {
  abstract readonly id: string;
  abstract readonly capabilities: AgentRuntimeCapabilities;
  abstract readonly agent: AgentRuntimeAgent;
  abstract readonly session: AgentRuntimeSession;
  abstract readonly collaboration: AgentRuntimeCollaboration;

  // 统一命令入口：用于 RPC/stdio 这类命令式桥接；返回 false 表示当前 engine 不处理该 command。
  abstract handle(command: AgentRuntimeCommand): Promise<boolean>;

  // 生命周期与运行状态。
  abstract ping(): Promise<PongResult>;
  abstract shutdown(): Promise<ShutdownAckResult>;
  abstract waitForRunningTask(): Promise<void>;
}
