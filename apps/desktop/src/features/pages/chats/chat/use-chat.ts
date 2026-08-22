import { useCallback, useEffect, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  AgentClientTransportEventType,
  type AgentClientAgentEvent,
  type AgentClientStreamEvent,
} from "@/agent-client/contracts";
import { createAgentClient } from "@/agent-client/runtime";
import { AgentRuntimeEventType, agentRuntimeEvents } from "@/agent-client/wire";
import { loadChat, saveChat as saveChatApi } from "@/api/chat";
import { searchEnabledKnowledge } from "@/api/knowledge";
import type { ChatInputOptions, ChatTurnRequest } from "../components/chat-input/type";
import { buildAgentPrompt } from "./prompt";
import { applyChatMessageEvent, failChatMessage } from "./reducer";
import { useSaveScheduler } from "./save-scheduler";
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
  title: string;
  messages: ChatMessage[];
  options: ChatInputOptions | null;
  activeTurn: ChatActiveTurn | null;
  pendingQuestion: ChatPendingQuestion | null;
  isInitializing: boolean;
  error: string;
  initialize: (chatId: string) => void;
  hydrateMessages: (messages: ChatMessage[]) => void;
  setTitle: (title: string) => void;
  setOptions: (options: ChatInputOptions | null) => void;
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
    title: "",
    messages: [],
    options: null,
    activeTurn: null,
    pendingQuestion: null,
    isInitializing: true,
    error: "",
    initialize: (chatId) =>
      set({
        chatId,
        title: "",
        messages: [],
        options: null,
        activeTurn: null,
        pendingQuestion: null,
        isInitializing: true,
        error: "",
      }),
    hydrateMessages: (messages) => set({ messages }),
    setTitle: (title) => set({ title }),
    setOptions: (options) => set({ options }),
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

type StreamEvent = AgentClientStreamEvent;

type UseChatInput = {
  chatId: string;
  workspacePath: string;
  initialTurn?: ChatTurnRequest;
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

const chatTitle = (messages: ChatMessage[], fallback = "新的聊天") => {
  const firstUserMessage = messages.find((message): message is ChatUserMessage => message.role === "user");
  const text = firstUserMessage ? getUserMessageText(firstUserMessage) : "";
  return text ? text.replace(/\s+/g, " ").slice(0, 36) : fallback;
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

export const useChat = ({ chatId, workspacePath, initialTurn, saveChat, onStatusChange }: UseChatInput) => {
  const [chatStore] = useState(() => createChatStore());
  const chatState = useStore(chatStore);
  const [agentClient] = useState(createAgentClient);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const streamEventsRef = useRef<StreamEvent[]>([]);
  const streamFrameRef = useRef<number | null>(null);
  const lastStderrRef = useRef("");
  const initialTurnChatIdRef = useRef("");

  const persistChat = useCallback(() => {
    const state = chatStore.getState();
    if (state.chatId !== chatId || state.isInitializing || (state.messages.length === 0 && !state.options)) {
      return Promise.resolve();
    }

    const messages = state.messages;
    const options = state.options;
    const save = saveQueueRef.current.then(async () => {
      const input: ChatSaveInput = {
        chatId,
        title: chatTitle(messages, state.title || "新的聊天"),
        messages,
        options,
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

  const { saveImmediately, nodeCompleted, streamChanged, flush } = useSaveScheduler(persistChat);

  const updateOptions = useCallback(
    (options: ChatInputOptions) => {
      const state = chatStore.getState();
      if (state.chatId !== chatId || isEqual(state.options, options)) {
        return;
      }

      state.setOptions(options);
      if (!state.isInitializing) {
        void saveImmediately();
      }
    },
    [chatId, chatStore, saveImmediately],
  );

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
      void saveImmediately();
    },
    [chatStore, flushStreamEvents, saveImmediately],
  );

  const handleAgentEvent = useCallback(
    (envelope: AgentClientAgentEvent) => {
      const state = chatStore.getState();
      const activeTurn = state.activeTurn;
      if (!activeTurn || envelope.taskId !== activeTurn.taskId) {
        return;
      }
      const event = envelope.event;

      if (
        event.type === AgentRuntimeEventType.TextDelta ||
        event.type === AgentRuntimeEventType.ThinkingDelta ||
        event.type === AgentRuntimeEventType.ThinkingEnd ||
        event.type === AgentRuntimeEventType.ReplaceText ||
        event.type === AgentRuntimeEventType.ToolCallDelta
      ) {
        enqueueStreamEvent(event);
        streamChanged();
        if (event.type === AgentRuntimeEventType.ThinkingEnd) {
          nodeCompleted();
        }
        return;
      }

      flushStreamEvents();

      if (event.type === AgentRuntimeEventType.Started) {
        state.updateMessage(
          activeTurn.messageId,
          updateAssistantMessage((message) => ({ ...message, status: "streaming" })),
        );
        return;
      }

      if (
        event.type === AgentRuntimeEventType.ToolCallStart ||
        event.type === AgentRuntimeEventType.ToolCallEnd ||
        event.type === AgentRuntimeEventType.ToolExecutionStart ||
        event.type === AgentRuntimeEventType.ToolExecutionUpdate ||
        event.type === AgentRuntimeEventType.ToolExecutionEnd
      ) {
        state.updateMessage(
          activeTurn.messageId,
          updateAssistantMessage((message) => applyChatMessageEvent(message, event)),
        );
        if (event.type === AgentRuntimeEventType.ToolExecutionEnd) {
          nodeCompleted();
        } else {
          streamChanged();
        }
        return;
      }

      if (event.type === AgentRuntimeEventType.Question) {
        state.setPendingQuestion({
          taskId: event.taskId,
          questionId: event.questionId,
          question: event.question,
          context: event.context,
          input: event.input,
        });
        return;
      }

      if (event.type === AgentRuntimeEventType.QuestionAnswered) {
        if (state.pendingQuestion?.questionId === event.questionId) {
          state.setPendingQuestion(null);
        }
        return;
      }

      if (event.type === AgentClientTransportEventType.Stderr) {
        lastStderrRef.current = event.message;
        return;
      }

      if (event.type === AgentRuntimeEventType.Done) {
        state.updateMessage(
          activeTurn.messageId,
          updateAssistantMessage((message) => applyChatMessageEvent(message, event)),
        );
        state.finishTurn();
        lastStderrRef.current = "";
        void saveImmediately();
        return;
      }

      if (event.type === AgentRuntimeEventType.Error) {
        finishWithError(event.message);
        return;
      }

      if (event.type === AgentClientTransportEventType.Exit && !event.success) {
        finishWithError(lastStderrRef.current || `Agent 任务异常退出：${event.code ?? "unknown"}`);
        lastStderrRef.current = "";
        return;
      }

      if (event.type === AgentClientTransportEventType.State) {
        const taskState = event.taskState.toLowerCase();
        const workerState = event.workerState.toLowerCase();
        if (taskState === "done") {
          state.updateMessage(
            activeTurn.messageId,
            updateAssistantMessage((message) =>
              applyChatMessageEvent(
                message,
                agentRuntimeEvents.done({
                  taskId: activeTurn.taskId,
                  text: "",
                }),
              ),
            ),
          );
          state.finishTurn();
          lastStderrRef.current = "";
          void saveImmediately();
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
    [chatStore, enqueueStreamEvent, finishWithError, flushStreamEvents, saveImmediately, nodeCompleted, streamChanged],
  );

  const runTurn = useCallback(
    async (payload: ChatTurnRequest) => {
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
      void saveImmediately();

      try {
        const knowledgeResult = payload.knowledgeCollections.length
          ? await searchEnabledKnowledge({
              collectionIds: payload.knowledgeCollections.map((collection) => collection.value),
              query: payload.text,
              maxResults: 8,
              minScore: 0,
            }).catch(() => null)
          : null;
        const prompt = buildAgentPrompt(workspacePath, payload, knowledgeResult);
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
          resources: {
            tools: { allowed: [...new Set(payload.tools)] },
            skills: { enabled: [...new Set(payload.skills.map((skill) => skill.name))] },
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "消息发送失败，请重试";
        finishWithError(message);
      }
    },
    [agentClient, chatId, chatStore, finishWithError, saveImmediately, workspacePath],
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

        const savedChat = await loadChat<ChatMessage, ChatInputOptions>(workspacePath, chatId);
        if (disposed) {
          return;
        }

        if (savedChat) {
          chatStore.getState().setTitle(savedChat.title);
          chatStore.getState().hydrateMessages(restoreMessages(savedChat.messages));
          chatStore.getState().setOptions(savedChat.options ?? null);
        }
        chatStore.getState().setInitializing(false);

        if (initialTurn && (!savedChat || savedChat.messages.length === 0) && initialTurnChatIdRef.current !== chatId) {
          initialTurnChatIdRef.current = chatId;
          await runTurn(initialTurn);
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
      void flush();
      unsubscribe?.();
    };
  }, [agentClient, chatId, chatStore, flush, flushStreamEvents, handleAgentEvent, initialTurn, runTurn, workspacePath]);

  return {
    messages: chatState.messages,
    options: chatState.options,
    pendingQuestion: chatState.pendingQuestion,
    isInitializing: chatState.isInitializing,
    isRunning: Boolean(chatState.activeTurn),
    error: chatState.error,
    updateOptions,
    runTurn,
    stopGenerating,
    answerQuestion,
  };
};
