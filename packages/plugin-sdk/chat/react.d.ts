import type {
  ComponentType,
  ReactNode,
  HTMLAttributes,
  PropsWithChildren,
} from "react";
import type {
  ChatSession,
  ChatSnapshot,
  ChatMessage,
  ChatRunConfig,
  ChatResources,
  MessagePart,
  SendResult,
} from "@isle/chat-contracts";
import type { PluginChatOpenInput, PluginChatSession } from "./index.js";
export type ChatDisplayOptions = {
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
};
export type ComposerDraft = { text: string; blocks: MessagePart[] };
export type ChatControls = {
  resources: ChatResources;
  options: ChatRunConfig & ChatDisplayOptions;
  updateOptions(patch: Partial<ChatRunConfig & ChatDisplayOptions>): void;
};
export type ComposerBinding = {
  draft: ComposerDraft;
  revision: number;
  clearVersion: number;
  submitting: boolean;
  error: string;
  preferenceError: string;
  preferences: ChatDisplayOptions;
  controls: ChatControls;
  initialized: boolean;
  busy: boolean;
  disabled: boolean;
  canSubmit: boolean;
  files: { path: string; name: string; isDirectory: boolean }[];
  skills: { key: string; name: string; label: string; description: string }[];
  setDraft(draft: ComposerDraft): void;
  submit(): Promise<SendResult>;
  stop(): ReturnType<ChatSession["stop"]>;
};
export type ComposerSlots = {
  editor?: ComponentType<ComposerBinding & { placeholder: string }>;
  toolbar?: ComponentType<ComposerBinding>;
  actions?: ComponentType<ComposerBinding>;
};
export type ChatComposerProps = PropsWithChildren<{
  className?: string;
  placeholder?: string;
  slots?: ComposerSlots;
  onSubmitted?: (result: SendResult) => void;
}>;
export type RenderMessage = (
  message: ChatMessage,
  defaultMessage: ReactNode,
) => ReactNode;
export type MessagesProps = {
  className?: string;
  renderMessage?: RenderMessage;
};
export declare const Chat: ComponentType<{
  session: ChatSession;
  viewId?: string;
  className?: string;
  renderMessage?: RenderMessage;
  composer?: ChatComposerProps;
}> & {
  Provider: ComponentType<
    PropsWithChildren<{ session: ChatSession; viewId?: string }>
  >;
  Layout: ComponentType<HTMLAttributes<HTMLElement>>;
  Footer: ComponentType<HTMLAttributes<HTMLDivElement>>;
  Messages: ComponentType<MessagesProps>;
  Composer: ComponentType<ChatComposerProps>;
  Error: ComponentType;
  Question: ComponentType;
  Loading: ComponentType<{ error?: string }>;
  History: ComponentType<
    MessagesProps & {
      messages: ChatMessage[];
      displayOptions?: ChatDisplayOptions;
      reason: string;
      onRetry?: () => void;
    }
  >;
};
export declare function usePluginChatSession(
  input: PluginChatOpenInput | null,
): {
  key: string;
  session?: PluginChatSession;
  error?: string;
};
export declare function useChatSession(): ChatSession;
export declare function useChatSnapshot(): Readonly<ChatSnapshot>;
export declare function useChatActions(): ChatSession;
export declare function useChatComposer(): ComposerBinding;
export declare function useChatControls(): ChatControls;
export declare function useChatViewState(): Pick<
  ComposerBinding,
  | "draft"
  | "revision"
  | "clearVersion"
  | "error"
  | "preferenceError"
  | "preferences"
  | "submitting"
> & {
  updatePreferences(value: Partial<ChatDisplayOptions>): void;
  retryPreferences(): Promise<void>;
};
export declare const ComposerView: ComponentType<
  ChatComposerProps & { binding: ComposerBinding }
>;
export declare const ComposerToolbar: ComponentType<ComposerBinding>;
export declare const ComposerActions: ComponentType<ComposerBinding>;
export declare const MessagesView: ComponentType<
  MessagesProps & {
    messages: ChatMessage[];
    isInitializing: boolean;
    pendingQuestionId?: string;
    displayOptions: ChatDisplayOptions;
  }
>;
export declare const MessageView: ComponentType<{
  message: ChatMessage;
  displayOptions: ChatDisplayOptions;
}>;
export declare const QuestionView: ComponentType<{
  question: import("@isle/chat-contracts").ChatPendingQuestion;
  answering: boolean;
  onAnswer(answer: string): Promise<void>;
}>;
export declare const ChatEnvironment: ComponentType<
  PropsWithChildren<{
    files?: (session: ChatSession) => ComposerBinding["files"];
    persistence?: (
      session: ChatSession,
      viewId: string,
    ) =>
      | {
          loadPreferences(): Promise<ChatDisplayOptions>;
          savePreferences(value: ChatDisplayOptions): Promise<void>;
        }
      | undefined;
  }>
>;
