import type { AgentClientAgentEvent } from "@/agent-client/contracts";
import type { ChatMessage, ChatPendingQuestion, ChatUserMessageBlock } from "./messages";

export type SessionIdentity = { scope: string; id: string };
export const sessionKey = ({ scope, id }: SessionIdentity) => JSON.stringify([scope, id]);

export type ChatRunConfig = {
  selectedModelId: string;
  selectedAgentId: string;
  selectedSkillKeys: string[];
  selectedKnowledgeCollectionIds: string[];
  selectedToolNames: string[];
};
export type ResourceOption = { value: string; label: string; description: string; isDefault: boolean };
export type SkillOption = { key: string; name: string; label: string; description: string };
export type ChatResources = {
  models?: (ResourceOption & { selectedLabel: string })[];
  agents?: ResourceOption[];
  skillGroups?: (ResourceOption & { skills: SkillOption[] })[];
  tools?: ResourceOption[];
  knowledgeCollections?: (ResourceOption & { sourceDirectory?: string | null })[];
  errors?: Partial<Record<"models" | "agents" | "skillGroups" | "tools" | "knowledgeCollections", string>>;
};
export interface ChatCatalog {
  load(options?: { refresh?: boolean }): Promise<ChatResources>;
}
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
export type MessagePart = WithoutId<ChatUserMessageBlock>;
export type MessageInput = { text: string; blocks?: MessagePart[]; requestId?: string };
export type ChatContext = { systemPrompt?: string; requestContext?: string; runtimeInstruction?: string };
export type TurnInput = { identity: SessionIdentity; taskId: string; input: MessageInput; config: ChatRunConfig };
export interface ChatContextProvider {
  prepare(turn: TurnInput, signal: AbortSignal): Promise<ChatContext>;
}
/** Runtime secrets stay in the adapter's dispatch closure, never in snapshots or UI props. */
export type PreparedChatRun = { dispatch(): Promise<void>; author?: { name?: string; avatar?: string } };
export interface ChatRuntime {
  subscribe(listener: (event: AgentClientAgentEvent) => void): Promise<() => void>;
  prepare(turn: TurnInput & { context: ChatContext }, signal: AbortSignal): Promise<PreparedChatRun>;
  abort(taskId: string): Promise<void>;
  answer(taskId: string, questionId: string, answer: string): Promise<void>;
  release(): Promise<void>;
}
export type ChatRecord = { title: string; messages: ChatMessage[]; config?: Partial<ChatRunConfig> };
export interface ChatStorage {
  load(): Promise<ChatRecord | null>;
  save(record: ChatRecord): Promise<void>;
  flush?(): Promise<void>;
}
export type ChatPhase =
  "initializing" | "idle" | "preparing" | "submitting" | "running" | "waiting" | "stopping" | "closing" | "closed";
export type ChatSnapshot = {
  identity: SessionIdentity;
  phase: ChatPhase;
  initialized: boolean;
  title: string;
  messages: ChatMessage[];
  config: ChatRunConfig;
  resources: ChatResources;
  activeTaskId: string | null;
  pendingQuestion: ChatPendingQuestion | null;
  answering: boolean;
  error: string;
  initializationError: string;
  saveError: string;
  dirty: boolean;
};
export type SendResult = { status: "dispatched" | "cancelled" | "rejected"; taskId?: string; reason?: string };
export type OperationResult = { ok: true } | { ok: false; error: string };
export interface ChatSession {
  readonly identity: SessionIdentity;
  getSnapshot(): Readonly<ChatSnapshot>;
  subscribe(listener: () => void): () => void;
  send(input: MessageInput): Promise<SendResult>;
  stop(): Promise<OperationResult>;
  answer(input: { questionId: string; answer: string }): Promise<OperationResult>;
  updateConfig(patch: Partial<ChatRunConfig>): OperationResult;
  refreshResources(): Promise<void>;
  retryInitialization(): Promise<void>;
  flush(): Promise<OperationResult>;
  retrySave(): Promise<OperationResult>;
  close(): Promise<OperationResult>;
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
  return {
    selectedModelId:
      saved.selectedModelId ??
      (resources.models?.find((model) => model.isDefault) ?? resources.models?.[0])?.value ??
      "",
    selectedAgentId: saved.selectedAgentId ?? resources.agents?.find((agent) => agent.isDefault)?.value ?? "",
    selectedSkillKeys: saved.selectedSkillKeys ?? [
      ...new Set((defaults ? [defaults] : groups).flatMap((group) => group.skills.map((skill) => skill.key))),
    ],
    selectedKnowledgeCollectionIds:
      saved.selectedKnowledgeCollectionIds ??
      (resources.knowledgeCollections ?? []).filter((item) => item.isDefault).map((item) => item.value),
    selectedToolNames:
      saved.selectedToolNames ?? (resources.tools ?? []).filter((item) => item.isDefault).map((item) => item.value),
  };
}
export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
