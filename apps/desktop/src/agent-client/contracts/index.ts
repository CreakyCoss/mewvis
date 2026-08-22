import type {
  AgentEvent,
  AgentTool,
  ChatParams,
  CollaborationEvent,
  CollaborationResult,
  DoneEvent,
  ReplaceTextEvent,
  RuntimeModelInput,
  SessionMutationResult,
  SessionResult,
  SessionTargetParams,
  TextDeltaEvent,
  ThinkingDeltaEvent,
  ThinkingEndEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
} from "../wire";

type AgentClientDeltaEvent = TextDeltaEvent | ThinkingDeltaEvent;

export type AgentClientOutputEvent =
  TextDeltaEvent | ThinkingDeltaEvent | ReplaceTextEvent | ThinkingEndEvent | DoneEvent;

export type AgentClientToolEvent =
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent;

export type AgentClientStreamEvent =
  TextDeltaEvent | ThinkingDeltaEvent | ThinkingEndEvent | ReplaceTextEvent | ToolCallDeltaEvent;

export type AgentClientChatMessageEvent = AgentClientOutputEvent | AgentClientToolEvent;

/** Supervisor lifecycle payloads belong only to the Rust-to-frontend application contract. */
export const AgentClientTransportEventType = {
  State: "state",
  Stderr: "stderr",
  Exit: "exit",
} as const;

type AgentClientTransportEvent =
  | {
      type: typeof AgentClientTransportEventType.State;
      taskState: string;
      workerState: string;
      workerId?: string;
      sessionKey?: string;
      queueDepth?: number;
    }
  | { type: typeof AgentClientTransportEventType.Stderr; message: string }
  | { type: typeof AgentClientTransportEventType.Exit; success: boolean; code: number | null };

type AgentClientEventPayload = AgentEvent | CollaborationEvent | CollaborationResult | AgentClientTransportEvent;

/** Desktop task identity around a wire event or an application transport event. */
export type AgentClientAgentEvent = {
  taskId: string;
  event: AgentClientEventPayload;
};

/** Chat correlation around an unchanged SDK delta event. */
export type AgentClientChatEvent = {
  streamId: string;
  event: AgentClientDeltaEvent;
};

type AgentClientChatOutputHandlers = {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

/** Chat params are wire data; output handlers are an independent application capability. */
export type AgentClientChatInput = ChatParams & AgentClientChatOutputHandlers;

/** Desktop task submission result; this is an app contract, not a partial wire TaskResult. */
export type AgentClientAgentTask = {
  taskId: string;
};

/** Tauri unwraps the wire ChatResult before returning it to the application. */
export type AgentClientChatResult = {
  text: string;
  thinking?: string | null;
};

export type AgentClientAgentToolsResult = {
  readonly tools: readonly AgentTool[];
  readonly defaultToolNames: readonly string[];
};

/** Tauri supplies the default app-data root when rootDir is omitted. */
export type AgentClientListRuntimeSessionsInput = {
  workspacePath: string;
  rootDir?: string | null;
  limit?: number | null;
  maxDepth?: number | null;
};

export type AgentClientLedgerSummaryInput = SessionTargetParams & {
  agentRoleId?: string | null;
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
  runtimeModel?: RuntimeModelInput | null;
};

export type AgentClientLedgerResult = SessionResult | SessionMutationResult;
