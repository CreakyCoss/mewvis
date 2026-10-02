export type * from "@mewvis/chat-contracts";
import type {
  ChatSession,
  ChatSnapshot,
  ChatContext,
  OperationResult,
} from "@mewvis/chat-contracts";

/** Serializable scene data. Identity, credentials and filesystem paths belong to the host. */
export type ApplicationModelOption = {
  id: string;
  provider: { id: string; name: string };
  modelId: string;
  modelName: string;
};
export type ApplicationChatProfile = {
  /** Assistant introduction shown for a newly created empty conversation. */
  introduction?: string;
  /** Application-owned scene skills. Omit to use the host catalog; [] disables scene skill choices. */
  skills?: Array<{
    key: string;
    name: string;
    label?: string;
    description: string;
    content: string;
  }>;
  skillGroup?: { label: string; description?: string };
  id: string;
  systemPrompt: string;
  context?: ChatContext;
  /** Optional scene subset. The host intersects it with current user grants on every turn. */
  allowedToolNames?: string[];
  useKnowledge?: boolean;
};
export type ApplicationChatCreateInput = {
  /** An ID registered to this application through the data SDK; host workspace IDs are not accepted. */
  workspaceId: string;
  sceneId: string;
  profile: ApplicationChatProfile;
};
/** workspaceId must belong to the current application's data SDK workspace registry. */
export type ApplicationChatSessionRef = { workspaceId: string; chatId: string };
/** Opens an existing host record; never creates a conversation. */
export type ApplicationChatOpenInput = ApplicationChatSessionRef;
export type ApplicationChatSummary = {
  sceneId: string;
  chatId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};
export type ApplicationChatRequest = {
  method: string;
  handle?: string;
  input?: unknown;
  watchId?: string;
};
export type ApplicationChatEvent = {
  handle: string;
  revision: number;
  snapshot: Readonly<ChatSnapshot>;
  watchId?: string;
};
export interface ApplicationChatTransport {
  request(request: ApplicationChatRequest): Promise<unknown>;
  subscribe(listener: (event: ApplicationChatEvent) => void): () => void;
}
export interface ApplicationChatSession extends ChatSession {
  setContext(context: ChatContext): Promise<OperationResult>;
  /** Refresh the mirror after reconnecting. Does not recreate or resend a turn. */
  reconnect(): Promise<void>;
}
export interface ApplicationChatClient {
  /** Enabled models; credentials remain in the host. */
  listModels(): Promise<ApplicationModelOption[]>;
  /** Deletes a conversation belonging to the authenticated application. */
  deleteSession(input: ApplicationChatSessionRef): Promise<void>;
  /** Read-only host tool catalog. The host checks chat permission independently of a workspace. */
  listTools(): Promise<import("../tools/index.js").ApplicationTool[]>;
  listSessions(input: {
    workspaceId: string;
  }): Promise<ApplicationChatSummary[]>;
  /** Explicit creation; each call returns a new host-generated identity. */
  createSession(
    input: ApplicationChatCreateInput,
  ): Promise<ApplicationChatSession>;
  openSession(input: ApplicationChatOpenInput): Promise<ApplicationChatSession>;
  /** Detach this client only. Host sessions continue until explicitly closed. */
  dispose(): void;
}
/** Pure JS entry. A host may provide a transport without React, DOM or Tauri. */
export declare function createApplicationChatClient(
  transport: ApplicationChatTransport,
): ApplicationChatClient;
/** The sandbox supplies the transport automatically. */
export declare function getApplicationChatClient(): ApplicationChatClient;
