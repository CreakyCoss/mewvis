import { useCallback, useEffect, useRef, useState } from "react";
import { createAgentClient } from "@/agent-client/runtime";
import type { AgentClientAgentEvent } from "@/agent-client/types";
import { loadChatSession, saveChatSession } from "@/api/chat";
import type { ChatInputSubmitPayload } from "../components/chat-input/type";
import { useChatStore } from "./store";
import type { ChatMessage } from "./type";

type StreamEvent = Extract<
  AgentClientAgentEvent,
  { type: "text_delta" | "thinking_delta" | "thinking_end" | "replace_text" }
>;

type UseChatRuntimeInput = {
  chatId: string;
  workspacePath: string;
  initialRequest?: ChatInputSubmitPayload;
};

const createMessageId = () => crypto.randomUUID();

const sessionTitle = (messages: ChatMessage[]) => {
  const firstUserMessage = messages.find((message) => message.role === "user")?.text.trim();
  return firstUserMessage ? firstUserMessage.replace(/\s+/g, " ").slice(0, 36) : "新的聊天";
};

const normalizeLoadedMessages = (messages: ChatMessage[]) =>
  messages.map<ChatMessage>((message) => {
    const didStopUnexpectedly =
      message.role === "assistant" && (message.status === "loading" || message.status === "streaming");

    return {
      ...message,
      id: message.id || createMessageId(),
      createdAt: message.createdAt || Date.now(),
      text: didStopUnexpectedly && !message.text.trim() ? "Agent 任务未正常结束。" : message.text,
      status: didStopUnexpectedly ? "error" : message.status,
    };
  });

const applyStreamEvents = (message: ChatMessage, events: StreamEvent[]) =>
  events.reduce<ChatMessage>((currentMessage, event) => {
    if (event.type === "text_delta") {
      return {
        ...currentMessage,
        text: `${currentMessage.text}${event.delta}`,
        status: "streaming",
      };
    }

    if (event.type === "replace_text") {
      return {
        ...currentMessage,
        text: event.text,
        status: "streaming",
      };
    }

    if (event.type === "thinking_delta") {
      return {
        ...currentMessage,
        thinking: `${currentMessage.thinking ?? ""}${event.delta}`,
        status: "streaming",
      };
    }

    return {
      ...currentMessage,
      thinking: event.content || currentMessage.thinking,
      status: "streaming",
    };
  }, message);

const buildAgentPrompt = (workspacePath: string, payload: ChatInputSubmitPayload) => {
  const selectedAgent = payload.agent
    ? [`当前角色：${payload.agent.name}`, payload.agent.description?.trim()].filter(Boolean).join("\n")
    : "";
  const activeSkills = payload.skills
    .map((skill) => [`### ${skill.name}`, skill.description, skill.content].filter(Boolean).join("\n"))
    .join("\n\n");

  return {
    systemPrompt: [
      "你是 Mewvis 的工作区 AI 助手。",
      `工作区路径：${workspacePath}`,
      "你可以帮助用户规划、写作、分析和修改工作区文件。",
      selectedAgent,
    ]
      .filter(Boolean)
      .join("\n"),
    requestContext: activeSkills ? `[active_skills]\n${activeSkills}\n[/active_skills]` : "",
    runtimeInstruction: "优先完成用户当前请求；需要使用工具时，只使用本次允许的工具。",
  };
};

export const useChatRuntime = ({ chatId, workspacePath, initialRequest }: UseChatRuntimeInput) => {
  const [agentClient] = useState(createAgentClient);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const streamEventsRef = useRef<StreamEvent[]>([]);
  const streamFrameRef = useRef<number | null>(null);
  const lastStderrRef = useRef("");

  const persistMessages = useCallback(() => {
    const state = useChatStore.getState();
    if (state.chatId !== chatId || state.messages.length === 0) {
      return Promise.resolve();
    }

    const messages = state.messages;
    const save = saveQueueRef.current.then(async () => {
      await saveChatSession({
        workspacePath,
        sessionId: chatId,
        title: sessionTitle(messages),
        messages,
      });
    });

    saveQueueRef.current = save.catch((error) => {
      const message = error instanceof Error ? error.message : "聊天记录保存失败";
      useChatStore.getState().setError(`回复已保留在当前页面，但保存失败：${message}`);
    });

    return save;
  }, [chatId, workspacePath]);

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

    const state = useChatStore.getState();
    const messageId = state.activeTurn?.messageId;
    if (messageId) {
      state.updateMessage(messageId, (message) => applyStreamEvents(message, events));
    }
  }, []);

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
      const state = useChatStore.getState();
      const messageId = state.activeTurn?.messageId;
      if (!messageId) {
        return;
      }

      state.updateMessage(messageId, (currentMessage) => ({
        ...currentMessage,
        text: currentMessage.text.trim() || message,
        status: "error",
      }));
      state.setError(message);
      state.finishTurn();
      void persistMessages();
    },
    [flushStreamEvents, persistMessages],
  );

  const handleAgentEvent = useCallback(
    (event: AgentClientAgentEvent) => {
      const state = useChatStore.getState();
      const activeTurn = state.activeTurn;
      if (!activeTurn || (event.taskId && event.taskId !== activeTurn.taskId)) {
        return;
      }

      if (
        event.type === "text_delta" ||
        event.type === "thinking_delta" ||
        event.type === "thinking_end" ||
        event.type === "replace_text"
      ) {
        enqueueStreamEvent(event);
        return;
      }

      flushStreamEvents();

      if (event.type === "started") {
        state.updateMessage(activeTurn.messageId, (message) => ({ ...message, status: "streaming" }));
        return;
      }

      if (event.type === "tool_start") {
        state.updateMessage(activeTurn.messageId, (message) => ({
          ...message,
          status: "streaming",
          toolCalls: [...(message.toolCalls ?? []), { id: createMessageId(), name: event.toolName, status: "running" }],
        }));
        return;
      }

      if (event.type === "tool_end") {
        state.updateMessage(activeTurn.messageId, (message) => {
          const toolCalls = [...(message.toolCalls ?? [])];
          let index = toolCalls.length - 1;
          while (index >= 0 && (toolCalls[index].name !== event.toolName || toolCalls[index].status !== "running")) {
            index -= 1;
          }
          if (index >= 0) {
            toolCalls[index] = {
              ...toolCalls[index],
              status: event.isError ? "error" : "done",
            };
          }
          return { ...message, toolCalls };
        });
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
        state.updateMessage(activeTurn.messageId, (message) => ({
          ...message,
          text: event.text.trim() || message.text.trim() || "Agent 任务已完成。",
          status: "done",
        }));
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
          state.updateMessage(activeTurn.messageId, (message) => ({
            ...message,
            text: message.text.trim() || "Agent 任务已完成。",
            status: "done",
          }));
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
    [enqueueStreamEvent, finishWithError, flushStreamEvents, persistMessages],
  );

  const runTurn = useCallback(
    async (payload: ChatInputSubmitPayload) => {
      const state = useChatStore.getState();
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
          text: payload.text,
          createdAt,
          status: "done",
        },
        {
          id: assistantMessageId,
          role: "assistant",
          text: "",
          createdAt: createdAt + 1,
          status: "loading",
          agentAvatar: payload.agent?.avatar,
          agentName: payload.agent?.name,
          showThinkingProcess: payload.showThinkingProcess,
          showToolCallProcess: payload.showToolCallProcess,
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
    [agentClient, chatId, finishWithError, persistMessages, workspacePath],
  );

  const stopGenerating = useCallback(async () => {
    const activeTurn = useChatStore.getState().activeTurn;
    if (!activeTurn) {
      return;
    }

    try {
      await agentClient.tasks.abort(activeTurn.taskId);
      if (useChatStore.getState().activeTurn?.taskId === activeTurn.taskId) {
        finishWithError("已停止生成");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "停止生成失败";
      useChatStore.getState().setError(message);
    }
  }, [agentClient, finishWithError]);

  const answerQuestion = useCallback(
    async (answer: string) => {
      const question = useChatStore.getState().pendingQuestion;
      if (!question) {
        return;
      }

      try {
        await agentClient.tasks.answerQuestion({
          taskId: question.taskId,
          questionId: question.questionId,
          answer,
        });
        if (useChatStore.getState().pendingQuestion?.questionId === question.questionId) {
          useChatStore.getState().setPendingQuestion(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "回答发送失败，请重试";
        useChatStore.getState().setError(message);
      }
    },
    [agentClient],
  );

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    saveQueueRef.current = Promise.resolve();
    useChatStore.getState().initialize(chatId);

    const initialize = async () => {
      try {
        unsubscribe = await agentClient.events.subscribe(handleAgentEvent);
        if (disposed) {
          unsubscribe();
          return;
        }

        const session = await loadChatSession(workspacePath, chatId);
        if (disposed) {
          return;
        }

        if (session) {
          useChatStore.getState().hydrateMessages(normalizeLoadedMessages(session.messages as ChatMessage[]));
        }
        useChatStore.getState().setInitializing(false);

        if (!session && initialRequest) {
          await runTurn(initialRequest);
        }
      } catch (error) {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : "聊天初始化失败，请重试";
        useChatStore.getState().setError(message);
        useChatStore.getState().setInitializing(false);
      }
    };

    void initialize();

    return () => {
      disposed = true;
      flushStreamEvents();
      unsubscribe?.();
    };
  }, [agentClient, chatId, flushStreamEvents, handleAgentEvent, initialRequest, runTurn, workspacePath]);

  return {
    runTurn,
    stopGenerating,
    answerQuestion,
  };
};
