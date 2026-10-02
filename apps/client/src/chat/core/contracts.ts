import type { AgentClientAgentEvent } from "@/agent-client/contracts";
import type {
  SessionIdentity,
  ChatRunConfig,
  ChatResources,
  MessageInput,
  ChatContext,
  ChatRecord,
  ChatSnapshot,
  ChatMessage,
} from "@mewvis/chat-contracts";
export const sessionKey = ({ scope, id }: SessionIdentity) => JSON.stringify([scope, id]);
export interface ChatCatalog {
  load(options?: { refresh?: boolean }): Promise<ChatResources>;
}
export type TurnInput = { identity: SessionIdentity; taskId: string; input: MessageInput; config: ChatRunConfig };
export interface ChatContextProvider {
  prepare(turn: TurnInput, signal: AbortSignal): Promise<ChatContext>;
}
/** Runtime secrets stay in the adapter's dispatch closure, never in snapshots or UI props. */
export type PreparedChatRun = { dispatch(): Promise<void>; author?: { name?: string; avatar?: string } };
export interface ChatRuntime {
  /** Runs inside the cancellable preparing phase, before application history is changed. */
  authorize?(turn: TurnInput, signal: AbortSignal): Promise<void>;
  subscribe(listener: (event: AgentClientAgentEvent) => void): Promise<() => void>;
  prepare(turn: TurnInput & { context: ChatContext }, signal: AbortSignal): Promise<PreparedChatRun>;
  abort(taskId: string): Promise<void>;
  resume?(taskId: string): Promise<void>;
  answer(taskId: string, questionId: string, answer: string | null): Promise<void>;
  release(): Promise<void>;
}
export interface ChatStorage {
  load(): Promise<ChatRecord | null>;
  save(record: ChatRecord): Promise<void>;
  flush?(): Promise<void>;
}
export type ChatSessionOptions = {
  identity: SessionIdentity;
  runtime: ChatRuntime;
  storage: ChatStorage;
  catalog: ChatCatalog;
  context?: ChatContextProvider;
  config?: Partial<ChatRunConfig>;
  initialMessages?: ChatMessage[];
  saveDelays?: { node: number; stream: number };
};
export const isChatBusy = (snapshot: Readonly<ChatSnapshot>) => Boolean(snapshot.activeTaskId);

export function defaultConfig(resources: ChatResources, saved: Partial<ChatRunConfig> = {}): ChatRunConfig {
  const groups = resources.skillGroups ?? [];
  const defaults = groups.find((group) => group.isDefault);
  const permissions = resources.permissionOptions;
  const permission =
    permissions?.find((option) => option.mode === saved.permissionMode) ??
    permissions?.find((option) => option.isDefault);
  const selectedModelId =
    saved.selectedModelId ?? (resources.models?.find((model) => model.isDefault) ?? resources.models?.[0])?.value ?? "";
  const thinking = resources.models?.find((model) => model.value === selectedModelId)?.thinking;
  return {
    selectedModelId,
    thinkingLevel: saved.thinkingLevel === undefined ? (thinking?.defaultLevel ?? null) : saved.thinkingLevel,
    selectedAgentId: resources.agents?.some((agent) => agent.value === saved.selectedAgentId)
      ? saved.selectedAgentId!
      : "",
    selectedSkillKeys: saved.selectedSkillKeys ?? [
      ...new Set((defaults ? [defaults] : groups).flatMap((group) => group.skills.map((skill) => skill.key))),
    ],
    selectedKnowledgeCollectionIds:
      saved.selectedKnowledgeCollectionIds ??
      (resources.knowledgeCollections ?? []).filter((item) => item.isDefault).map((item) => item.value),
    permissionMode: permission?.mode ?? (permissions?.length ? null : (saved.permissionMode ?? null)),
  };
}
export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
