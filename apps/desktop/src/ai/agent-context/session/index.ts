import {
  normalizeConversationMessages,
} from "../core/conversation";
import {
  getContextEngine,
} from "../engine/registry";
import {
  buildSystemPrompt as buildAgentContextSystemPrompt,
} from "../prompt/prompts";
import type {
  ChatContextSummary,
  ConversationMessage,
  ConversationSummarizer,
} from "../protocol/context";
import type {
  PromptContextFile,
  PromptFileReference,
  PromptKnowledgeReference,
} from "../protocol/prompt";
import type {
  AgentContextPromptExecutorInput,
  AgentContextPromptSystemPromptBuilderInput,
  AgentContextRuntimeInput,
  AgentContextSession,
  AgentContextSessionFileDescriptor,
  AgentContextSessionPromptInput,
  AgentContextSessionPromptResult,
  AgentContextSessionSetInput,
  AgentContextSessionTraceStep,
  AgentContextSessionTraceTurn,
  CreateAgentContextSessionInput,
} from "../protocol/session";
import {
  createAgentContextSessionStateManager,
} from "./manager";

type ResolvedPromptFile = PromptContextFile;

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const hasStringContent = (
  file: AgentContextSessionFileDescriptor | PromptFileReference,
): file is PromptFileReference => typeof file.content === "string";

const findLastAssistantMessage = (
  messages: ConversationMessage[],
): ConversationMessage | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }

  return null;
};

const formatTraceMessages = (messages: ConversationMessage[]) =>
  messages
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");

const formatTraceKnowledgeMatches = (matches: PromptKnowledgeReference[]) =>
  matches.length
    ? matches.map((match, index) => {
      const title = match.title || match.path || match.id;
      const score = match.score == null ? "" : `score=${match.score.toFixed(3)}`;
      const chunk = match.chunkId ? `chunk=${match.chunkId}` : "";
      return [
        `[K${index + 1}] ${title}`,
        [score, chunk].filter(Boolean).join(" · "),
        match.content,
      ].filter(Boolean).join("\n");
    }).join("\n\n---\n\n")
    : "（空）";

const traceStep = (
  input: Omit<AgentContextSessionTraceStep, "id" | "startedAt"> & {
    id?: string;
    startedAt?: number;
  },
): AgentContextSessionTraceStep => {
  const now = Date.now();
  const startedAt = input.startedAt ?? now;
  const endedAt = input.endedAt === undefined
    ? input.status === "done" || input.status === "error" ? now : null
    : input.endedAt;
  const durationMs = input.durationMs === undefined
    ? endedAt ? Math.max(0, endedAt - startedAt) : null
    : input.durationMs;

  return {
    id: input.id ?? crypto.randomUUID(),
    type: input.type,
    label: input.label,
    startedAt,
    endedAt,
    durationMs,
    status: input.status,
    content: input.content,
    metadata: input.metadata,
    payloads: input.payloads,
  };
};

const appendTraceStep = (
  turn: AgentContextSessionTraceTurn,
  input: Parameters<typeof traceStep>[0],
) => {
  const step = traceStep(input);
  const updatedAt = step.endedAt ?? step.startedAt;
  turn.steps.push(step);
  turn.updatedAt = Math.max(turn.updatedAt, updatedAt);
  if (step.status === "error") {
    turn.status = "error";
  }
};

const normalizeLoadedFile = (
  descriptor: AgentContextSessionFileDescriptor,
  loaded: Awaited<ReturnType<NonNullable<CreateAgentContextSessionInput["loadFile"]>>>,
): ResolvedPromptFile | null => {
  if (typeof loaded === "string") {
    return {
      path: descriptor.path,
      content: loaded,
      updatedAt: descriptor.updatedAt ?? null,
    };
  }
  if (isObject(loaded) && typeof loaded.content === "string") {
    const loadedFile = loaded as Record<string, unknown>;
    return {
      path: typeof loadedFile.path === "string" && loadedFile.path.trim()
        ? loadedFile.path
        : descriptor.path,
      content: loadedFile.content as string,
      updatedAt: typeof loadedFile.updatedAt === "number"
        ? loadedFile.updatedAt
        : descriptor.updatedAt ?? null,
    };
  }

  return null;
};

export const createAgentContextSession = (
  initialInput: CreateAgentContextSessionInput = {},
): AgentContextSession => {
  const {
    state: initialState,
    manager: legacyInitialState,
    chatId: initialChatId,
    conversation: initialConversation,
    trace: initialTrace,
    loadFile: initialLoadFile,
    searchKnowledge: initialSearchKnowledge,
    buildSystemPrompt: initialBuildSystemPrompt,
    runPrompt: initialRunPrompt,
    ...stateInput
  } = initialInput;
  const manager = initialState ??
    legacyInitialState ??
    createAgentContextSessionStateManager(stateInput);

  let chatId = initialChatId ?? null;
  let conversation: ConversationMessage[] =
    normalizeConversationMessages(initialConversation ?? []);
  let trace = [...(initialTrace ?? [])];
  let lastPrompt: AgentContextSessionPromptResult | null = null;
  let loadFile = initialLoadFile;
  let searchKnowledge = initialSearchKnowledge;
  let buildSystemPrompt = initialBuildSystemPrompt;
  let runPrompt = initialRunPrompt;

  const engine = () => getContextEngine(manager.get().engineId);
  const engineFor = (nextEngineId?: string | null) =>
    getContextEngine(nextEngineId === undefined ? manager.get().engineId : nextEngineId);
  const selection = (input: AgentContextRuntimeInput = {}) => {
    const current = manager.get();
    return {
      modelContext: input.modelContext ?? current.modelContext,
      summarizer: input.summarizer ?? current.summarizer,
      canUseModel: input.canUseModel ?? current.canUseModel,
    };
  };
  const currentContext = () => manager.getContext();
  const applyContext = (nextContext: ChatContextSummary | null) =>
    manager.setContext(nextContext);
  const setSummarizer = (
    summarizer: ConversationSummarizer | null | undefined,
  ) => manager.set({
    summarizer: summarizer ?? null,
  });
  const applyRuntimeInput = (input: AgentContextRuntimeInput = {}) => {
    const patch: AgentContextSessionSetInput = {};
    if ("engineId" in input) {
      patch.engineId = input.engineId ?? null;
    }
    if ("modelContext" in input) {
      patch.modelContext = input.modelContext ?? null;
    }
    if ("summarizer" in input) {
      patch.summarizer = input.summarizer ?? null;
    }
    if ("canUseModel" in input) {
      patch.canUseModel = input.canUseModel ?? false;
    }
    if (Object.keys(patch).length > 0) {
      manager.set(patch);
    }
  };
  const applyAdapterInput = (
    input: Pick<
      CreateAgentContextSessionInput,
      "loadFile" | "searchKnowledge" | "buildSystemPrompt" | "runPrompt"
    > = {},
  ) => {
    if ("loadFile" in input) {
      loadFile = input.loadFile;
    }
    if ("searchKnowledge" in input) {
      searchKnowledge = input.searchKnowledge;
    }
    if ("buildSystemPrompt" in input) {
      buildSystemPrompt = input.buildSystemPrompt;
    }
    if ("runPrompt" in input) {
      runPrompt = input.runPrompt;
    }
  };
  const resolveFile = async (
    descriptor: AgentContextSessionFileDescriptor | PromptFileReference,
    fileLoader: CreateAgentContextSessionInput["loadFile"] = loadFile,
  ): Promise<ResolvedPromptFile> => {
    if (hasStringContent(descriptor)) {
      return {
        path: descriptor.path,
        content: descriptor.content,
        updatedAt: "updatedAt" in descriptor && typeof descriptor.updatedAt === "number"
          ? descriptor.updatedAt
        : null,
      };
    }
    const loaded = fileLoader
      ? normalizeLoadedFile(descriptor, await fileLoader(descriptor))
      : null;
    if (!loaded) {
      throw new Error(`无法加载上下文文件：${descriptor.path}`);
    }

    return loaded;
  };
  const resolveReferences = async (
    references: AgentContextSessionPromptInput["references"],
    fileLoader?: CreateAgentContextSessionInput["loadFile"],
  ) => Promise.all((references ?? []).map(async (file) => {
    const resolved = await resolveFile(file, fileLoader);
    return {
      path: resolved.path,
      content: resolved.content,
    };
  }));
  const resolveActiveFile = async (
    activeFile: AgentContextSessionPromptInput["activeFile"],
    fileLoader?: CreateAgentContextSessionInput["loadFile"],
  ): Promise<PromptContextFile | null> => {
    if (!activeFile) {
      return null;
    }

    const resolved = await resolveFile(activeFile, fileLoader);
    return {
      path: resolved.path,
      content: resolved.content,
      updatedAt: resolved.updatedAt,
    };
  };
  const buildDefaultSystemPrompt = (
    input: AgentContextPromptSystemPromptBuilderInput,
  ) => buildAgentContextSystemPrompt(input);

  const session: AgentContextSession = {
    set(input) {
      if ("chatId" in input) {
        chatId = input.chatId ?? null;
      }
      applyAdapterInput(input);
      manager.set(input);
    },
    get() {
      return manager.getContext();
    },
    snapshot() {
      return {
        ...manager.get(),
        chatId,
        conversation: [...conversation],
        trace: [...trace],
        lastPrompt,
      };
    },
    getConversation() {
      return [...conversation];
    },
    setConversation(nextConversation) {
      conversation = normalizeConversationMessages(nextConversation);
      return [...conversation];
    },
    getTrace() {
      return [...trace];
    },
    getLastPrompt() {
      return lastPrompt;
    },
    getDebugSnapshot() {
      return lastPrompt?.debugSnapshot ?? null;
    },
    getSummary() {
      return manager.getSummary();
    },
    getActiveAgentRuntimeSessionId(agentId) {
      return engine().getActiveAgentRuntimeSessionId(currentContext(), agentId);
    },
    getContextLimits(input = {}) {
      return engineFor(input.engineId).createPlan(selection(input)).limits;
    },
    async loadResources(input) {
      const [references, activeFile] = await Promise.all([
        resolveReferences(input.references, input.loadFile),
        resolveActiveFile(input.activeFile, input.loadFile),
      ]);
      return {
        activeFile,
        references,
      };
    },
    async prepareAgentTurn(input) {
      const agentConversation = normalizeConversationMessages(
        input.agentConversation ?? input.conversation ?? conversation,
      );
      const preparedPrompt = await session.prompt({
        ...input,
        conversation: agentConversation,
        execute: false,
        appendAssistantMessage: false,
        systemPrompt: input.systemPrompt ?? "",
      });
      const agentContext = "agentContext" in input
        ? input.agentContext ?? null
        : preparedPrompt.previousContext;
      const limits = input.limits ?? preparedPrompt.limits;
      const sessionPlan = engine().planAgentRun({
        chatSessionId: input.chatSessionId,
        sessionRoot: input.agentSessionRoot,
        conversation: agentConversation,
        currentContext: agentContext,
        agentId: input.agentId,
        tokenBudget: input.tokenBudget ?? limits.recentHistoryTokens,
        isHistoryInvalidated: input.isHistoryInvalidated,
      });
      const agentSessionStatus = input.loadAgentSessionStatus
        ? await input.loadAgentSessionStatus(sessionPlan.agentSessionId)
        : null;
      const payload = engine().buildAgentPromptPayload({
        conversation: agentConversation,
        currentContext: agentContext,
        sessionPlan,
        agentSessionStatus,
        text: input.text,
        references: preparedPrompt.references,
        knowledgeMatches: preparedPrompt.knowledgeMatches,
        agentInstructions: input.agentInstructions,
        selectedAgent: input.selectedAgent,
        limits,
      });

      return {
        agentSessionId: sessionPlan.agentSessionId,
        ...payload,
        preparedPrompt,
        agentSessionStatus,
      };
    },
    async prompt(input) {
      if ("chatId" in input) {
        chatId = input.chatId ?? null;
      }
      applyRuntimeInput(input);
      const now = input.now ?? Date.now();
      const baseConversation: ConversationMessage[] = input.conversation
        ? normalizeConversationMessages(input.conversation)
        : conversation;
      const userMessage: ConversationMessage = {
        id: input.id ?? createId("user"),
        role: "user",
        content: input.text,
        timestamp: now,
        metadata: null,
      };
      const nextConversation = [...baseConversation, userMessage];
      conversation = nextConversation;

      const assistantMessageId = input.assistantMessageId ?? createId("assistant");
      const turn: AgentContextSessionTraceTurn = {
        id: `${now}-${assistantMessageId}`,
        status: "running",
        createdAt: now,
        updatedAt: now,
        chatId,
        userMessageId: userMessage.id,
        assistantMessageId,
        userText: input.text,
        referencedFilePaths: (input.references ?? []).map((file) => file.path),
        activeFilePath: input.activeFile?.path ?? null,
        engineId: manager.get().engineId,
        contextWindow: selection(input).modelContext?.contextWindow ?? null,
        conversationSummary: currentContext()?.summary ?? "",
        steps: [],
      };
      trace = [...trace, turn];
      appendTraceStep(turn, {
        type: "input",
        label: "用户输入",
        status: "done",
        content: input.text,
        metadata: {
          chatId,
          referencedFilePaths: turn.referencedFilePaths,
          activeFilePath: turn.activeFilePath,
        },
      });

      try {
        const fileStartedAt = Date.now();
        const [references, activeFile] = await Promise.all([
          resolveReferences(input.references, input.loadFile),
          resolveActiveFile(input.activeFile, input.loadFile),
        ]);
        appendTraceStep(turn, {
          type: "file",
          label: "上下文文件",
          startedAt: fileStartedAt,
          endedAt: Date.now(),
          status: "done",
          content: references.map((file) => file.path).join("\n") || "（空）",
          metadata: {
            referenceCount: references.length,
            activeFilePath: activeFile?.path ?? null,
          },
        });

        const previousContext = currentContext();
        const prepareStartedAt = Date.now();
        const prepared = await session.prepareConversation({
          conversation: nextConversation,
          forceSummarize: input.forceSummarize,
          rebuildSummary: input.rebuildSummary,
        });
        appendTraceStep(turn, {
          type: "context",
          label: "上下文准备",
          startedAt: prepareStartedAt,
          endedAt: Date.now(),
          status: "done",
          content: prepared.conversationSummary || "（空）",
          metadata: {
            engineId: manager.get().engineId,
            runtimeMessageCount: prepared.runtimeMessages.length,
            recentHistoryTokens: prepared.limits.recentHistoryTokens,
          },
        });

        const contextQuery = input.contextQuery ?? input.text;
        const ragStartedAt = Date.now();
        const knowledgeSearch = input.searchKnowledge ?? searchKnowledge;
        const knowledgeMatches = input.knowledgeMatches ??
          await knowledgeSearch?.({
            chatId,
            query: contextQuery,
            conversation: nextConversation,
            references,
            activeFile,
          }) ??
          [];
        appendTraceStep(turn, {
          type: "rag",
          label: "知识检索",
          startedAt: ragStartedAt,
          endedAt: Date.now(),
          status: "done",
          content: knowledgeMatches
            .map((match) => match.title || match.path || match.id)
            .join("\n") || "（空）",
          metadata: {
            enabled: Boolean(knowledgeSearch) || Boolean(input.knowledgeMatches),
            matchCount: knowledgeMatches.length,
          },
        });

        const builderInput: AgentContextPromptSystemPromptBuilderInput = {
          chatId,
          text: input.text,
          conversation: nextConversation,
          context: prepared.context,
          limits: prepared.limits,
          runtimeMessages: prepared.runtimeMessages,
          conversationSummary: prepared.conversationSummary,
          activeFile,
          references,
          activeSkills: input.activeSkills ?? [],
          selectedAgent: input.selectedAgent ?? null,
          knowledgeMatches,
          contextQuery,
          executionMemorySummary: input.executionMemorySummary ?? "",
        };
        const systemPrompt = input.systemPrompt ??
          await (input.buildSystemPrompt ?? buildSystemPrompt ?? (
            (builder) => buildDefaultSystemPrompt(builder)
          ))(builderInput);
        const debugSnapshot = {
          id: turn.id,
          turnId: turn.id,
          chatId,
          updatedAt: Date.now(),
          engineId: turn.engineId ?? null,
          contextWindow: turn.contextWindow ?? null,
          activeFilePath: activeFile?.path ?? null,
          referencedFilePaths: references.map((file) => file.path),
          activeSkillNames: builderInput.activeSkills.map((skill) => skill.name),
          selectedAgentId: builderInput.selectedAgent?.id ?? null,
          selectedAgentName: builderInput.selectedAgent?.name ?? null,
          conversationSummary: builderInput.conversationSummary,
          runtimeMessages: builderInput.runtimeMessages,
          knowledgeMatches,
          systemPrompt,
          payloads: [
            {
              label: "retrieved knowledge",
              sourceLabel: "RAG",
              sourceDescription: "agent-context 知识检索结果",
              content: formatTraceKnowledgeMatches(knowledgeMatches),
            },
            {
              label: "systemPrompt",
              content: systemPrompt,
            },
            {
              label: "runtime messages",
              content: formatTraceMessages(prepared.runtimeMessages),
            },
          ],
        };
        appendTraceStep(turn, {
          type: "request",
          label: "Prompt 准备",
          status: "done",
          content: systemPrompt,
          metadata: {
            runtimeMessageCount: prepared.runtimeMessages.length,
            systemPromptLength: systemPrompt.length,
          },
          payloads: [
            {
              label: "runtime messages",
              content: formatTraceMessages(prepared.runtimeMessages),
            },
          ],
        });

        const shouldExecute = input.execute ?? true;
        const executor = input.runPrompt ?? runPrompt;
        if (shouldExecute && !executor) {
          throw new Error("session.prompt 需要在 createSessionManager 或 prompt 调用中提供 runPrompt。");
        }

        const executorInput: AgentContextPromptExecutorInput = {
          ...builderInput,
          turnId: turn.id,
          systemPrompt,
          traceTurn: turn,
          debugSnapshot,
        };
        const requestStartedAt = Date.now();
        const executorResult = shouldExecute
          ? await executor?.(executorInput)
          : {
            text: "",
          };
        const text = executorResult?.text ?? "";
        appendTraceStep(turn, {
          type: "response",
          label: shouldExecute ? "Prompt 响应" : "Prompt 预览",
          startedAt: requestStartedAt,
          endedAt: Date.now(),
          status: "done",
          content: text || "（空）",
          metadata: {
            executed: shouldExecute,
            textLength: text.length,
            thinkingLength: executorResult?.thinking?.length ?? 0,
          },
          payloads: executorResult?.thinking?.trim()
            ? [{ label: "thinking", content: executorResult.thinking.trim() }]
            : undefined,
        });

        const assistantMessages: ConversationMessage[] = executorResult?.assistantMessages
          ? normalizeConversationMessages(executorResult.assistantMessages)
          : [];
        const shouldAppendAssistant = input.appendAssistantMessage ?? shouldExecute;
        const assistantMessage = findLastAssistantMessage(assistantMessages) ??
          (shouldAppendAssistant
            ? {
              id: assistantMessageId,
              role: "assistant" as const,
              content: text,
              timestamp: Date.now(),
              metadata: null,
            }
            : null);
        const finalConversation = assistantMessages.length > 0
          ? [...nextConversation, ...assistantMessages]
          : assistantMessage
            ? [...nextConversation, assistantMessage]
            : nextConversation;
        conversation = finalConversation;

        const finalizeStartedAt = Date.now();
        const finalContext = shouldExecute
          ? await session.finalizeChatTurn({
            conversation: finalConversation,
            forceSummarize: input.forceSummarize,
            rebuildSummary: input.rebuildSummary,
          })
          : prepared.context;
        appendTraceStep(turn, {
          type: "context",
          label: "上下文回写",
          startedAt: finalizeStartedAt,
          endedAt: Date.now(),
          status: "done",
          content: finalContext?.summary ?? "（空）",
          metadata: {
            conversationLength: finalConversation.length,
            executed: shouldExecute,
          },
        });

        turn.status = "done";
        turn.updatedAt = Date.now();
        turn.conversationSummary = finalContext?.summary ?? prepared.conversationSummary;

        lastPrompt = {
          turnId: turn.id,
          userMessage,
          assistantMessage,
          text,
          thinking: executorResult?.thinking ?? null,
          systemPrompt,
          limits: prepared.limits,
          context: finalContext,
          previousContext,
          runtimeMessages: prepared.runtimeMessages,
          conversation: finalConversation,
          conversationSummary: finalContext?.summary ?? prepared.conversationSummary,
          references,
          activeFile,
          knowledgeMatches,
          traceTurn: turn,
          debugSnapshot: {
            ...debugSnapshot,
            updatedAt: Date.now(),
            conversationSummary: finalContext?.summary ?? prepared.conversationSummary,
          },
        };
        return lastPrompt;
      } catch (caught) {
        appendTraceStep(turn, {
          type: "error",
          label: "Prompt 失败",
          status: "error",
          content: String(caught),
        });
        turn.status = "error";
        turn.updatedAt = Date.now();
        throw caught;
      }
    },
    async prepareConversation(input) {
      const prepared = await engine().prepareConversation({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      });
      setSummarizer(prepared.summarizer);
      applyContext(prepared.context);
      return {
        limits: prepared.limits,
        context: prepared.context,
        runtimeMessages: prepared.runtimeMessages,
        conversationSummary: prepared.conversationSummary,
      };
    },
    async compressConversation(input) {
      return applyContext(await engine().compressConversation({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      }));
    },
    async rebuildAfterHistoryChange(input) {
      return applyContext(await engine().rebuildAfterHistoryChange({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
      }));
    },
    invalidateAfterHistoryChange(input) {
      const nextContext = engine().invalidateAfterHistoryChange(currentContext(), input.conversation);
      applyContext(nextContext);
      return nextContext;
    },
    selectRecentConversation(input) {
      return engine().selectConversationMessages(
        input.conversation,
        currentContext(),
        input.limits,
      );
    },
    async finalizeChatTurn(input) {
      return applyContext(await engine().finalizeChatTurn({
        ...selection(),
        conversation: input.conversation,
        currentContext: currentContext(),
        forceSummarize: input.forceSummarize,
        rebuildSummary: input.rebuildSummary,
      }));
    },
    async finalizeAgentRun(input) {
      return applyContext(await engine().finalizeAgentRun({
        ...input,
        conversation: input.conversation,
        currentContext: currentContext(),
        summarizer: manager.get().summarizer,
      }));
    },
  };

  return session;
};
