type AgentToolTrace = {
  toolName: string;
  args: unknown;
  status: "running" | "done" | "error";
  result?: unknown;
};

type AgentQuestionTrace = {
  questionId: string;
  question: string;
  context?: string | null;
  answer?: string;
};

export type AgentMemoryTrace = {
  tools: AgentToolTrace[];
  questions: AgentQuestionTrace[];
};

export type AgentRunStatus = "done" | "error";

export type AgentMemoryEvent = {
  type: string;
  toolName?: string;
  args?: unknown;
  status?: string;
  isError?: boolean;
  result?: unknown;
  questionId?: string;
  question?: string;
  context?: string | null;
  answer?: string;
};

const MAX_SUMMARY_CHARS = 6000;
const MAX_DETAIL_CHARS = 420;
const MAX_PATHS = 16;
const MAX_TOOL_DETAILS = 14;

export const createAgentMemoryTrace = (): AgentMemoryTrace => ({
  tools: [],
  questions: [],
});

const stringifyBrief = (value: unknown, maxChars = MAX_DETAIL_CHARS) => {
  if (value === undefined || value === null) {
    return "";
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) {
    return "";
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars)}...`
    : normalized;
};

const collectPathLikeValues = (value: unknown, paths: Set<string>, depth = 0) => {
  if (depth > 4 || value === undefined || value === null || paths.size >= MAX_PATHS) {
    return;
  }

  if (typeof value === "string") {
    const looksLikePath =
      value.includes("/") ||
      /\.(md|markdown|txt|json|ts|tsx|js|jsx|css|html|rs|yaml|yml)$/i.test(value);
    if (looksLikePath && value.length <= 260) {
      paths.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPathLikeValues(item, paths, depth + 1));
    return;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("path") ||
        normalizedKey.includes("file") ||
        normalizedKey.includes("cwd")
      ) {
        collectPathLikeValues(item, paths, depth + 1);
        return;
      }

      if (typeof item === "object") {
        collectPathLikeValues(item, paths, depth + 1);
      }
    });
  }
};

const findRunningTool = (trace: AgentMemoryTrace, toolName: string) => {
  for (let index = trace.tools.length - 1; index >= 0; index -= 1) {
    const tool = trace.tools[index];
    if (tool.toolName === toolName && tool.status === "running") {
      return tool;
    }
  }

  return null;
};

export const recordAgentMemoryEvent = (
  trace: AgentMemoryTrace,
  event: AgentMemoryEvent,
) => {
  if (event.type === "tool_start" && event.toolName) {
    trace.tools.push({
      toolName: event.toolName,
      args: event.args,
      status: "running",
    });
    return;
  }

  if (event.type === "tool_end" && event.toolName) {
    const tool = findRunningTool(trace, event.toolName);
    if (tool) {
      tool.status = event.isError ? "error" : "done";
      tool.result = event.result;
      return;
    }

    trace.tools.push({
      toolName: event.toolName,
      args: undefined,
      status: event.isError ? "error" : "done",
      result: event.result,
    });
    return;
  }

  if (event.type === "question" && event.questionId && event.question) {
    trace.questions.push({
      questionId: event.questionId,
      question: event.question,
      context: event.context,
    });
    return;
  }

  if (event.type === "question_answered" && event.questionId) {
    const question = trace.questions.find((item) => item.questionId === event.questionId);
    if (question) {
      question.answer = event.answer ?? "";
    }
  }
};

export const summarizeAgentMemoryTrace = (trace: AgentMemoryTrace) => {
  const lines: string[] = [];

  if (trace.tools.length > 0) {
    const counts = new Map<string, number>();
    trace.tools.forEach((tool) => {
      counts.set(tool.toolName, (counts.get(tool.toolName) ?? 0) + 1);
    });

    lines.push("工具调用概览：");
    lines.push(
      [...counts.entries()]
        .map(([toolName, count]) => `- ${toolName} x${count}`)
        .join("\n"),
    );

    const paths = new Set<string>();
    trace.tools.forEach((tool) => {
      collectPathLikeValues(tool.args, paths);
      collectPathLikeValues(tool.result, paths);
    });
    if (paths.size > 0) {
      lines.push("");
      lines.push("涉及路径：");
      lines.push([...paths].slice(0, MAX_PATHS).map((path) => `- ${path}`).join("\n"));
    }

    const toolDetails = trace.tools.slice(-MAX_TOOL_DETAILS).map((tool) => {
      const args = stringifyBrief(tool.args);
      const result = tool.status === "error" ? stringifyBrief(tool.result) : "";
      const status = tool.status === "error" ? "失败" : tool.status === "done" ? "完成" : "运行中";
      return [
        `- ${status} ${tool.toolName}`,
        args ? `参数：${args}` : "",
        result ? `错误/结果：${result}` : "",
      ].filter(Boolean).join("；");
    });
    if (toolDetails.length > 0) {
      lines.push("");
      lines.push("最近工具细节：");
      lines.push(toolDetails.join("\n"));
    }
  }

  const answeredQuestions = trace.questions.filter((question) => question.answer);
  if (answeredQuestions.length > 0) {
    lines.push("");
    lines.push("用户确认/补充：");
    lines.push(
      answeredQuestions
        .map((question) => {
          const context = question.context ? `（上下文：${stringifyBrief(question.context, 220)}）` : "";
          return `- 问：${question.question}${context}\n  答：${question.answer}`;
        })
        .join("\n"),
    );
  }

  const summary = lines.join("\n").trim();
  return summary.length > MAX_SUMMARY_CHARS
    ? `${summary.slice(0, MAX_SUMMARY_CHARS)}...`
    : summary;
};

export const buildAgentExecutionSummary = (
  trace: AgentMemoryTrace,
  status: AgentRunStatus = "done",
  statusMessage?: string,
) => {
  const summary = summarizeAgentMemoryTrace(trace);
  const statusLine = status === "error"
    ? `执行状态：失败${statusMessage ? `（${stringifyBrief(statusMessage, 220)}）` : ""}`
    : "执行状态：完成";

  return [statusLine, summary].filter(Boolean).join("\n\n");
};

export const buildAgentConversationContent = (
  assistantText: string,
) => {
  return assistantText.trim();
};

export const extractAgentExecutionSummary = (
  message: { content: string; metadata?: { agentExecutionSummary?: string } | null } | string,
) => {
  if (typeof message !== "string" && message.metadata?.agentExecutionSummary) {
    return message.metadata.agentExecutionSummary.trim();
  }

  const content = typeof message === "string" ? message : message.content;
  const match = content.match(/<agent_execution_summary>\n([\s\S]*?)\n<\/agent_execution_summary>/);
  return match?.[1]?.trim() ?? "";
};
