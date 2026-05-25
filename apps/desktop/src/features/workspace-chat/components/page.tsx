import type { FormEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Columns3,
  Eye,
  FileText,
  FileType,
  Folder,
  Link,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
} from "lucide-react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import {
  AGENT_TOOL_DEFINITIONS,
  DEFAULT_ALLOWED_AGENT_TOOLS,
  normalizeAllowedAgentTools,
} from "@/agent-runtime/contract";
import {
  toCodingAgentModelConfig,
  toCodingAgentProviderConfig,
} from "@/agent-runtime/config";
import type { AgentToolName, CodingAgentEvent, CodingAgentQuestionInput } from "@/agent-runtime/base";
import { createAgentRuntimeAdapter } from "@/agent-runtime/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { getLlmSettings } from "@/features/llm-settings/api";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import { findDefaultProvider } from "@/features/llm-settings/utils";
import { getAiAgentSettings } from "@/features/agent-settings/api";
import type { AgentProfile, AiAgent } from "@/features/agent-settings/types";
import { resolveAgentProfiles } from "@/features/agent-settings/utils";
import { getWorkspaceSkills, saveWorkspaceSkills } from "@/features/workspace-skills/api";
import { SkillsDialog } from "@/features/workspace-skills/components/skills-dialog";
import type { WorkspaceSkill } from "@/features/workspace-skills/types";
import type { Workspace } from "@/features/workspaces/types";
import {
  chatWithLlm,
  deleteChatSession,
  listWorkspaceFiles,
  listChatSessions,
  loadChatSession,
  readWorkspaceFile,
  saveChatSession,
  writeWorkspaceFile,
} from "../api";
import { MarkdownContent } from "./markdown-content";
import type {
  ChatMessage,
  ChatSessionMeta,
  ConversationMessage,
  WorkspaceFile,
  WorkspaceFileEntry,
} from "../types";

type WorkspaceChatPageProps = {
  workspace: Workspace;
  onBack: () => void;
};

type WorkspaceView = "chat" | "file" | "split";
type ModelSource = "direct" | "agent";
type ChatMode = "chat" | "agent" | "collab";
type CollaborationPhase = "idle" | "drafting" | "reviewing" | "revising";

type FileReferenceMatch = {
  token: string;
  matches: WorkspaceFileEntry[];
};

type ResolvedFileReference = {
  path: string;
  content: string;
};

type PendingAgentQuestion = {
  taskId: string;
  questionId: string;
  question: string;
  context?: string | null;
  input?: CodingAgentQuestionInput;
};

type ActiveReferenceToken = {
  start: number;
  end: number;
  query: string;
};

type ComposerSubmitInput = {
  text: string;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: FileReferenceMatch[];
  ambiguousFileReferences: FileReferenceMatch[];
};

type ChatComposerProps = {
  files: WorkspaceFileEntry[];
  resetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  chatMode: ChatMode;
  modelSource: ModelSource;
  agentProfiles: AgentProfile[];
  providers: LlmProvider[];
  selectedProvider: LlmProvider | null;
  selectedProviderId: string;
  selectedModels: ProviderModel[];
  selectedModel: ProviderModel | null;
  selectedAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  onChatModeChange: (mode: ChatMode) => void;
  onModelSourceChange: (source: ModelSource) => void;
  onSelectedAgentChange: (agentId: string) => void;
  onReviewerAgentChange: (agentId: string) => void;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onSubmit: (input: ComposerSubmitInput) => void;
};

type CollaborationStatusPanelProps = {
  writerAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  phase: CollaborationPhase;
};

const createMessageId = () => crypto.randomUUID();

const DEFAULT_SESSION_TITLE = "新的聊天";

const isMarkdownPath = (path: string) => /\.(md|markdown|mdown)$/i.test(path);

const formatSessionTime = (timestamp: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const deriveSessionTitle = (messages: ChatMessage[]) => {
  const firstUserText = messages.find((message) => message.role === "user")?.text.trim();

  if (!firstUserText) {
    return DEFAULT_SESSION_TITLE;
  }

  return firstUserText.replace(/\s+/g, " ").slice(0, 36);
};

const quoteReferencePath = (path: string) =>
  /[\s，。；,;]/.test(path) ? `@"${path}"` : `@${path}`;

const getActiveReferenceToken = (
  text: string,
  cursor: number,
): ActiveReferenceToken | null => {
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");

  if (atIndex < 0) {
    return null;
  }

  const tokenPrefix = beforeCursor.slice(atIndex + 1);
  if (/[\s，。；,;]/.test(tokenPrefix)) {
    return null;
  }

  const previousChar = atIndex > 0 ? text[atIndex - 1] : "";
  if (previousChar && !/[\s([{，。；,;]/.test(previousChar)) {
    return null;
  }

  const afterCursor = text.slice(cursor);
  const suffixMatch = afterCursor.match(/^[^\s，。；,;]*/);
  const suffix = suffixMatch?.[0] ?? "";

  return {
    start: atIndex,
    end: cursor + suffix.length,
    query: `${tokenPrefix}${suffix}`.trim(),
  };
};

const extractFileReferenceTokens = (text: string) => {
  const tokens = new Set<string>();
  const matcher = /@(?:"([^"]+)"|'([^']+)'|([^\s，。；；,;]+))/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text))) {
    const token = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (token) {
      tokens.add(token);
    }
  }

  return [...tokens];
};

const resolveFileReferenceMatches = (
  text: string,
  files: WorkspaceFileEntry[],
): FileReferenceMatch[] => {
  const selectable = files.filter((file) => !file.isDirectory);

  return extractFileReferenceTokens(text).map((token) => {
    const normalizedToken = token.toLowerCase();
    const exactMatches = selectable.filter((file) => {
      const path = file.path.toLowerCase();
      const name = file.name.toLowerCase();
      return path === normalizedToken || name === normalizedToken;
    });

    if (exactMatches.length > 0) {
      return { token, matches: exactMatches };
    }

    return {
      token,
      matches: selectable.filter((file) => {
        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        return path.includes(normalizedToken) || name.includes(normalizedToken);
      }),
    };
  });
};

const summarizeReferenceMatches = (matches: FileReferenceMatch[]) => {
  const resolved = matches.flatMap((match) =>
    match.matches.length === 1 ? [match.matches[0]] : [],
  );

  const uniquePaths = new Set<string>();
  return resolved.filter((file) => {
    if (uniquePaths.has(file.path)) {
      return false;
    }
    uniquePaths.add(file.path);
    return true;
  });
};

const appendReferencesToPrompt = (
  text: string,
  references: ResolvedFileReference[],
) => {
  if (references.length === 0) {
    return text;
  }

  return [
    text,
    "",
    "用户在消息中引用了以下文件，请优先使用这些文件作为上下文：",
    references
      .map((file) => [
        `## ${file.path}`,
        "```",
        file.content.slice(0, 20000),
        "```",
      ].join("\n"))
      .join("\n\n"),
  ].join("\n");
};

const buildAgentPrompt = (
  text: string,
  references: ResolvedFileReference[],
  history: ConversationMessage[],
  selectedAgent: AgentProfile | null,
) => {
  const recentHistory = history.slice(-8);
  const historyContext = recentHistory.length
    ? [
      "以下是最近对话历史。用户当前输入可能是在回答助手上一轮提出的问题，请结合历史理解：",
      recentHistory
        .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
        .join("\n\n"),
      "",
    ].join("\n")
    : "";
  const agentContext = selectedAgent
    ? [
        `当前使用 Agent：${selectedAgent.name}`,
        selectedAgent.description ? `Agent 描述：${selectedAgent.description}` : "",
        "请优先保持这个 Agent 的角色定位、语气和工作方式。",
        "",
      ].filter(Boolean).join("\n")
    : "";
  const interactionInstructions = [
    "交互规则：",
    "- 当继续执行前缺少必要信息、需要用户选择方向、需要确认方案，或存在多个合理选项时，必须调用 ask_user 工具询问用户，不要只在正文里提问。",
    "- 如果问题是开放式回答，调用 ask_user 时使用 input.type = \"text\"。",
    "- 如果问题有明确候选项，调用 ask_user 时使用 input.type = \"select\"，并提供至少两个 options；可以加入 { value: \"other\", label: \"请输入\" } 让用户自定义。",
    "- 调用 ask_user 后，等待用户回答，再基于回答继续原任务。",
    "",
  ].join("\n");

  return appendReferencesToPrompt(
    `${agentContext}${interactionInstructions}${historyContext}当前用户输入：\n${text}`,
    references,
  );
};

const stringifyBrief = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);

  if (!text) {
    return "";
  }

  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
};

const describeAgentEvent = (event: CodingAgentEvent) => {
  if (event.type === "started") {
    return "Agent 已启动";
  }

  if (event.type === "tool_start") {
    return `调用工具 ${event.toolName}: ${stringifyBrief(event.args)}`;
  }

  if (event.type === "question") {
    return `等待用户回答：${event.question}`;
  }

  if (event.type === "question_answered") {
    return `用户已回答：${event.answer}`;
  }

  if (event.type === "tool_update") {
    return `工具更新 ${event.toolName}: ${stringifyBrief(event.partialResult)}`;
  }

  if (event.type === "tool_end") {
    return `${event.isError ? "工具失败" : "工具完成"} ${event.toolName}: ${stringifyBrief(event.result)}`;
  }

  if (event.type === "stderr") {
    return `Agent 日志：${event.message}`;
  }

  if (event.type === "exit") {
    return event.success ? "Agent 任务已退出" : `Agent 任务异常退出：${event.code ?? "unknown"}`;
  }

  if (event.type === "error") {
    return `Agent 错误：${event.message}`;
  }

  if (event.type === "done") {
    return "Agent 任务完成";
  }

  return "";
};

type AgentEventGroup = {
  id: string;
  title: string;
  status: "running" | "done" | "error" | "info";
  events: CodingAgentEvent[];
};

const describeAgentGroupEvent = (event: CodingAgentEvent) => {
  if (event.type === "tool_start") {
    return `开始：${stringifyBrief(event.args)}`;
  }

  if (event.type === "tool_update") {
    return `更新：${stringifyBrief(event.partialResult)}`;
  }

  if (event.type === "tool_end") {
    return `${event.isError ? "失败" : "完成"}：${stringifyBrief(event.result)}`;
  }

  return describeAgentEvent(event);
};

const groupAgentEvents = (events: CodingAgentEvent[]) => {
  const groups: AgentEventGroup[] = [];
  const lastToolGroupByName = new Map<string, AgentEventGroup>();

  events.forEach((event, index) => {
    if (event.type === "tool_start") {
      const group: AgentEventGroup = {
        id: `${index}-${event.toolName}`,
        title: event.toolName,
        status: "running",
        events: [event],
      };
      groups.push(group);
      lastToolGroupByName.set(event.toolName, group);
      return;
    }

    if (event.type === "tool_update" || event.type === "tool_end") {
      const group = lastToolGroupByName.get(event.toolName);
      if (group) {
        group.events.push(event);
        if (event.type === "tool_end") {
          group.status = event.isError ? "error" : "done";
          lastToolGroupByName.delete(event.toolName);
        }
        return;
      }
    }

    const group: AgentEventGroup = {
      id: `${index}-${event.type}`,
      title: event.type === "stderr" ? "Agent 日志" : describeAgentEvent(event),
      status: event.type === "error" ? "error" : "info",
      events: [event],
    };
    groups.push(group);
  });

  return groups;
};

const isTimelineEvent = (event: CodingAgentEvent) =>
  event.type !== "text_delta" &&
  event.type !== "thinking_delta" &&
  event.type !== "thinking_end" &&
  event.type !== "replace_text" &&
  event.type !== "done";

const buildSystemPrompt = (
  workspace: Workspace,
  activeFile: WorkspaceFile | null,
  referencedFiles: ResolvedFileReference[],
  enabledSkills: WorkspaceSkill[],
  selectedAgent: AgentProfile | null,
) => {
  const fileContext = activeFile
    ? `\n\n当前打开文件：${activeFile.path}\n\n${activeFile.content.slice(0, 12000)}`
    : "";
  const referenceContext = referencedFiles.length
    ? `\n\n用户引用文件：\n${referencedFiles
      .map((file) => [
        `## ${file.path}`,
        file.content.slice(0, 20000),
      ].join("\n\n"))
      .join("\n\n")}`
    : "";
  const skillsContext = enabledSkills.length
    ? `\n\n当前工作区启用的 Skills：\n${enabledSkills
      .map((skill) => [
        `<skill name="${skill.name}">`,
        skill.content.slice(0, 12000),
        "</skill>",
      ].join("\n"))
      .join("\n\n")}`
    : "";
  const agentContext = selectedAgent
    ? [
        "",
        `当前 Agent：${selectedAgent.name}`,
        selectedAgent.description ? `Agent 描述：${selectedAgent.description}` : "",
        "请优先保持这个 Agent 的角色定位、语气和工作方式。",
      ].filter(Boolean).join("\n")
    : "";

  return [
    "你是 Novel Claw 的工作区 AI 助手。",
    `工作区名称：${workspace.name}`,
    `工作区路径：${workspace.path}`,
    "你可以帮助用户规划、写作、分析和修改项目文件。",
    "如果需要创建或修改文件，请明确说明目标路径和内容；用户可以在文件面板中保存。",
    agentContext,
    fileContext,
    referenceContext,
    skillsContext,
  ].join("\n");
};

const buildCollaborationSystemPrompt = (
  workspace: Workspace,
  activeFile: WorkspaceFile | null,
  referencedFiles: ResolvedFileReference[],
  enabledSkills: WorkspaceSkill[],
  selectedAgent: AgentProfile,
  phase: "draft" | "review" | "revise",
) => {
  const basePrompt = buildSystemPrompt(
    workspace,
    activeFile,
    referencedFiles,
    enabledSkills,
    selectedAgent,
  );
  const phaseInstruction = {
    draft: [
      "协作阶段：写作初稿。",
      "请作为写作 Agent，根据用户需求产出完整可审查的初稿或方案。",
      "不要评价自己的结果，重点完成可交付内容。",
    ],
    review: [
      "协作阶段：审查意见。",
      "请作为审查 Agent，严格审查上一位 Agent 的输出。",
      "请指出结构、逻辑、人物、节奏、设定、表达或可执行性问题，并给出具体修改建议。",
      "不要直接重写全文，重点输出审查意见。",
    ],
    revise: [
      "协作阶段：修订定稿。",
      "请作为写作 Agent，根据审查意见修订上一版内容。",
      "最终输出应是用户可以直接使用的版本，可以简要说明采纳了哪些关键修改。",
    ],
  }[phase].join("\n");

  return [basePrompt, phaseInstruction].join("\n\n");
};

const getCollaborationAgentStatus = (
  role: "writer" | "reviewer",
  phase: CollaborationPhase,
) => {
  const isWorking =
    (role === "writer" && (phase === "drafting" || phase === "revising")) ||
    (role === "reviewer" && phase === "reviewing");

  if (isWorking) {
    return {
      label: role === "writer"
        ? phase === "drafting" ? "写作中" : "修订中"
        : "审查中",
      state: "working",
    } as const;
  }

  return {
    label: phase === "idle" ? "摸鱼中" : "待命中",
    state: phase === "idle" ? "idle" : "waiting",
  } as const;
};

const CollaborationStatusPanel = memo(({
  writerAgent,
  reviewerAgent,
  phase,
}: CollaborationStatusPanelProps) => {
  const items = [
    { role: "writer" as const, title: "写作", agent: writerAgent },
    { role: "reviewer" as const, title: "审查", agent: reviewerAgent },
  ];

  return (
    <div className="border-t border-sidebar-border bg-sidebar px-3 py-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-sidebar-foreground">Agent 协作状态</span>
        <span>{phase === "idle" ? "空闲" : "执行中"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const status = getCollaborationAgentStatus(item.role, phase);
          const avatar = resolveAgentAvatar(item.agent?.avatar);

          return (
            <div
              key={item.role}
              className="overflow-hidden rounded-md border border-sidebar-border bg-card/70 shadow-xs"
            >
              <div className="px-2 pt-2 text-center">
                <div className="truncate text-xs font-medium text-sidebar-foreground">
                  {item.agent?.name ?? "未选择"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {status.label}
                </div>
              </div>
              <div
                className={[
                  "agent-workstation",
                  status.state === "working" ? "is-working" : "is-idle",
                ].join(" ")}
              >
                <div className="agent-desk">
                  <div className="agent-monitor">
                    {status.state === "working" && (
                      <>
                        <span />
                        <span />
                        <span />
                      </>
                    )}
                  </div>
                  <div className="agent-keyboard" />
                  <div className="agent-note" />
                </div>
                <div className="agent-chair" />
                <div className="agent-worker">
                  <div className="agent-worker-head">
                    <img src={avatar.src} alt="" />
                  </div>
                  <div className="agent-worker-body" />
                  {status.state === "working" ? (
                    <>
                      <span className="agent-arm left" />
                      <span className="agent-arm right" />
                    </>
                  ) : (
                    <span className="agent-idle-bubble" />
                  )}
                </div>
                <div className="agent-shadow" />
                <div className="agent-role-tag">
                  {item.title}
                  {status.state === "working" && (
                    <span className="agent-status-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
CollaborationStatusPanel.displayName = "CollaborationStatusPanel";

const ChatComposer = memo(({
  files,
  resetKey,
  isSending,
  activeAgentTaskId,
  isSettingsLoading,
  chatMode,
  modelSource,
  agentProfiles,
  providers,
  selectedProvider,
  selectedProviderId,
  selectedModels,
  selectedModel,
  selectedAgent,
  reviewerAgent,
  onChatModeChange,
  onModelSourceChange,
  onSelectedAgentChange,
  onReviewerAgentChange,
  onProviderChange,
  onModelChange,
  onSubmit,
}: ChatComposerProps) => {
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [promptCursor, setPromptCursor] = useState(0);

  useEffect(() => {
    setPrompt("");
    setPromptCursor(0);
  }, [resetKey]);

  const selectableFiles = useMemo(
    () => files.filter((file) => !file.isDirectory),
    [files],
  );
  const activeReferenceToken = useMemo(
    () => getActiveReferenceToken(prompt, promptCursor),
    [prompt, promptCursor],
  );
  const referenceSuggestions = useMemo(() => {
    if (!activeReferenceToken) {
      return [];
    }

    const query = activeReferenceToken.query.toLowerCase();
    const candidates = query
      ? selectableFiles.filter((file) => {
        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        return path.includes(query) || name.includes(query);
      })
      : selectableFiles;

    return candidates.slice(0, 8);
  }, [activeReferenceToken, selectableFiles]);
  const fileReferenceMatches = useMemo(
    () => resolveFileReferenceMatches(prompt, files),
    [files, prompt],
  );
  const referencedFilePreviews = useMemo(
    () => summarizeReferenceMatches(fileReferenceMatches),
    [fileReferenceMatches],
  );
  const unresolvedFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length === 0),
    [fileReferenceMatches],
  );
  const ambiguousFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length > 1),
    [fileReferenceMatches],
  );

  const updatePromptCursor = () => {
    setPromptCursor(promptInputRef.current?.selectionStart ?? 0);
  };

  const insertFileReference = (file: WorkspaceFileEntry) => {
    if (!activeReferenceToken) {
      return;
    }

    const reference = quoteReferencePath(file.path);
    const nextPrompt = [
      prompt.slice(0, activeReferenceToken.start),
      reference,
      " ",
      prompt.slice(activeReferenceToken.end),
    ].join("");
    const nextCursor = activeReferenceToken.start + reference.length + 1;

    setPrompt(nextPrompt);
    setPromptCursor(nextCursor);
    window.setTimeout(() => {
      promptInputRef.current?.focus();
      promptInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const text = prompt.trim();
    if (!text || isSending || activeAgentTaskId) {
      return;
    }

    onSubmit({
      text,
      referencedFilePreviews,
      unresolvedFileReferences,
      ambiguousFileReferences,
    });
    setPrompt("");
    setPromptCursor(0);
  };

  return (
    <>
      {fileReferenceMatches.length > 0 && (
        <div className="mx-auto mb-3 flex max-w-5xl flex-wrap gap-2 text-xs">
          {referencedFilePreviews.map((file) => (
            <span
              key={file.path}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-primary"
            >
              <Link className="size-3" />
              <span className="truncate">{file.path}</span>
            </span>
          ))}
          {unresolvedFileReferences.map((match) => (
            <span
              key={`missing-${match.token}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive"
            >
              未找到 @{match.token}
            </span>
          ))}
          {ambiguousFileReferences.map((match) => (
            <span
              key={`ambiguous-${match.token}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground"
              title={match.matches.map((file) => file.path).join("\n")}
            >
              @{match.token} 匹配 {match.matches.length} 个文件
            </span>
          ))}
        </div>
      )}

      <div className="mx-auto mb-3 flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <div className="flex h-9 rounded-md border border-input bg-muted/60 p-0.5 shadow-xs">
          <Button
            type="button"
            size="sm"
            variant={chatMode === "chat" ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => onChatModeChange("chat")}
          >
            <MessageSquare className="size-3.5" />
            <span>聊天</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={chatMode === "agent" ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => onChatModeChange("agent")}
          >
            <Wrench className="size-3.5" />
            <span>Agent</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={chatMode === "collab" ? "secondary" : "ghost"}
            className="h-7 px-2"
            onClick={() => onChatModeChange("collab")}
            disabled={agentProfiles.length === 0}
          >
            <Sparkles className="size-3.5" />
            <span>协作</span>
          </Button>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          {chatMode === "collab" ? (
            <>
              <select
                className="h-9 min-w-40 max-w-64 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={selectedAgent?.id ?? ""}
                disabled={isSettingsLoading || agentProfiles.length === 0}
                onChange={(event) => onSelectedAgentChange(event.currentTarget.value)}
                title="写作 Agent"
              >
                {agentProfiles.length === 0 ? (
                  <option value="">未配置写作 Agent</option>
                ) : (
                  agentProfiles.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      写作：{agent.name}
                    </option>
                  ))
                )}
              </select>
              <select
                className="h-9 min-w-40 max-w-64 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={reviewerAgent?.id ?? ""}
                disabled={isSettingsLoading || agentProfiles.length === 0}
                onChange={(event) => onReviewerAgentChange(event.currentTarget.value)}
                title="审查 Agent"
              >
                {agentProfiles.length === 0 ? (
                  <option value="">未配置审查 Agent</option>
                ) : (
                  agentProfiles.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      审查：{agent.name}
                    </option>
                  ))
                )}
              </select>
            </>
          ) : (
            <>
              <select
                className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                value={modelSource}
                disabled={isSettingsLoading}
                onChange={(event) => onModelSourceChange(event.currentTarget.value as ModelSource)}
              >
                <option value="agent" disabled={agentProfiles.length === 0}>
                  Agent
                </option>
                <option value="direct">模型</option>
              </select>
              {modelSource === "agent" ? (
                <select
                  className="h-9 min-w-0 max-w-72 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={selectedAgent?.id ?? ""}
                  disabled={isSettingsLoading || agentProfiles.length === 0}
                  onChange={(event) => onSelectedAgentChange(event.currentTarget.value)}
                >
                  {agentProfiles.length === 0 ? (
                    <option value="">未配置 Agent</option>
                  ) : (
                    agentProfiles.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} / {agent.model.modelName || agent.model.modelId}
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <>
                  <select
                    className="h-9 min-w-36 max-w-52 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={selectedProviderId}
                    disabled={isSettingsLoading || providers.length === 0}
                    onChange={(event) => onProviderChange(event.currentTarget.value)}
                  >
                    {providers.length === 0 ? (
                      <option value="">未配置 LLM</option>
                    ) : (
                      providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    className="h-9 min-w-40 max-w-64 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={selectedModel?.id ?? ""}
                    disabled={!selectedProvider || selectedModels.length === 0}
                    onChange={(event) => onModelChange(event.currentTarget.value)}
                  >
                    {selectedModels.length === 0 ? (
                      <option value="">未启用模型</option>
                    ) : (
                      selectedModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.modelName || model.modelId}
                        </option>
                      ))
                    )}
                  </select>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <form
        action="#"
        className="mx-auto flex max-w-5xl items-end gap-2"
        onSubmit={submitPrompt}
      >
        <div className="relative min-w-0 flex-1">
          {activeReferenceToken && (
            <div className="absolute right-0 bottom-[calc(100%+0.5rem)] left-0 z-20 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
              <div className="border-b border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground">
                {activeReferenceToken.query
                  ? `选择引用文件：${activeReferenceToken.query}`
                  : "选择要引用的文件"}
              </div>
              <div className="max-h-56 overflow-auto p-1">
                {referenceSuggestions.length > 0 ? (
                  referenceSuggestions.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertFileReference(file)}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    没有匹配的文件
                  </div>
                )}
              </div>
            </div>
          )}
          <Textarea
            ref={promptInputRef}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.currentTarget.value);
              setPromptCursor(event.currentTarget.selectionStart);
            }}
            placeholder="输入问题，使用 @文件名 引用工作区文件"
            rows={3}
            className="max-h-40 min-h-20 resize-none bg-background shadow-xs"
            onClick={updatePromptCursor}
            onSelect={updatePromptCursor}
            onKeyUp={updatePromptCursor}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </div>
        <Button type="submit" disabled={isSending || Boolean(activeAgentTaskId) || !prompt.trim()}>
          {isSending || activeAgentTaskId ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          <span>{isSending || activeAgentTaskId ? "处理中" : "发送"}</span>
        </Button>
      </form>
    </>
  );
});
ChatComposer.displayName = "ChatComposer";

export const WorkspaceChatPage = ({
  workspace,
  onBack,
}: WorkspaceChatPageProps) => {
  const codingAgent = useMemo(() => createAgentRuntimeAdapter(), []);
  const activeAgentTaskIdRef = useRef("");
  const activeAgentMessageIdRef = useRef("");
  const lastAgentErrorRef = useRef("");
  const lastAgentStderrRef = useRef("");
  const isHydratingSessionRef = useRef(false);
  const saveSessionTimerRef = useRef<number | null>(null);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [modelSource, setModelSource] = useState<ModelSource>("agent");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedReviewerAgentId, setSelectedReviewerAgentId] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [skills, setSkills] = useState<WorkspaceSkill[]>([]);
  const [enabledSkillNames, setEnabledSkillNames] = useState<string[]>([]);
  const [isSkillsDialogOpen, setIsSkillsDialogOpen] = useState(false);
  const [skillsError, setSkillsError] = useState("");
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [isSkillsSaving, setIsSkillsSaving] = useState(false);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState("");
  const [fileViewMode, setFileViewMode] = useState<"source" | "preview">("source");
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [isFileSaving, setIsFileSaving] = useState(false);
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [chatError, setChatError] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("agent");
  const [allowedAgentTools, setAllowedAgentTools] = useState<AgentToolName[]>(
    DEFAULT_ALLOWED_AGENT_TOOLS,
  );
  const [collaborationPhase, setCollaborationPhase] = useState<CollaborationPhase>("idle");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat");
  const [isSending, setIsSending] = useState(false);
  const [activeAgentTaskId, setActiveAgentTaskId] = useState("");
  const [pendingAgentQuestion, setPendingAgentQuestion] = useState<PendingAgentQuestion | null>(null);
  const [agentQuestionAnswer, setAgentQuestionAnswer] = useState("");
  const [customAgentQuestionAnswer, setCustomAgentQuestionAnswer] = useState("");
  const [isAnsweringAgentQuestion, setIsAnsweringAgentQuestion] = useState(false);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Set<string>>(() => new Set());
  const [expandedAgentEventIds, setExpandedAgentEventIds] = useState<Set<string>>(() => new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState(DEFAULT_SESSION_TITLE);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isSessionSaving, setIsSessionSaving] = useState(false);
  const [sessionsError, setSessionsError] = useState("");

  const updateMessage = useCallback((
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) => {
    setMessages((current) =>
      current.map((message) => message.id === messageId ? updater(message) : message),
    );
  }, []);

  const toggleAllowedAgentTool = useCallback((toolId: AgentToolName, enabled: boolean) => {
    setAllowedAgentTools((current) => {
      if (enabled) {
        return current.includes(toolId) ? current : normalizeAllowedAgentTools([...current, toolId]);
      }

      return current.filter((item) => item !== toolId);
    });
  }, []);

  const hydrateSession = useCallback((
    session: {
      id: string | null;
      title: string;
      messages: ChatMessage[];
      conversation: ConversationMessage[];
    } | null,
  ) => {
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
      saveSessionTimerRef.current = null;
    }
    isHydratingSessionRef.current = true;
    setMessages(session?.messages ?? []);
    setConversation(session?.conversation ?? []);
    setCurrentSessionId(session?.id ?? null);
    setCurrentSessionTitle(session?.title || DEFAULT_SESSION_TITLE);
    setExpandedThinkingIds(new Set());
    setExpandedAgentEventIds(new Set());
    window.setTimeout(() => {
      isHydratingSessionRef.current = false;
    }, 0);
  }, []);

  const loadSessions = useCallback(async () => {
    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const [sessions, latestSession] = await Promise.all([
        listChatSessions(workspace.path),
        loadChatSession(workspace.path),
      ]);
      setChatSessions(sessions);
      hydrateSession(latestSession
        ? {
          id: latestSession.id,
          title: latestSession.title,
          messages: latestSession.messages,
          conversation: latestSession.conversation,
        }
        : null);
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  }, [hydrateSession, workspace.path]);

  const loadSessionById = async (sessionId: string) => {
    if (activeAgentTaskIdRef.current) {
      setSessionsError("Agent 正在处理，结束后再切换聊天记录");
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const session = await loadChatSession(workspace.path, sessionId);
      if (!session) {
        setSessionsError("未找到这条聊天记录");
        return;
      }
      hydrateSession({
        id: session.id,
        title: session.title,
        messages: session.messages,
        conversation: session.conversation,
      });
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const startNewSession = () => {
    if (activeAgentTaskIdRef.current) {
      setSessionsError("Agent 正在处理，结束后再新建聊天");
      return;
    }

    setSessionsError("");
    setComposerResetKey((current) => current + 1);
    setPendingAgentQuestion(null);
    hydrateSession(null);
  };

  const removeSession = async (sessionId: string) => {
    if (activeAgentTaskIdRef.current) {
      setSessionsError("Agent 正在处理，结束后再删除聊天记录");
      return;
    }

    const confirmed = window.confirm("永久删除该聊天记录？此操作不可恢复。");
    if (!confirmed) {
      return;
    }

    setIsSessionsLoading(true);
    setSessionsError("");

    try {
      const nextSessions = await deleteChatSession(workspace.path, sessionId);
      setChatSessions(nextSessions);
      if (currentSessionId === sessionId) {
        const latestSession = await loadChatSession(workspace.path);
        hydrateSession(latestSession
          ? {
            id: latestSession.id,
            title: latestSession.title,
            messages: latestSession.messages,
            conversation: latestSession.conversation,
          }
          : null);
      }
    } catch (caught) {
      setSessionsError(String(caught));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const toggleThinking = (messageId: string) => {
    setExpandedThinkingIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const toggleAgentEvents = (messageId: string) => {
    setExpandedAgentEventIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const loadLlmOptions = useCallback(async () => {
    setIsSettingsLoading(true);
    setSettingsError("");

    try {
      const [settings, agentSettings] = await Promise.all([
        getLlmSettings(),
        getAiAgentSettings(),
      ]);
      const nextProviders = settings.providers;
      const defaultProvider = findDefaultProvider(nextProviders);

      setProviders(nextProviders);
      setAgents(agentSettings.agents);
      setSelectedProviderId((currentProviderId) => {
        const currentProvider = nextProviders.find((provider) => provider.id === currentProviderId);
        const nextProvider = currentProvider ?? defaultProvider;

        setSelectedModelId((currentModelId) => {
          const currentModel = nextProvider?.models.find((model) => model.id === currentModelId && model.isEnabled);
          const nextModel = currentModel ?? nextProvider?.models.find((model) => model.isEnabled);
          return nextModel?.id ?? "";
        });

        return nextProvider?.id ?? "";
      });
      setSelectedAgentId((currentAgentId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        const currentProfile = profiles.find((agent) => agent.id === currentAgentId);
        return currentProfile?.id ?? profiles[0]?.id ?? "";
      });
      setSelectedReviewerAgentId((currentAgentId) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        const currentProfile = profiles.find((agent) => agent.id === currentAgentId);
        return currentProfile?.id ?? profiles[1]?.id ?? profiles[0]?.id ?? "";
      });
      setModelSource((currentSource) => {
        const profiles = resolveAgentProfiles(agentSettings.agents, nextProviders);
        return currentSource === "agent" && profiles.length === 0 ? "direct" : currentSource;
      });
    } catch (caught) {
      setSettingsError(String(caught));
    } finally {
      setHasLoadedSettings(true);
      setIsSettingsLoading(false);
    }
  }, []);

  const loadWorkspaceSkills = useCallback(async () => {
    setIsSkillsLoading(true);
    setSkillsError("");

    try {
      const settings = await getWorkspaceSkills(workspace.id);
      setSkills(settings.skills);
      setEnabledSkillNames(
        settings.skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillsLoading(false);
    }
  }, [workspace.id]);

  const toggleWorkspaceSkill = (name: string, enabled: boolean) => {
    setEnabledSkillNames((current) => {
      const next = new Set(current);
      if (enabled) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return [...next].sort();
    });
  };

  const handleSkillsDialogOpenChange = (open: boolean) => {
    setIsSkillsDialogOpen(open);
    if (!open) {
      setEnabledSkillNames(
        skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
    }
  };

  const saveSkills = async () => {
    setIsSkillsSaving(true);
    setSkillsError("");

    try {
      const settings = await saveWorkspaceSkills(workspace.id, enabledSkillNames);
      setSkills(settings.skills);
      setEnabledSkillNames(
        settings.skills
          .filter((skill) => skill.enabled)
          .map((skill) => skill.name),
      );
      setIsSkillsDialogOpen(false);
    } catch (caught) {
      setSkillsError(String(caught));
    } finally {
      setIsSkillsSaving(false);
    }
  };

  const loadFiles = useCallback(async () => {
    setIsFilesLoading(true);
    setFileError("");

    try {
      const nextFiles = await listWorkspaceFiles(workspace.path);
      setFiles(nextFiles);
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFilesLoading(false);
    }
  }, [workspace.path]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void loadLlmOptions();
  }, [loadLlmOptions]);

  useEffect(() => {
    void loadWorkspaceSkills();
  }, [loadWorkspaceSkills]);

  useEffect(() => {
    activeAgentTaskIdRef.current = activeAgentTaskId;
  }, [activeAgentTaskId]);

  useEffect(() => () => {
    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (isHydratingSessionRef.current) {
      return;
    }

    if (saveSessionTimerRef.current) {
      window.clearTimeout(saveSessionTimerRef.current);
    }

    if (messages.length === 0) {
      return;
    }

    const title = deriveSessionTitle(messages);
    if (title !== currentSessionTitle) {
      setCurrentSessionTitle(title);
    }

    saveSessionTimerRef.current = window.setTimeout(() => {
      setIsSessionSaving(true);
      setSessionsError("");

      void saveChatSession({
        workspacePath: workspace.path,
        sessionId: currentSessionId,
        title,
        messages,
        conversation,
      })
        .then((session) => {
          setCurrentSessionId(session.id);
          setCurrentSessionTitle(session.title);
          setChatSessions((current) => {
            const nextMeta: ChatSessionMeta = {
              id: session.id,
              title: session.title,
              path: "",
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: session.messages.length,
            };
            const withoutCurrent = current.filter((item) => item.id !== session.id);
            return [nextMeta, ...withoutCurrent].sort((left, right) => right.updatedAt - left.updatedAt);
          });
        })
        .catch((caught) => {
          setSessionsError(String(caught));
        })
        .finally(() => {
          setIsSessionSaving(false);
        });
    }, 700);
  }, [conversation, currentSessionId, currentSessionTitle, messages, workspace.path]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    void codingAgent.subscribe((event) => {
      const currentTaskId = activeAgentTaskIdRef.current;
      if (currentTaskId && event.taskId !== currentTaskId) {
        return;
      }

      const messageId = activeAgentMessageIdRef.current;
      if (!messageId) {
        return;
      }

      if (event.type === "text_delta") {
        updateMessage(messageId, (message) => ({
          ...message,
          text: `${message.text}${event.delta}`,
          status: "streaming",
        }));
        return;
      }

      if (event.type === "thinking_delta") {
        updateMessage(messageId, (message) => ({
          ...message,
          thinking: `${message.thinking ?? ""}${event.delta}`,
          status: "streaming",
        }));
        return;
      }

      if (event.type === "thinking_end") {
        updateMessage(messageId, (message) => ({
          ...message,
          thinking: event.content || message.thinking,
          status: "streaming",
        }));
        return;
      }

      if (event.type === "replace_text") {
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.text,
          status: "streaming",
        }));
        return;
      }

      if (isTimelineEvent(event)) {
        updateMessage(messageId, (message) => ({
          ...message,
          agentEvents: [...(message.agentEvents ?? []), event].slice(-80),
          status: event.type === "error" ? "error" : message.status,
        }));
      }

      if (event.type === "question") {
        setPendingAgentQuestion({
          taskId: event.taskId,
          questionId: event.questionId,
          question: event.question,
          context: event.context,
          input: event.input,
        });
        setAgentQuestionAnswer(event.input?.selected ?? "");
        setCustomAgentQuestionAnswer("");
        return;
      }

      if (event.type === "question_answered") {
        setPendingAgentQuestion((current) =>
          current?.questionId === event.questionId ? null : current,
        );
        setAgentQuestionAnswer("");
        setCustomAgentQuestionAnswer("");
        return;
      }

      if (event.type === "done") {
        const assistantText = event.text.trim();
        updateMessage(messageId, (message) => ({
          ...message,
          text: assistantText || message.text || "Agent 任务已完成。",
          status: "done",
        }));
        setConversation((current) => [
          ...current,
          {
            role: "assistant",
            content: assistantText || "Agent 任务已完成。",
            timestamp: Date.now(),
          },
        ]);
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        void loadFiles();
      }

      if (event.type === "stderr") {
        lastAgentStderrRef.current = event.message;
      }

      if (event.type === "error") {
        lastAgentErrorRef.current = event.message;
        setChatError(event.message);
        updateMessage(messageId, (message) => ({
          ...message,
          text: event.message,
          status: "error",
        }));
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
      }

      if (event.type === "exit" && !event.success) {
        const message =
          lastAgentErrorRef.current ||
          lastAgentStderrRef.current ||
          `Agent 任务异常退出：${event.code ?? "unknown"}`;
        setChatError(message);
        updateMessage(messageId, (currentMessage) => ({
          ...currentMessage,
          text: message,
          status: "error",
        }));
        setActiveAgentTaskId("");
        setPendingAgentQuestion(null);
        activeAgentTaskIdRef.current = "";
        activeAgentMessageIdRef.current = "";
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
      }
    }).then((unsubscribe) => {
      cleanup = unsubscribe;
    });

    return () => {
      cleanup?.();
    };
  }, [codingAgent, loadFiles, updateMessage]);

  const selectableFiles = useMemo(
    () => files.filter((file) => !file.isDirectory),
    [files],
  );
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const selectedModels = useMemo(
    () => selectedProvider?.models.filter((model) => model.isEnabled) ?? [],
    [selectedProvider],
  );

  const selectedModel = useMemo(
    () => selectedModels.find((model) => model.id === selectedModelId)
      ?? selectedModels[0]
      ?? null,
    [selectedModelId, selectedModels],
  );
  const agentProfiles = useMemo(
    () => resolveAgentProfiles(agents, providers),
    [agents, providers],
  );
  const selectedAgent = useMemo(
    () => agentProfiles.find((agent) => agent.id === selectedAgentId)
      ?? agentProfiles[0]
      ?? null,
    [agentProfiles, selectedAgentId],
  );
  const reviewerAgent = useMemo(
    () => agentProfiles.find((agent) => agent.id === selectedReviewerAgentId)
      ?? agentProfiles.find((agent) => agent.id !== selectedAgent?.id)
      ?? selectedAgent
      ?? null,
    [agentProfiles, selectedAgent, selectedReviewerAgentId],
  );
  const effectiveProvider = modelSource === "agent"
    ? selectedAgent?.provider ?? null
    : selectedProvider;
  const effectiveModel = modelSource === "agent"
    ? selectedAgent?.model ?? null
    : selectedModel;
  const enabledSkills = useMemo(() => {
    const names = new Set(enabledSkillNames);
    return skills.filter((skill) => names.has(skill.name));
  }, [enabledSkillNames, skills]);
  const isMarkdownFile = useMemo(
    () => isMarkdownPath(filePath),
    [filePath],
  );
  const activeAgentAvatar = resolveAgentAvatar(
    modelSource === "agent" ? selectedAgent?.avatar : null,
  );

  useEffect(() => {
    if (!selectedProvider) {
      setSelectedModelId("");
      return;
    }

    if (!selectedModel || !selectedProvider.models.some((model) => model.id === selectedModel.id)) {
      setSelectedModelId(selectedProvider.models.find((model) => model.isEnabled)?.id ?? "");
    }
  }, [selectedModel, selectedProvider]);

  useEffect(() => {
    if (hasLoadedSettings && modelSource === "agent" && !selectedAgent && agentProfiles.length === 0) {
      setModelSource("direct");
    }
  }, [agentProfiles.length, hasLoadedSettings, modelSource, selectedAgent]);

  useEffect(() => {
    if (!reviewerAgent) {
      setSelectedReviewerAgentId("");
      return;
    }

    if (!agentProfiles.some((agent) => agent.id === selectedReviewerAgentId)) {
      setSelectedReviewerAgentId(reviewerAgent.id);
    }
  }, [agentProfiles, reviewerAgent, selectedReviewerAgentId]);

  useEffect(() => {
    if (!isMarkdownFile && fileViewMode === "preview") {
      setFileViewMode("source");
    }
  }, [fileViewMode, isMarkdownFile]);

  const openFile = async (path: string) => {
    setFileError("");

    try {
      const file = await readWorkspaceFile(workspace.path, path);
      setActiveFile(file);
      setFilePath(file.path);
      setFileContent(file.content);
      setWorkspaceView((current) => current === "split" ? "split" : "file");
    } catch (caught) {
      setFileError(String(caught));
    }
  };

  const prepareNewFile = () => {
    setActiveFile(null);
    setFilePath("");
    setFileContent("");
    setFileError("");
    setFileViewMode("source");
    setWorkspaceView((current) => current === "split" ? "split" : "file");
  };

  const saveFile = async () => {
    setIsFileSaving(true);
    setFileError("");

    try {
      const saved = await writeWorkspaceFile(workspace.path, filePath, fileContent);
      setActiveFile(saved);
      setFilePath(saved.path);
      setFileContent(saved.content);
      await loadFiles();
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFileSaving(false);
    }
  };

  const submitAgentQuestionAnswer = async (answerValue: string) => {
    const answer = answerValue.trim();
    if (!pendingAgentQuestion || !answer || isAnsweringAgentQuestion) {
      return;
    }

    setIsAnsweringAgentQuestion(true);
    setChatError("");

    try {
      await codingAgent.answerQuestion(
        pendingAgentQuestion.taskId,
        pendingAgentQuestion.questionId,
        answer,
      );
      setAgentQuestionAnswer("");
      setCustomAgentQuestionAnswer("");
    } catch (caught) {
      setChatError(String(caught));
    } finally {
      setIsAnsweringAgentQuestion(false);
    }
  };

  const answerAgentQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await submitAgentQuestionAnswer(
      agentQuestionAnswer === "other" ? customAgentQuestionAnswer : agentQuestionAnswer,
    );
  };

  const sendMessage = async ({
    text,
    referencedFilePreviews,
    unresolvedFileReferences,
    ambiguousFileReferences,
  }: ComposerSubmitInput) => {
    if (!text || isSending || activeAgentTaskId) {
      return;
    }

    if (chatMode === "collab" && (!selectedAgent || !reviewerAgent)) {
      setChatError("请选择写作 Agent 和审查 Agent");
      return;
    }

    if (chatMode !== "collab" && (!effectiveProvider || !effectiveModel)) {
      setChatError("请选择要使用的 LLM 和模型");
      return;
    }

    if (unresolvedFileReferences.length > 0) {
      setChatError(`未找到引用文件：${unresolvedFileReferences.map((match) => `@${match.token}`).join("、")}`);
      return;
    }

    if (ambiguousFileReferences.length > 0) {
      setChatError(
        ambiguousFileReferences
          .map((match) => {
            const candidates = match.matches.slice(0, 5).map((file) => file.path).join("、");
            return `@${match.token} 匹配到多个文件：${candidates}`;
          })
          .join("\n"),
      );
      return;
    }

    let referencedFiles: ResolvedFileReference[] = [];
    try {
      referencedFiles = await Promise.all(
        referencedFilePreviews.map(async (file) => {
          const content = await readWorkspaceFile(workspace.path, file.path);
          return {
            path: content.path,
            content: content.content,
          };
        }),
      );
    } catch (caught) {
      setChatError(`读取引用文件失败：${String(caught)}`);
      return;
    }

    const now = Date.now();
    const assistantMessageId = createMessageId();
    const userMessage: ConversationMessage = {
      role: "user",
      content: text,
      timestamp: now,
    };
    const nextConversation = [...conversation, userMessage];
    const userUiMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      text,
      createdAt: now,
      referencedFiles: referencedFiles.map((file) => ({ path: file.path })),
    };
    const assistantUiMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      mode: chatMode,
      text: "",
      status: "loading",
      createdAt: now,
      agentAvatar: modelSource === "agent" || chatMode === "collab" ? selectedAgent?.avatar : undefined,
      agentName: chatMode === "collab" && selectedAgent && reviewerAgent
        ? `${selectedAgent.name} + ${reviewerAgent.name}`
        : modelSource === "agent" ? selectedAgent?.name : undefined,
      agentEvents: chatMode === "agent" ? [] : undefined,
    };

    setMessages((current) => [...current, userUiMessage, assistantUiMessage]);
    setConversation(nextConversation);
    setIsSending(true);
    setChatError("");

    try {
      if (chatMode === "collab" && selectedAgent && reviewerAgent) {
        setCollaborationPhase("drafting");
        const draftResult = await chatWithLlm({
          provider: selectedAgent.provider,
          model: selectedAgent.model,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            selectedAgent,
            "draft",
          ),
          messages: nextConversation,
        });
        const draftText = draftResult.text.trim();
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          text: [
            `## ${selectedAgent.name}：初稿`,
            draftText,
            "",
            `## ${reviewerAgent.name}：审查中`,
            "",
            "正在审查初稿...",
          ].join("\n\n"),
          thinking: draftResult.thinking?.trim() || undefined,
          status: "streaming",
        }));

        setCollaborationPhase("reviewing");
        const reviewResult = await chatWithLlm({
          provider: reviewerAgent.provider,
          model: reviewerAgent.model,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            reviewerAgent,
            "review",
          ),
          messages: [
            ...nextConversation,
            {
              role: "assistant",
              content: draftText,
              timestamp: Date.now(),
            },
          ],
        });
        const reviewText = reviewResult.text.trim();
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          text: [
            `## ${selectedAgent.name}：初稿`,
            draftText,
            "",
            `## ${reviewerAgent.name}：审查意见`,
            reviewText,
            "",
            `## ${selectedAgent.name}：修订中`,
            "",
            "正在根据审查意见修订...",
          ].join("\n\n"),
          thinking: [message.thinking, reviewResult.thinking?.trim()].filter(Boolean).join("\n\n") || undefined,
          status: "streaming",
        }));

        setCollaborationPhase("revising");
        const finalResult = await chatWithLlm({
          provider: selectedAgent.provider,
          model: selectedAgent.model,
          systemPrompt: buildCollaborationSystemPrompt(
            workspace,
            activeFile,
            referencedFiles,
            enabledSkills,
            selectedAgent,
            "revise",
          ),
          messages: [
            ...nextConversation,
            {
              role: "assistant",
              content: draftText,
              timestamp: Date.now(),
            },
            {
              role: "user",
              content: `这是审查 Agent 的意见，请据此修订并输出最终版本：\n\n${reviewText}`,
              timestamp: Date.now(),
            },
          ],
        });
        const finalText = finalResult.text.trim();
        const collaborationText = [
          `## ${selectedAgent.name}：最终修订`,
          finalText,
          "",
          "<details>",
          `<summary>${selectedAgent.name} 初稿</summary>`,
          "",
          draftText,
          "",
          "</details>",
          "",
          "<details>",
          `<summary>${reviewerAgent.name} 审查意见</summary>`,
          "",
          reviewText,
          "",
          "</details>",
        ].join("\n\n");

        updateMessage(assistantMessageId, (message) => ({
          ...message,
          text: collaborationText,
          thinking: [message.thinking, finalResult.thinking?.trim()].filter(Boolean).join("\n\n") || undefined,
          status: "done",
        }));
        setConversation((current) => [
          ...current,
          {
            role: "assistant",
            content: collaborationText,
            timestamp: Date.now(),
          },
        ]);
        setCollaborationPhase("idle");
        return;
      }

      if (!effectiveProvider || !effectiveModel) {
        setChatError("请选择要使用的 LLM 和模型");
        return;
      }

      if (chatMode === "agent") {
        activeAgentMessageIdRef.current = assistantMessageId;
        lastAgentErrorRef.current = "";
        lastAgentStderrRef.current = "";
        const task = await codingAgent.startTask({
          workspacePath: workspace.path,
          prompt: buildAgentPrompt(
            text,
            referencedFiles,
            conversation,
            modelSource === "agent" ? selectedAgent : null,
          ),
          provider: toCodingAgentProviderConfig(effectiveProvider),
          model: toCodingAgentModelConfig(effectiveProvider, effectiveModel),
          allowedTools: normalizeAllowedAgentTools(allowedAgentTools),
          enabledSkills: enabledSkills.map((skill) => skill.name),
        });
        activeAgentTaskIdRef.current = task.taskId;
        setActiveAgentTaskId(task.taskId);
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          status: "streaming",
        }));
        return;
      }

      const result = await chatWithLlm({
        provider: effectiveProvider,
        model: effectiveModel,
        systemPrompt: buildSystemPrompt(
          workspace,
          activeFile,
          referencedFiles,
          enabledSkills,
          modelSource === "agent" ? selectedAgent : null,
        ),
        messages: nextConversation,
      });
      const assistantText = result.text.trim();

      updateMessage(assistantMessageId, (message) => ({
        ...message,
        text: assistantText,
        thinking: result.thinking?.trim() || undefined,
        status: "done",
      }));
      setConversation((current) => [
        ...current,
        {
          role: "assistant",
          content: assistantText,
          timestamp: Date.now(),
        },
      ]);
    } catch (caught) {
      const message = String(caught);
      setChatError(message);
      activeAgentTaskIdRef.current = "";
      activeAgentMessageIdRef.current = "";
      setActiveAgentTaskId("");
      updateMessage(assistantMessageId, (currentMessage) => ({
        ...currentMessage,
        text: message,
        status: "error",
      }));
    } finally {
      setIsSending(false);
      setCollaborationPhase("idle");
    }
  };

  const filePanel = (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/70 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">文件查看</h3>
            <p className="truncate text-xs text-muted-foreground">
              {filePath || "选择或新建一个文件"}
            </p>
          </div>
        </div>
        {isMarkdownFile && (
          <div className="flex h-9 rounded-md border border-input bg-muted/60 p-0.5 shadow-xs">
            <Button
              type="button"
              size="sm"
              variant={fileViewMode === "source" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => setFileViewMode("source")}
            >
              <FileType className="size-3.5" />
              <span>原文</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={fileViewMode === "preview" ? "secondary" : "ghost"}
              className="h-7 px-2"
              onClick={() => setFileViewMode("preview")}
            >
              <Eye className="size-3.5" />
              <span>预览</span>
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
        <Input
          value={filePath}
          onChange={(event) => setFilePath(event.currentTarget.value)}
          placeholder="例如：chapters/01.md"
        />
        {isMarkdownFile && fileViewMode === "preview" ? (
          <ScrollArea className="h-full min-h-0 flex-1 overflow-hidden rounded-md border border-input bg-card shadow-xs">
            <div className="mx-auto w-full max-w-4xl p-6">
              {fileContent.trim() ? (
                <MarkdownContent content={fileContent} />
              ) : (
                <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
                  暂无可预览内容
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          <Textarea
            value={fileContent}
            onChange={(event) => setFileContent(event.currentTarget.value)}
            placeholder="选择文件或输入新文件内容"
            className="min-h-0 flex-1 resize-none overflow-auto bg-card font-mono text-sm leading-6 shadow-xs"
          />
        )}
        {fileError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {fileError}
          </div>
        )}
      </div>

      <div className="flex justify-end border-t border-border/80 bg-card/80 px-5 py-3">
        <Button
          type="button"
          onClick={() => void saveFile()}
          disabled={isFileSaving || !filePath.trim()}
        >
          {isFileSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          <span>{activeFile ? "保存修改" : "创建文件"}</span>
        </Button>
      </div>
    </section>
  );

  const chatPanel = (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <ScrollArea className="h-full min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/35 px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
                {(modelSource === "agent" || chatMode === "collab") && selectedAgent ? (
                  <img
                    src={activeAgentAvatar.src}
                    alt=""
                    className="size-10 rounded-md"
                  />
                ) : (
                  <Bot className="size-6" />
                )}
              </span>
              <div className="space-y-1">
                <h3 className="text-base font-semibold">开始和工作区助手对话</h3>
                <p className="text-sm text-muted-foreground">
                  选择文件后提问，助手会把当前文件内容纳入上下文。
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const thinking = message.thinking?.trim();
              const isThinkingCollapsed =
                Boolean(thinking) &&
                message.status === "done" &&
                !expandedThinkingIds.has(message.id);
              const agentEvents = message.agentEvents?.filter(isTimelineEvent) ?? [];
              const agentEventGroups = groupAgentEvents(agentEvents);
              const isAgentEventsCollapsed =
                message.status === "done" && !expandedAgentEventIds.has(message.id);
              const visibleAgentEventGroups =
                message.status === "done" || expandedAgentEventIds.has(message.id)
                  ? agentEventGroups
                  : agentEventGroups.slice(-5);
              const hiddenAgentEventGroupCount =
                agentEventGroups.length - visibleAgentEventGroups.length;
              const agentErrorCount = agentEventGroups.filter((group) => group.status === "error").length;
              const isAssistantLoading =
                message.role === "assistant" &&
                (message.status === "loading" || message.status === "streaming") &&
                !message.text.trim();
              const messageAgentAvatar = resolveAgentAvatar(
                message.agentAvatar ?? (modelSource === "agent" ? selectedAgent?.avatar : null),
              );

              return (
                <div
                  key={message.id}
                  className="flex gap-3 data-[role=user]:justify-end"
                  data-role={message.role}
                >
                  {message.role === "assistant" && (
                    <div
                      className="mt-1 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/15 bg-accent text-primary shadow-xs"
                      title={message.agentName}
                    >
                      {message.mode === "agent" || message.agentAvatar ? (
                        <img
                          src={messageAgentAvatar.src}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Bot className="size-4" />
                      )}
                    </div>
                  )}
                  <div
                    className="max-w-[78%] rounded-md border px-3.5 py-2.5 text-sm leading-6 shadow-xs data-[role=assistant]:border-border/80 data-[role=assistant]:bg-card data-[role=user]:border-primary data-[role=user]:bg-primary data-[role=user]:text-primary-foreground"
                    data-role={message.role}
                  >
                    {message.role === "assistant" && thinking && (
                      <div className="mb-2 overflow-hidden rounded-md border border-border/70 bg-muted/35">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => toggleThinking(message.id)}
                        >
                          {isThinkingCollapsed ? (
                            <ChevronRight className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                          <Brain className="size-3.5" />
                          <span>Thinking</span>
                          {message.status !== "done" && (
                            <Loader2 className="ml-auto size-3 animate-spin" />
                          )}
                        </button>
                        {!isThinkingCollapsed && (
                          <div className="max-h-48 overflow-auto border-t border-border/60 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                            {thinking}
                          </div>
                        )}
                      </div>
                    )}

                    {message.role === "assistant" && agentEventGroups.length > 0 && (
                      <div className="mb-2 overflow-hidden rounded-md border border-border/70 bg-muted/35">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                          onClick={() => toggleAgentEvents(message.id)}
                        >
                          {isAgentEventsCollapsed ? (
                            <ChevronRight className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                          <Wrench className="size-3.5" />
                          <span>Agent 执行</span>
                          <span className="rounded-sm bg-background px-1.5 py-0.5 text-[11px]">
                            {agentEventGroups.length} 段
                          </span>
                          {agentErrorCount > 0 && (
                            <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                              {agentErrorCount} 个错误
                            </span>
                          )}
                          {(message.status === "loading" || message.status === "streaming") && (
                            <Loader2 className="ml-auto size-3 animate-spin" />
                          )}
                        </button>
                        {!isAgentEventsCollapsed && (
                          <div className="max-h-72 space-y-1.5 overflow-auto border-t border-border/60 px-2.5 py-2">
                            {hiddenAgentEventGroupCount > 0 && (
                              <div className="rounded-sm border border-dashed border-border/70 bg-background/60 px-2 py-1 text-xs text-muted-foreground">
                                已折叠较早的 {hiddenAgentEventGroupCount} 段执行过程，当前显示最近阶段。
                              </div>
                            )}
                            {visibleAgentEventGroups.map((group) => {
                              const latestEvent = group.events[group.events.length - 1];
                              const statusLabel =
                                group.status === "running"
                                  ? "执行中"
                                  : group.status === "done"
                                    ? "完成"
                                    : group.status === "error"
                                      ? "异常"
                                      : "信息";

                              return (
                                <details
                                  key={`${message.id}-${group.id}`}
                                  className="group rounded-sm border border-border/60 bg-background"
                                  open={group.status === "running" || group.status === "error"}
                                >
                                  <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                                    <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                      {group.title}
                                    </span>
                                    <span
                                      className={[
                                        "rounded-sm px-1.5 py-0.5 text-[11px]",
                                        group.status === "error"
                                          ? "bg-destructive/10 text-destructive"
                                          : group.status === "running"
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted text-muted-foreground",
                                      ].join(" ")}
                                    >
                                      {statusLabel}
                                    </span>
                                    <span className="text-[11px]">
                                      {group.events.length} 条
                                    </span>
                                  </summary>
                                  <div className="space-y-1 border-t border-border/50 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                                    {group.events.slice(-8).map((event, index) => (
                                      <div
                                        key={`${message.id}-${group.id}-${event.type}-${index}`}
                                        className="whitespace-pre-wrap break-words rounded-sm bg-muted/45 px-2 py-1"
                                      >
                                        {describeAgentGroupEvent(event)}
                                      </div>
                                    ))}
                                    {group.events.length > 8 && (
                                      <div className="rounded-sm bg-muted/35 px-2 py-1 text-[11px]">
                                        已省略本段较早的 {group.events.length - 8} 条更新。
                                      </div>
                                    )}
                                  </div>
                                  {latestEvent?.type === "tool_end" && latestEvent.isError && (
                                    <div className="border-t border-border/50 px-2 py-1 text-[11px] text-destructive">
                                      工具执行失败，请展开查看最后几条输出。
                                    </div>
                                  )}
                                </details>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {isAssistantLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        <span>
                          {message.mode === "collab"
                            ? "Agent 正在协作"
                            : message.mode === "agent" ? "Agent 正在处理" : "AI 正在思考"}
                        </span>
                      </div>
                      ) : (
                        message.role === "assistant" ? (
                          <MarkdownContent content={message.text} />
                        ) : (
                          <div className="space-y-2">
                            {message.referencedFiles && message.referencedFiles.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {message.referencedFiles.map((file) => (
                                  <span
                                    key={file.path}
                                    className="inline-flex max-w-full items-center gap-1 rounded-sm bg-primary-foreground/15 px-1.5 py-0.5 text-xs"
                                  >
                                    <Link className="size-3" />
                                    <span className="truncate">{file.path}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap">
                              {message.text}
                            </div>
                          </div>
                        )
                      )}
                  </div>
                  {message.role === "user" && (
                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-xs">
                      <User className="size-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border/80 bg-card/80 px-6 py-4 backdrop-blur">
        {(chatError || settingsError || skillsError || sessionsError) && (
          <div className="mx-auto mb-3 max-w-5xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {chatError || settingsError || skillsError || sessionsError}
          </div>
        )}
        {pendingAgentQuestion && (
          <form
            action="#"
            className="mx-auto mb-3 max-w-5xl rounded-md border border-primary/25 bg-primary/10 p-3 shadow-xs"
            onSubmit={(event) => void answerAgentQuestion(event)}
          >
            <div className="mb-2 flex items-start gap-2">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                <MessageSquare className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {pendingAgentQuestion.input?.label || "Agent 需要你的回答"}
                </div>
                {pendingAgentQuestion.context && (
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {pendingAgentQuestion.context}
                  </div>
                )}
                <div className="mt-1 whitespace-pre-wrap text-sm leading-6">
                  {pendingAgentQuestion.question}
                </div>
              </div>
            </div>
            {pendingAgentQuestion.input?.type === "select" &&
            (pendingAgentQuestion.input.options?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {(pendingAgentQuestion.input.options ?? []).map((option) => {
                    const isSelected = agentQuestionAnswer === option.value;
                    const isOther = option.value === "other";

                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={[
                          "rounded-md border bg-background px-3 py-2 text-left text-sm shadow-xs transition-colors hover:border-primary/45 hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          isSelected ? "border-primary bg-primary/10 text-primary" : "border-border",
                        ].join(" ")}
                        disabled={isAnsweringAgentQuestion}
                        onClick={() => {
                          setAgentQuestionAnswer(option.value);
                          if (!isOther) {
                            void submitAgentQuestionAnswer(option.value);
                          }
                        }}
                      >
                        <span className="block font-medium">{option.label}</span>
                        {option.description && (
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {agentQuestionAnswer === "other" && (
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={customAgentQuestionAnswer}
                      onChange={(event) => setCustomAgentQuestionAnswer(event.currentTarget.value)}
                      placeholder="请输入自定义答案"
                      rows={2}
                      className="min-h-14 flex-1 resize-none bg-background shadow-xs"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                    />
                    <Button
                      type="submit"
                      disabled={isAnsweringAgentQuestion || !customAgentQuestionAnswer.trim()}
                    >
                      {isAnsweringAgentQuestion ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      <span>回复</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  value={agentQuestionAnswer}
                  onChange={(event) => setAgentQuestionAnswer(event.currentTarget.value)}
                  placeholder="直接回答这个问题，Agent 会继续执行"
                  rows={2}
                  className="min-h-14 flex-1 resize-none bg-background shadow-xs"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={isAnsweringAgentQuestion || !agentQuestionAnswer.trim()}
                >
                  {isAnsweringAgentQuestion ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  <span>回复</span>
                </Button>
              </div>
            )}
          </form>
        )}
        <ChatComposer
          files={files}
          resetKey={composerResetKey}
          isSending={isSending}
          activeAgentTaskId={activeAgentTaskId}
          isSettingsLoading={isSettingsLoading}
          chatMode={chatMode}
          modelSource={modelSource}
          agentProfiles={agentProfiles}
          providers={providers}
          selectedProvider={selectedProvider}
          selectedProviderId={selectedProviderId}
          selectedModels={selectedModels}
          selectedModel={selectedModel}
          selectedAgent={selectedAgent}
          reviewerAgent={reviewerAgent}
          onChatModeChange={setChatMode}
          onModelSourceChange={setModelSource}
          onSelectedAgentChange={setSelectedAgentId}
          onReviewerAgentChange={setSelectedReviewerAgentId}
          onProviderChange={(providerId) => {
            const provider = providers.find((item) => item.id === providerId);
            setSelectedProviderId(providerId);
            setSelectedModelId(provider?.models.find((model) => model.isEnabled)?.id ?? "");
          }}
          onModelChange={setSelectedModelId}
          onSubmit={(input) => void sendMessage(input)}
        />
      </div>
    </section>
  );

  return (
    <main className="flex h-screen min-h-screen bg-muted/35 text-foreground">
      <SkillsDialog
        open={isSkillsDialogOpen}
        skills={skills}
        enabledSkillNames={enabledSkillNames}
        isLoading={isSkillsLoading}
        isSaving={isSkillsSaving}
        error={skillsError}
        onOpenChange={handleSkillsDialogOpenChange}
        onToggleSkill={toggleWorkspaceSkill}
        onSave={() => void saveSkills()}
      />
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border px-4 py-4">
          <Button type="button" variant="ghost" onClick={onBack} className="mb-4 px-2">
            <ArrowLeft className="size-4" />
            <span>工作区</span>
          </Button>
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-xl font-semibold">{workspace.name}</h1>
            <p className="truncate rounded-sm bg-sidebar-accent px-2 py-1 font-mono text-xs text-sidebar-accent-foreground/80">
              {workspace.path}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-sidebar-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="size-4" />
                <span>聊天记录</span>
                {isSessionSaving && (
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="刷新聊天记录"
                  disabled={isSessionsLoading}
                  onClick={() => void loadSessions()}
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="新建聊天"
                  onClick={startNewSession}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-56 space-y-1 overflow-auto px-2.5 pb-3">
              {messages.length > 0 && !currentSessionId && (
                <div className="rounded-md border border-primary/20 bg-card px-2.5 py-2 text-sm">
                  <div className="truncate font-medium">{currentSessionTitle}</div>
                  <div className="mt-1 text-xs text-muted-foreground">正在保存新聊天</div>
                </div>
              )}
              {isSessionsLoading ? (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  正在读取聊天记录
                </div>
              ) : chatSessions.length ? (
                chatSessions.map((session) => (
                  <div
                    key={session.id}
                    className="group flex items-center gap-1 rounded-md border border-transparent transition-colors hover:border-sidebar-border hover:bg-sidebar-accent data-[active=true]:border-primary/25 data-[active=true]:bg-card"
                    data-active={session.id === currentSessionId}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-2.5 py-2 text-left focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
                      onClick={() => void loadSessionById(session.id)}
                    >
                      <div className="truncate text-sm font-medium">{session.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatSessionTime(session.updatedAt)}</span>
                        <span>{session.messageCount} 条</span>
                      </div>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="永久删除聊天"
                      className="mr-1 size-7 opacity-70 hover:text-destructive group-hover:opacity-100"
                      onClick={() => void removeSession(session.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  暂无聊天记录
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Folder className="size-4" />
              <span>文件</span>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="刷新文件"
                onClick={() => void loadFiles()}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="新建文件"
                onClick={prepareNewFile}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2.5">
              {isFilesLoading ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  正在读取文件
                </div>
              ) : selectableFiles.length ? (
                selectableFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-left text-sm transition-colors hover:border-sidebar-border hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none data-[active=true]:border-primary/25 data-[active=true]:bg-card"
                    data-active={file.path === activeFile?.path}
                    onClick={() => void openFile(file.path)}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                  </button>
                ))
              ) : (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  暂无可编辑文件
                </div>
              )}
            </div>
          </ScrollArea>
          {chatMode === "collab" && (
            <CollaborationStatusPanel
              writerAgent={selectedAgent}
              reviewerAgent={reviewerAgent}
              phase={collaborationPhase}
            />
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 bg-card/80 px-6 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
              {workspaceView === "file" ? (
                <FileText className="size-4" />
              ) : workspaceView === "split" ? (
                <Columns3 className="size-4" />
              ) : (
                <MessageSquare className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold">
                {workspaceView === "file"
                  ? "文件工作台"
                  : workspaceView === "split"
                    ? "拆分工作台"
                    : "AI 工作台"}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {currentSessionTitle !== DEFAULT_SESSION_TITLE
                  ? `${currentSessionTitle} · `
                  : ""}
                {modelSource === "agent" && selectedAgent
                  ? `当前 Agent：${selectedAgent.name} / ${effectiveProvider?.name ?? "未选择"} / ${effectiveModel?.modelName ?? "未选择"}`
                  : `当前模型：${effectiveProvider?.name ?? "未选择"} / ${effectiveModel?.modelName ?? "未选择"}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex h-9 rounded-md border border-input bg-muted/60 p-0.5 shadow-xs">
              <Button
                type="button"
                size="sm"
                variant={workspaceView === "chat" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setWorkspaceView("chat")}
              >
                <MessageSquare className="size-3.5" />
                <span>聊天</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={workspaceView === "file" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setWorkspaceView("file")}
              >
                <FileText className="size-3.5" />
                <span>文件</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={workspaceView === "split" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setWorkspaceView("split")}
              >
                <Columns3 className="size-3.5" />
                <span>拆分</span>
              </Button>
            </div>

            {workspaceView !== "file" && (
              <>
                {chatMode === "agent" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant={allowedAgentTools.length === DEFAULT_ALLOWED_AGENT_TOOLS.length ? "outline" : "secondary"}
                        title="Agent 工具"
                      >
                        <Wrench className="size-4" />
                        <span>工具</span>
                        <span className="rounded-sm bg-background/70 px-1.5 py-0.5 text-[11px]">
                          {allowedAgentTools.length}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuLabel>Agent 工具</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {AGENT_TOOL_DEFINITIONS.map((tool) => (
                        <DropdownMenuCheckboxItem
                          key={tool.name}
                          checked={allowedAgentTools.includes(tool.name)}
                          onCheckedChange={(checked) => toggleAllowedAgentTool(tool.name, checked)}
                          title={tool.description}
                        >
                          {tool.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant={enabledSkills.length > 0 ? "secondary" : "outline"}
                  title="工作区 Skills"
                  onClick={() => setIsSkillsDialogOpen(true)}
                >
                  {isSkillsLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  <span>Skills</span>
                  {enabledSkills.length > 0 && (
                    <span className="rounded-sm bg-background/70 px-1.5 py-0.5 text-[11px]">
                      {enabledSkills.length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="刷新 LLM 与 Agent 配置"
                  onClick={() => void loadLlmOptions()}
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Badge variant={(chatMode === "collab" && selectedAgent && reviewerAgent) || (effectiveProvider && effectiveModel) ? "secondary" : "outline"}>
                  {chatMode === "collab" && selectedAgent && reviewerAgent
                    ? `${selectedAgent.name} + ${reviewerAgent.name}`
                    : effectiveProvider && effectiveModel
                      ? modelSource === "agent" && selectedAgent
                      ? selectedAgent.name
                      : chatMode === "agent" ? codingAgent.name : "后端请求"
                    : "待配置"}
                </Badge>
                {activeAgentTaskId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void codingAgent.abortTask(activeAgentTaskId)}
                  >
                    停止
                  </Button>
                )}
              </>
            )}
          </div>
        </header>

        {workspaceView === "split" ? (
          <div className="grid min-h-0 flex-1 overflow-hidden grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
            <div className="min-h-0 overflow-hidden border-r border-border/80">
              {filePanel}
            </div>
            <div className="min-h-0 overflow-hidden">
              {chatPanel}
            </div>
          </div>
        ) : workspaceView === "file" ? (
          filePanel
        ) : (
          chatPanel
        )}
      </section>
    </main>
  );
};
