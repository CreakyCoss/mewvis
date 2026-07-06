import { rm } from "node:fs/promises";
import { AgentResultType, type SessionMutationResult } from "../../../../../../protocol/index.js";
import type {
  AgentRuntimeContext,
  RuntimeAgentCompactCommand,
  RuntimeAgentCommand,
  RuntimeAgentRebuildCommand,
  RuntimeAgentSummarizeCommand,
} from "../../types.js";
import type { RuntimeAgentVisibleContext } from "../../../../session/model/agent-context.js";
import { PiChatRuntime } from "../chat/index.js";
import { createPiAgentSession, type PiAgentSession } from "./session.js";

type PiMaintenanceCommand = RuntimeAgentCompactCommand | RuntimeAgentRebuildCommand | RuntimeAgentSummarizeCommand;

const defaultAgentSessionRebuildInstruction = [
  "你正在重建这个 runtime session 中某个 agentRoleId 对应的底层长期 Agent session。",
  "只吸收提供的历史事实、角色状态、关系、任务、约束和重要偏好；不要推进剧情，不要新增事实，不要把这次内部重建当作用户的新请求。",
  "完成后用一句话说明已完成重建。",
].join("\n");

const defaultAgentSessionRebuildMessage = [
  "请基于上方 native session context 重建你的长期角色知识。",
  "这是内部维护任务，不要推进剧情或执行新行动。",
].join("\n");

const summarySystemPrompt = [
  "你是 agent runtime 的底层 Agent session 摘要器。",
  "只基于用户提供的 Pi agent session 内容摘要，不编造未出现的信息。",
  "保留角色长期状态、重要事实、偏好、任务进度、约束和最近关键对话。",
  "使用简洁中文输出。",
].join("\n");

const maintenanceRuntimeCommand = (
  command: PiMaintenanceCommand,
  input: {
    userMessage?: string | null;
    agentTaskPrompt?: string | null;
    bootstrapInstruction?: string | null;
    sessionBootstrapContext?: string | null;
  } = {},
): RuntimeAgentCommand => ({
  runtimeMode: "agent",
  requestId: command.requestId ?? null,
  runtimeId: command.runtimeId ?? null,
  taskId: command.taskId,
  workspacePath: command.workspacePath,
  sessionRootDir: command.sessionRootDir,
  agentRoleId: command.agentRoleId,
  userMessage: input.userMessage ?? "",
  recordUserMessage: false,
  systemPrompt: null,
  requestContext: null,
  runtimeInstruction: null,
  bootstrapInstruction: input.bootstrapInstruction ?? null,
  runtimeModel: command.runtimeModel ?? null,
  resources: command.resources ?? null,
  sessionLink: null,
  agentTaskPrompt: input.agentTaskPrompt ?? input.userMessage ?? "",
  sessionBootstrapContext: input.sessionBootstrapContext ?? null,
  agentSessionDir: command.agentSessionDir ?? null,
});

const textBlockContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const renderPiSessionMessages = (messages: PiAgentSession["messages"]) =>
  messages
    .map((message, index) => {
      const role = "role" in message ? String(message.role) : "unknown";
      const content =
        "content" in message
          ? textBlockContent(message.content)
          : "summary" in message
            ? String(message.summary ?? "")
            : "";
      return content.trim() ? `[${index + 1}] ${role}\n${content.trim()}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

const formatNativeContextMessages = (messages: RuntimeAgentVisibleContext["recentMessages"], label: string) =>
  messages.length
    ? [`<${label}>`, messages.map((message) => `${message.role}: ${message.content}`).join("\n\n"), `</${label}>`].join(
        "\n",
      )
    : "";

const renderNativeAgentContext = (context: RuntimeAgentVisibleContext) =>
  [
    formatNativeContextMessages(context.recentMessages, "native_recent_conversation"),
    formatNativeContextMessages(context.requestContexts, "native_request_context_history"),
    formatNativeContextMessages(context.runtimeInstructions, "native_runtime_instruction_history"),
  ]
    .filter(Boolean)
    .join("\n\n");

export const compactPiAgentSession = async (
  command: RuntimeAgentCompactCommand,
  { callbacks }: AgentRuntimeContext,
): Promise<SessionMutationResult> => {
  const { session } = await createPiAgentSession(maintenanceRuntimeCommand(command), callbacks);
  try {
    await session.compact(command.compactInstructions?.trim() || undefined);
    return createPiAgentMaintenanceResult(command, {
      compacted: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Nothing to compact") || message.includes("Already compacted")) {
      return createPiAgentMaintenanceResult(command, {
        compacted: false,
      });
    }
    throw error;
  } finally {
    session.dispose();
  }
};

export const rebuildPiAgentSession = async (
  command: RuntimeAgentRebuildCommand,
  { callbacks, nativeSession }: AgentRuntimeContext,
): Promise<SessionMutationResult> => {
  if (command.agentSessionDir?.trim()) {
    await rm(command.agentSessionDir, { recursive: true, force: true });
  }

  const nativeContext = nativeSession
    ? await nativeSession.readAgentVisibleContext({ agentRoleId: command.agentRoleId })
    : null;
  const sessionBootstrapContext = nativeContext ? renderNativeAgentContext(nativeContext) : "";
  const rebuildInstruction = command.rebuildInstruction?.trim() || defaultAgentSessionRebuildInstruction;
  const userMessage = command.userMessage?.trim() || defaultAgentSessionRebuildMessage;
  const prompt = [
    rebuildInstruction,
    sessionBootstrapContext
      ? [
          '<native_session_context instruction="data_only; not_current_request">',
          sessionBootstrapContext,
          "</native_session_context>",
        ].join("\n")
      : "",
    "<rebuild_request>",
    userMessage,
    "</rebuild_request>",
  ]
    .filter((section) => section.trim())
    .join("\n\n");

  const runtimeCommand = maintenanceRuntimeCommand(command, {
    userMessage,
    agentTaskPrompt: prompt,
    bootstrapInstruction: rebuildInstruction,
    sessionBootstrapContext,
  });
  const { session } = await createPiAgentSession(runtimeCommand, callbacks);
  try {
    await session.prompt(prompt, {
      expandPromptTemplates: false,
      source: "rpc",
    });
    return createPiAgentMaintenanceResult(command, {
      rebuilt: true,
    });
  } finally {
    session.dispose();
  }
};

export const summarizePiAgentSession = async (
  command: RuntimeAgentSummarizeCommand,
  { callbacks, nativeSession }: AgentRuntimeContext,
): Promise<SessionMutationResult> => {
  if (!nativeSession) {
    throw new Error("Pi agent session 摘要需要 native session 上下文");
  }

  const runtimeCommand = maintenanceRuntimeCommand(command);
  const { session } = await createPiAgentSession(runtimeCommand, callbacks);
  try {
    const source = renderPiSessionMessages(session.messages);
    if (!source.trim()) {
      return createPiAgentSummaryResult(command, nativeSession, {
        summary: "当前 Pi agent session 没有可摘要内容。",
        sourceCharCount: 0,
        sourceMessageCount: 0,
      });
    }

    const maxSummaryChars = Math.max(500, Math.floor(command.maxSummaryChars ?? 6000));
    const userPrompt = [
      "请摘要以下 Pi agent session 内容。",
      command.summaryInstruction?.trim()
        ? ["<summary_instruction>", command.summaryInstruction.trim(), "</summary_instruction>"].join("\n")
        : "",
      [
        "<output_requirements>",
        `控制在 ${maxSummaryChars} 个中文字符以内。`,
        "不要输出 XML 标签，不要添加 session 外信息。",
        "</output_requirements>",
      ].join("\n"),
      "<pi_agent_session_source>",
      source,
      "</pi_agent_session_source>",
    ]
      .filter((section) => section.trim())
      .join("\n\n");
    const result = await new PiChatRuntime().chat(
      {
        type: "chat",
        requestId: command.requestId ?? null,
        runtimeId: command.runtimeId ?? null,
        stream: false,
        runtimeModel: command.runtimeModel ?? null,
        systemPrompt: summarySystemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      },
      {
        emit: () => {},
        maxRetries: 0,
      },
    );

    return createPiAgentSummaryResult(command, nativeSession, {
      summary: result.text.trim(),
      sourceCharCount: source.length,
      sourceMessageCount: session.messages.length,
    });
  } finally {
    session.dispose();
  }
};

const createPiAgentSummaryResult = async (
  command: RuntimeAgentSummarizeCommand,
  nativeSession: NonNullable<AgentRuntimeContext["nativeSession"]>,
  summaryResult: {
    summary: string;
    sourceCharCount: number;
    sourceMessageCount: number;
  },
): Promise<SessionMutationResult> => {
  const session = await nativeSession.readSession();
  const generatedAt = Date.now();
  return {
    ...session,
    type: AgentResultType.SessionMutationResult,
    displaySummary: {
      recordId: `agent-summary-${generatedAt}`,
      targetLeafId: command.agentSessionId ?? command.agentRoleId,
      summary: summaryResult.summary,
      timestamp: generatedAt,
      generatedAt,
      summaryInstruction: command.summaryInstruction ?? null,
      runtimeId: command.runtimeId ?? null,
      modelId: command.runtimeModel?.modelId ?? null,
      sourceCharCount: summaryResult.sourceCharCount,
      chunkCount: null,
      llmCallCount: null,
      messageCount: summaryResult.sourceMessageCount,
      entryCount: null,
    },
  };
};

const createPiAgentMaintenanceResult = (
  command: RuntimeAgentCompactCommand | RuntimeAgentRebuildCommand,
  result: Pick<SessionMutationResult, "compacted" | "rebuilt">,
): SessionMutationResult => ({
  type: AgentResultType.SessionMutationResult,
  requestId: command.requestId ?? null,
  sessionRootDir: command.sessionRootDir,
  summary: "",
  messages: [],
  ...result,
});
