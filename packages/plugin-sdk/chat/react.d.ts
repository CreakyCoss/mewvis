// Generated from the shared Chat implementation by pnpm build:chat-ui. Do not edit.
import * as react_jsx_runtime from "react/jsx-runtime";
import {
  PropsWithChildren,
  ReactNode,
  ComponentType,
  ComponentProps,
  HTMLAttributes,
} from "react";
import * as _isle_chat_contracts from "@isle/chat-contracts";
import {
  MessagePart,
  ChatRunConfig,
  ChatSession,
  ChatMessage,
  SendResult,
  ChatPendingQuestion,
} from "@isle/chat-contracts";
import { PluginChatOpenInput, PluginChatSession } from "@isle/plugin-sdk/chat";

type ChatInputFile = {
  path: string;
  name: string;
  isDirectory: boolean;
};
type ChatDisplayOptions = {
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
};
type ComposerDraft = {
  text: string;
  blocks: MessagePart[];
};
interface ChatViewPersistence {
  loadPreferences(): Promise<ChatDisplayOptions>;
  savePreferences(value: ChatDisplayOptions): Promise<void>;
}

type Environment = {
  files?: (session: ChatSession) => ChatInputFile[];
  persistence?: (
    session: ChatSession,
    viewId: string,
  ) => ChatViewPersistence | undefined;
};
declare function ChatEnvironment({
  children,
  ...environment
}: PropsWithChildren<Environment>): react_jsx_runtime.JSX.Element;
declare function ChatProvider({
  session,
  viewId,
  children,
}: PropsWithChildren<{
  session: ChatSession;
  viewId?: string;
}>): react_jsx_runtime.JSX.Element;
declare function useChatSession(): ChatSession;
declare function useChatSnapshot(): Readonly<_isle_chat_contracts.ChatSnapshot>;
declare function useChatActions(): ChatSession;
declare function useChatViewState(): {
  updatePreferences: (value: Partial<ChatDisplayOptions>) => void;
  retryPreferences: () => Promise<void>;
  draft: ComposerDraft;
  revision: number;
  clearVersion: number;
  submitting: boolean;
  error: string;
  preferenceError: string;
  preferences: {
    showThinkingProcess: boolean;
    showToolCallProcess: boolean;
  };
};
declare function useChatComposer(): {
  controls: {
    resources: _isle_chat_contracts.ChatResources;
    options: {
      showThinkingProcess: boolean;
      showToolCallProcess: boolean;
      selectedModelId: string;
      selectedAgentId: string;
      selectedSkillKeys: string[];
      selectedKnowledgeCollectionIds: string[];
      permissionMode: _isle_chat_contracts.ChatPermissionMode | null;
    };
    updateOptions(patch: Partial<ChatRunConfig & ChatDisplayOptions>): void;
  };
  initialized: boolean;
  files: ChatInputFile[];
  skills: _isle_chat_contracts.SkillOption[];
  busy: boolean;
  disabled: boolean;
  canSubmit: boolean;
  setDraft: (draft: ComposerDraft) => void;
  submit: () => Promise<
    | _isle_chat_contracts.SendResult
    | {
        readonly status: "rejected";
        readonly reason: string;
      }
  >;
  stop: () => Promise<_isle_chat_contracts.OperationResult>;
  draft: ComposerDraft;
  revision: number;
  clearVersion: number;
  submitting: boolean;
  error: string;
  preferenceError: string;
  preferences: {
    showThinkingProcess: boolean;
    showToolCallProcess: boolean;
  };
};
declare function useChatControls(): {
  resources: _isle_chat_contracts.ChatResources;
  options: {
    showThinkingProcess: boolean;
    showToolCallProcess: boolean;
    selectedModelId: string;
    selectedAgentId: string;
    selectedSkillKeys: string[];
    selectedKnowledgeCollectionIds: string[];
    permissionMode: _isle_chat_contracts.ChatPermissionMode | null;
  };
  updateOptions(patch: Partial<ChatRunConfig & ChatDisplayOptions>): void;
};

type ChatMessagesProps = {
  className?: string;
  renderMessage?: (
    message: ChatMessage,
    defaultMessage: ReactNode,
  ) => ReactNode;
  messages: ChatMessage[];
  isInitializing: boolean;
  pendingQuestionId?: string;
  displayOptions: ChatDisplayOptions;
};
declare const MessageView: ({
  message,
  displayOptions,
}: {
  message: ChatMessage;
  displayOptions: ChatDisplayOptions;
}) => react_jsx_runtime.JSX.Element;
declare const MessagesView: ({
  messages,
  isInitializing,
  pendingQuestionId,
  displayOptions,
  className,
  renderMessage,
}: ChatMessagesProps) => react_jsx_runtime.JSX.Element;

type ComposerBinding = ReturnType<typeof useChatComposer>;
type ComposerSlots = {
  editor?: ComponentType<
    ComposerBinding & {
      placeholder: string;
    }
  >;
  toolbar?: ComponentType<ComposerBinding>;
  actions?: ComponentType<ComposerBinding>;
};
declare function ComposerToolbar(
  binding: ComposerBinding,
): react_jsx_runtime.JSX.Element;
declare function ComposerActions(
  binding: ComposerBinding,
): react_jsx_runtime.JSX.Element;
type ComposerViewProps = PropsWithChildren<{
  binding: ComposerBinding;
  className?: string;
  placeholder?: string;
  slots?: ComposerSlots;
  onSubmitted?: (result: SendResult) => void;
}>;
declare function ComposerView({
  binding,
  className,
  placeholder,
  slots,
  children,
  onSubmitted,
}: ComposerViewProps): react_jsx_runtime.JSX.Element;
declare function ChatComposer(
  props: Omit<ComposerViewProps, "binding">,
): react_jsx_runtime.JSX.Element | null;

declare function Messages(
  props: Pick<ChatMessagesProps, "className" | "renderMessage">,
): react_jsx_runtime.JSX.Element;
declare function Question(): react_jsx_runtime.JSX.Element | null;
declare function ErrorNotice(): react_jsx_runtime.JSX.Element | null;
declare function Loading({
  error,
}: {
  error?: string;
}): react_jsx_runtime.JSX.Element;
declare function Layout({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>): react_jsx_runtime.JSX.Element;
declare function Footer({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): react_jsx_runtime.JSX.Element;
declare function History({
  messages,
  displayOptions,
  reason,
  onRetry,
  connecting,
  retryError,
  className,
  renderMessage,
}: Pick<ChatMessagesProps, "messages" | "renderMessage" | "className"> & {
  displayOptions?: ChatMessagesProps["displayOptions"];
  reason: string;
  onRetry?: () => void;
  connecting?: boolean;
  retryError?: string;
}): react_jsx_runtime.JSX.Element;
declare function DefaultChat({
  session,
  viewId,
  className,
  renderMessage,
  composer,
}: {
  session: ChatSession;
  viewId?: string;
  className?: string;
  renderMessage?: ChatMessagesProps["renderMessage"];
  composer?: ComponentProps<typeof ChatComposer>;
}): react_jsx_runtime.JSX.Element;
declare const Chat: typeof DefaultChat & {
  Provider: typeof ChatProvider;
  Layout: typeof Layout;
  Footer: typeof Footer;
  Messages: typeof Messages;
  Composer: typeof ChatComposer;
  Question: typeof Question;
  Error: typeof ErrorNotice;
  Loading: typeof Loading;
  History: typeof History;
};

type ChatQuestionProps = {
  question: ChatPendingQuestion;
  onAnswer: (answer: string) => Promise<void>;
  answering?: boolean;
};
declare const QuestionView: ({
  question,
  onAnswer,
  answering,
}: ChatQuestionProps) => react_jsx_runtime.JSX.Element;

/** The transport and shared client are supplied once by the sandbox host. */
declare function usePluginChatSession(input: PluginChatOpenInput | null): {
  key: string;
  session?: PluginChatSession;
  error?: string;
};

type ChatControls = ReturnType<typeof useChatControls>;
type ChatComposerProps = ComponentProps<typeof Chat.Composer>;
type MessagesProps = ComponentProps<typeof Chat.Messages>;
type RenderMessage = NonNullable<MessagesProps["renderMessage"]>;

export {
  Chat,
  ChatEnvironment,
  ComposerActions,
  ComposerToolbar,
  ComposerView,
  MessageView,
  MessagesView,
  QuestionView,
  useChatActions,
  useChatComposer,
  useChatControls,
  useChatSession,
  useChatSnapshot,
  useChatViewState,
  usePluginChatSession,
};
export type {
  ChatComposerProps,
  ChatControls,
  ChatDisplayOptions,
  ComposerBinding,
  ComposerDraft,
  ComposerSlots,
  MessagesProps,
  RenderMessage,
};
