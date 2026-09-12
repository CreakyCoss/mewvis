export type * from "@isle/chat-contracts";
import type {
  ChatSession,
  ChatSnapshot,
  ChatContext,
  OperationResult,
} from "@isle/chat-contracts";

/** Serializable scene data. Identity, credentials and filesystem paths belong to the host. */
export type PluginChatProfile = {
  id: string;
  systemPrompt: string;
  context?: ChatContext;
  allowedToolNames?: string[];
  useKnowledge?: boolean;
};
export type PluginChatCreateInput = {
  /** An ID registered to this plugin through the data SDK; host workspace IDs are not accepted. */
  workspaceId: string;
  sceneId: string;
  profile: PluginChatProfile;
};
/** workspaceId must belong to the current plugin's data SDK workspace registry. */
export type PluginChatSessionRef = { workspaceId: string; chatId: string };
/** Opens an existing host record; never creates a conversation. */
export type PluginChatOpenInput = PluginChatSessionRef;
export type PluginChatSummary = {
  sceneId: string;
  chatId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};
export type PluginChatRequest = {
  method: string;
  handle?: string;
  input?: unknown;
  watchId?: string;
};
export type PluginChatEvent = {
  handle: string;
  revision: number;
  snapshot: Readonly<ChatSnapshot>;
  watchId?: string;
};
export interface PluginChatTransport {
  request(request: PluginChatRequest): Promise<unknown>;
  subscribe(listener: (event: PluginChatEvent) => void): () => void;
}
export interface PluginChatSession extends ChatSession {
  setContext(context: ChatContext): Promise<OperationResult>;
  /** Refresh the mirror after reconnecting. Does not recreate or resend a turn. */
  reconnect(): Promise<void>;
}
export interface PluginChatClient {
  listSessions(input: { workspaceId: string }): Promise<PluginChatSummary[]>;
  /** Explicit creation; each call returns a new host-generated identity. */
  createSession(input: PluginChatCreateInput): Promise<PluginChatSession>;
  openSession(input: PluginChatOpenInput): Promise<PluginChatSession>;
  /** Detach this client only. Host sessions continue until explicitly closed. */
  dispose(): void;
}
/** Pure JS entry. A host may provide a transport without React, DOM or Tauri. */
export declare function createPluginChatClient(
  transport: PluginChatTransport,
): PluginChatClient;
/** The sandbox supplies the transport automatically. */
export declare function getPluginChatClient(): PluginChatClient;
