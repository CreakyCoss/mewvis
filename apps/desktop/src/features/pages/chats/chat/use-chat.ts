import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createAgentClient } from "@/agent-client/runtime";
import type { AgentClientAgentEvent } from "@/agent-client/types";
import { loadChat, saveChat as saveChatApi } from "@/api/chat";
import type { ChatInputSubmitPayload } from "../components/chat-input/type";
import { buildAgentPrompt } from "./prompt";
import { applyChatMessageEvent, failChatMessage } from "./reducer";
import type {
  ChatAssistantMessage,
  ChatMessage,
  ChatPendingQuestion,
  ChatSaveInput,
  ChatStatus,
  ChatUserMessage,
} from "./type";

type ChatActiveTurn = {
  taskId: string;
  messageId: string;
};

type ChatStore = {
  chatId: string;
  messages: ChatMessage[];
  activeTurn: ChatActiveTurn | null;
  pendingQuestion: ChatPendingQuestion | null;
  isInitializing: boolean;
  error: string;
  initialize: (chatId: string) => void;
  hydrateMessages: (messages: ChatMessage[]) => void;
  setInitializing: (isInitializing: boolean) => void;
  addMessages: (messages: ChatMessage[]) => void;
  updateMessage: (messageId: string, update: (message: ChatMessage) => ChatMessage) => void;
  startTurn: (turn: ChatActiveTurn) => void;
  finishTurn: () => void;
  setPendingQuestion: (question: ChatPendingQuestion | null) => void;
  setError: (error: string) => void;
};

const createChatStore = () =>
  createStore<ChatStore>()((set) => ({
    chatId: "",
    messages: [],
    activeTurn: null,
    pendingQuestion: null,
    isInitializing: true,
    error: "",
    initialize: (chatId) =>
      set({
        chatId,
        messages: [],
        activeTurn: null,
        pendingQuestion: null,
        isInitializing: true,
        error: "",
      }),
    hydrateMessages: (messages) => set({ messages }),
    setInitializing: (isInitializing) => set({ isInitializing }),
    addMessages: (messages) => set((state) => ({ messages: [...state.messages, ...messages] })),
    updateMessage: (messageId, update) =>
      set((state) => ({
        messages: state.messages.map((message) => (message.id === messageId ? update(message) : message)),
      })),
    startTurn: (activeTurn) => set({ activeTurn, pendingQuestion: null, error: "" }),
    finishTurn: () => set({ activeTurn: null, pendingQuestion: null }),
    setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
    setError: (error) => set({ error }),
  }));

type StreamEvent = Extract<
  AgentClientAgentEvent,
  { type: "text_delta" | "thinking_delta" | "thinking_end" | "replace_text" | "tool_call_delta" }
>;

type UseChatInput = {
  chatId: string;
  workspacePath: string;
  initialRequest?: ChatInputSubmitPayload;
  saveChat?: (input: ChatSaveInput) => Promise<unknown>;
  onStatusChange?: (status: ChatStatus) => void;
};

const createMessageId = () => crypto.randomUUID();

const getUserMessageText = (message: ChatUserMessage) =>
  message.blocks
    .map((block) => {
      if (block.type === "skill-reference") {
        return `/${block.name}`;
      }
      if (block.type === "file-reference") {
        return `@${block.path}`;
      }
      return block.content;
    })
    .join("")
    .trim();

const chatTitle = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find((message): message is ChatUserMessage => message.role === "user");
  const text = firstUserMessage ? getUserMessageText(firstUserMessage) : "";
  return text ? text.replace(/\s+/g, " ").slice(0, 36) : "新的聊天";
};

const updateAssistantMessage =
  (update: (message: ChatAssistantMessage) => ChatAssistantMessage) =>
  (message: ChatMessage): ChatMessage =>
    message.role === "assistant" ? update(message) : message;

const restoreMessages = (messages: ChatMessage[]) =>
  messages.map((message) =>
    message.role === "assistant" && (message.status === "loading" || message.status === "streaming")
      ? failChatMessage(message, "Agent 任务未正常结束。")
      : message,
  );

const applyStreamEvents = (message: ChatAssistantMessage, events: StreamEvent[]) =>
  events.reduce<ChatAssistantMessage>(applyChatMessageEvent, message);

export const useChat = ({ chatId, workspacePath, initialRequest, saveChat, onStatusChange }: UseChatInput) => {
  const [chatStore] = useState(() => createChatStore());
  const chatState = useStore(chatStore);
  const [agentClient] = useState(createAgentClient);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const streamEventsRef = useRef<StreamEvent[]>([]);
  const streamFrameRef = useRef<number | null>(null);
  const lastStderrRef = useRef("");
  const initialRequestChatIdRef = useRef("");

  const persistMessages = useCallback(() => {
    const state = chatStore.getState();
    if (state.chatId !== chatId || state.messages.length === 0) {
      return Promise.resolve();
    }

    const messages = state.messages;
    const save = saveQueueRef.current.then(async () => {
      const input: ChatSaveInput = {
        chatId,
        title: chatTitle(messages),
        messages,
      };

      if (saveChat) {
        await saveChat(input);
      } else {
        await saveChatApi({ ...input, workspacePath });
      }
    });

    saveQueueRef.current = save.catch((error) => {
      const message = error instanceof Error ? error.message : "聊天记录保存失败";
      chatStore.getState().setError(`回复已保留在当前页面，但保存失败：${message}`);
    });

    return save;
  }, [chatId, chatStore, saveChat, workspacePath]);

  const flushStreamEvents = useCallback(() => {
    if (streamFrameRef.current !== null) {
      window.cancelAnimationFrame(streamFrameRef.current);
      streamFrameRef.current = null;
    }

    const events = streamEventsRef.current;
    streamEventsRef.current = [];
    if (events.length === 0) {
      return;
    }

    const state = chatStore.getState();
    const messageId = state.activeTurn?.messageId;
    if (messageId) {
      state.updateMessage(
        messageId,
        updateAssistantMessage((message) => applyStreamEvents(message, events)),
      );
    }
  }, [chatStore]);

  const enqueueStreamEvent = useCallback(
    (event: StreamEvent) => {
      streamEventsRef.current.push(event);
      if (streamFrameRef.current === null) {
        streamFrameRef.current = window.requestAnimationFrame(flushStreamEvents);
      }
    },
    [flushStreamEvents],
  );

  const finishWithError = useCallback(
    (message: string) => {
      flushStreamEvents();
      const state = chatStore.getState();
      const messageId = state.activeTurn?.messageId;
      if (!messageId) {
        return;
      }

      state.updateMessage(
        messageId,
        updateAssistantMessage((currentMessage) => failChatMessage(currentMessage, message)),
      );
      state.setError(message);
      state.finishTurn();
      void persistMessages();
    },
    [chatStore, flushStreamEvents, persistMessages],
  );

  const handleAgentEvent = useCallback(
    (event: AgentClientAgentEvent) => {
      const state = chatStore.getState();
      const activeTurn = state.activeTurn;
      if (!activeTurn || (event.taskId && event.taskId !== activeTurn.taskId)) {
        return;
      }

      if (
        event.type === "text_delta" ||
        event.type === "thinking_delta" ||
        event.type === "thinking_end" ||
        event.type === "replace_text" ||
        event.type === "tool_call_delta"
      ) {
        enqueueStreamEvent(event);
        return;
      }

      flushStreamEvents();

      if (event.type === "started") {
        state.updateMessage(
          activeTurn.messageId,
          updateAssistantMessage((message) => ({ ...message, status: "streaming" })),
        );
        return;
      }

      if (
        event.type === "tool_call_start" ||
        event.type === "tool_call_end" ||
        event.type === "tool_execution_start" ||
        event.type === "tool_execution_update" ||
        event.type === "tool_execution_end"
      ) {
        state.updateMessage(
          activeTurn.messageId,
          updateAssistantMessage((message) => applyChatMessageEvent(message, event)),
        );
        return;
      }

      if (event.type === "question") {
        state.setPendingQuestion({
          taskId: event.taskId,
          questionId: event.questionId,
          question: event.question,
          context: event.context,
          input: event.input,
        });
        return;
      }

      if (event.type === "question_answered") {
        if (state.pendingQuestion?.questionId === event.questionId) {
          state.setPendingQuestion(null);
        }
        return;
      }

      if (event.type === "stderr") {
        lastStderrRef.current = event.message;
        return;
      }

      if (event.type === "done") {
        state.updateMessage(
          activeTurn.messageId,
          updateAssistantMessage((message) => applyChatMessageEvent(message, event)),
        );
        state.finishTurn();
        lastStderrRef.current = "";
        void persistMessages();
        return;
      }

      if (event.type === "error") {
        finishWithError(event.message);
        return;
      }

      if (event.type === "exit" && !event.success) {
        finishWithError(lastStderrRef.current || `Agent 任务异常退出：${event.code ?? "unknown"}`);
        lastStderrRef.current = "";
        return;
      }

      if (event.type === "state") {
        const taskState = event.taskState.toLowerCase();
        const workerState = event.workerState.toLowerCase();
        if (taskState === "done") {
          state.updateMessage(
            activeTurn.messageId,
            updateAssistantMessage((message) =>
              applyChatMessageEvent(message, {
                type: "done",
                taskId: activeTurn.taskId,
                text: "",
              }),
            ),
          );
          state.finishTurn();
          lastStderrRef.current = "";
          void persistMessages();
        } else if (taskState === "cancelled" || taskState === "canceled") {
          finishWithError("已停止生成");
        } else if (
          taskState === "failed" ||
          taskState === "error" ||
          workerState === "failed" ||
          workerState === "error" ||
          workerState === "crashed"
        ) {
          finishWithError(lastStderrRef.current || `Agent 任务失败：${event.taskState}/${event.workerState}`);
        }
      }
    },
    [chatStore, enqueueStreamEvent, finishWithError, flushStreamEvents, persistMessages],
  );

  const runTurn = useCallback(
    async (payload: ChatInputSubmitPayload) => {
      const state = chatStore.getState();
      if (state.chatId !== chatId || state.activeTurn) {
        return;
      }

      const taskId = crypto.randomUUID();
      const assistantMessageId = createMessageId();
      const createdAt = Date.now();
      state.addMessages([
        {
          id: createMessageId(),
          role: "user",
          createdAt,
          status: "done",
          blocks: payload.blocks.map((block) => ({ ...block, id: createMessageId() })),
        },
        {
          id: assistantMessageId,
          role: "assistant",
          createdAt: createdAt + 1,
          status: "loading",
          blocks: [],
          agentAvatar: payload.agent?.avatar,
          agentName: payload.agent?.name,
        },
      ]);
      state.startTurn({ taskId, messageId: assistantMessageId });
      lastStderrRef.current = "";
      void persistMessages();

      const prompt = buildAgentPrompt(workspacePath, payload);
      try {
        await agentClient.agent.run({
          taskId,
          workspacePath,
          sessionRootDir: `chats/${chatId}/session`,
          agentRoleId: chatId,
          userMessage: payload.text,
          systemPrompt: prompt.systemPrompt,
          requestContext: prompt.requestContext,
          runtimeInstruction: prompt.runtimeInstruction,
          runtimeModel: payload.model,
          allowedTools: [...new Set(payload.tools)],
          enabledSkills: [...new Set(payload.skills.map((skill) => skill.name))],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "消息发送失败，请重试";
        finishWithError(message);
      }
    },
    [agentClient, chatId, chatStore, finishWithError, persistMessages, workspacePath],
  );

  const stopGenerating = useCallback(async () => {
    const activeTurn = chatStore.getState().activeTurn;
    if (!activeTurn) {
      return;
    }

    try {
      await agentClient.tasks.abort(activeTurn.taskId);
      if (chatStore.getState().activeTurn?.taskId === activeTurn.taskId) {
        finishWithError("已停止生成");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "停止生成失败";
      chatStore.getState().setError(message);
    }
  }, [agentClient, chatStore, finishWithError]);

  const answerQuestion = useCallback(
    async (answer: string) => {
      const question = chatStore.getState().pendingQuestion;
      if (!question) {
        return;
      }

      try {
        await agentClient.tasks.answerQuestion({
          taskId: question.taskId,
          questionId: question.questionId,
          answer,
        });
        if (chatStore.getState().pendingQuestion?.questionId === question.questionId) {
          chatStore.getState().setPendingQuestion(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "回答发送失败，请重试";
        chatStore.getState().setError(message);
      }
    },
    [agentClient, chatStore],
  );

  useEffect(
    () =>
      chatStore.subscribe((state, previousState) => {
        const isRunning = Boolean(state.activeTurn);
        if (isRunning !== Boolean(previousState.activeTurn)) {
          onStatusChange?.({ chatId, isRunning });
        }
      }),
    [chatId, chatStore, onStatusChange],
  );

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    saveQueueRef.current = Promise.resolve();
    chatStore.getState().initialize(chatId);

    const initialize = async () => {
      try {
        unsubscribe = await agentClient.events.subscribe(handleAgentEvent);
        if (disposed) {
          unsubscribe();
          return;
        }

        const savedChat = await loadChat<ChatMessage>(workspacePath, chatId);
        if (disposed) {
          return;
        }

        if (savedChat) {
          chatStore.getState().hydrateMessages(restoreMessages(savedChat.messages));
        }
        chatStore.getState().setInitializing(false);

        if (
          initialRequest &&
          (!savedChat || savedChat.messages.length === 0) &&
          initialRequestChatIdRef.current !== chatId
        ) {
          initialRequestChatIdRef.current = chatId;
          await runTurn(initialRequest);
        }
      } catch (error) {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : "聊天初始化失败，请重试";
        chatStore.getState().setError(message);
        chatStore.getState().setInitializing(false);
      }
    };

    void initialize();

    return () => {
      disposed = true;
      flushStreamEvents();
      unsubscribe?.();
    };
  }, [agentClient, chatId, chatStore, flushStreamEvents, handleAgentEvent, initialRequest, runTurn, workspacePath]);

  return {
    messages: chatState.messages,
    pendingQuestion: chatState.pendingQuestion,
    isInitializing: chatState.isInitializing,
    isRunning: Boolean(chatState.activeTurn),
    error: chatState.error,
    runTurn,
    stopGenerating,
    answerQuestion,
  };
};
