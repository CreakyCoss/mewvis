import type { FormEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  FileText,
  GitBranch,
  Link,
  Loader2,
  MessageSquare,
  Orbit,
  Send,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import {
  AGENT_TOOL_DEFINITIONS,
  type AgentRuntimeAgentDefinition,
  type AgentToolName,
} from "@/ai/agent-runtime/contracts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  AgentProfile,
  CollaborationWorkflowProfile,
} from "@/features/agent-settings/types";
import type { RuntimeModelOption } from "@/stores/llm-runtime-model";
import type {
  ChatExecutionMode,
  ChatMode,
  ComposerSubmitInput,
  ModelSource,
} from "../../page-types";
import type { WorkspaceFileEntry } from "../../types";
import {
  filterChatAgentAllowedTools,
  isAgentTaskMode,
  isChatAgentRestrictedTool,
} from "../../utils/chat-mode";
import {
  getActiveReferenceToken,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "../../utils/references";

type ComposerProps = {
  files: WorkspaceFileEntry[];
  resetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  chatMode: ChatMode;
  chatExecutionMode: ChatExecutionMode;
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
  effectiveContextWindow: number;
  modelSource: ModelSource;
  runtimeAgents: readonly AgentRuntimeAgentDefinition[];
  selectedRuntimeAgent: AgentRuntimeAgentDefinition | null;
  selectedRuntimeAgentId: string;
  agentProfiles: AgentProfile[];
  runtimeModels: RuntimeModelOption[];
  selectedRuntimeModelId: string;
  selectedRuntimeModel: RuntimeModelOption | null;
  selectedAgent: AgentProfile | null;
  collaborationWorkflows: CollaborationWorkflowProfile[];
  selectedCollaborationWorkflow: CollaborationWorkflowProfile | null;
  selectedCollaborationWorkflowId: string;
  allowedAgentTools: AgentToolName[];
  onChatModeChange: (mode: ChatMode) => void;
  onChatExecutionModeChange: (mode: ChatExecutionMode) => void;
  onShowThinkingProcessChange: (value: boolean) => void;
  onShowToolCallProcessChange: (value: boolean) => void;
  onModelSourceChange: (source: ModelSource) => void;
  onRuntimeAgentChange: (agentId: string) => void;
  onSelectedAgentChange: (agentId: string) => void;
  onCollaborationWorkflowChange: (workflowId: string) => void;
  onRuntimeModelChange: (id: string) => void;
  onToggleAllowedAgentTool: (toolId: AgentToolName, enabled: boolean) => void;
  onSubmit: (input: ComposerSubmitInput) => void;
  onAbortTask: () => void;
};

type RuntimeModelGroup = {
  providerId: string;
  providerName: string;
  models: RuntimeModelOption[];
};

const groupRuntimeModelsByProvider = (
  runtimeModels: RuntimeModelOption[],
): RuntimeModelGroup[] => {
  const groups: RuntimeModelGroup[] = [];

  for (const model of runtimeModels) {
    let group = groups.find((item) => item.providerId === model.provider.id);
    if (!group) {
      group = {
        providerId: model.provider.id,
        providerName: model.provider.name,
        models: [],
      };
      groups.push(group);
    }
    group.models.push(model);
  }

  return groups;
};

const formatContextWindowLabel = (tokens: number) => {
  if (tokens >= 1000000) {
    const value = tokens / 1000000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}M`;
  }

  return `${Math.round(tokens / 1000)}k`;
};

export const Composer = memo(({
  files,
  resetKey,
  isSending,
  activeAgentTaskId,
  isSettingsLoading,
  chatMode,
  chatExecutionMode,
  showThinkingProcess,
  showToolCallProcess,
  effectiveContextWindow,
  modelSource,
  runtimeAgents,
  selectedRuntimeAgent,
  selectedRuntimeAgentId,
  agentProfiles,
  runtimeModels,
  selectedRuntimeModelId,
  selectedRuntimeModel,
  selectedAgent,
  collaborationWorkflows,
  selectedCollaborationWorkflow,
  selectedCollaborationWorkflowId,
  allowedAgentTools,
  onChatModeChange,
  onChatExecutionModeChange,
  onShowThinkingProcessChange,
  onShowToolCallProcessChange,
  onModelSourceChange,
  onRuntimeAgentChange,
  onSelectedAgentChange,
  onCollaborationWorkflowChange,
  onRuntimeModelChange,
  onToggleAllowedAgentTool,
  onSubmit,
  onAbortTask,
}: ComposerProps) => {
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
  const modeLabel =
    chatMode === "collab" ? "协作" : chatMode === "agent" ? "Agent" : "聊天";
  const isAgentExecution = isAgentTaskMode(chatMode, chatExecutionMode);
  const isRestrictedChatAgent = chatMode === "chat" && chatExecutionMode === "agent";
  const visibleAllowedAgentTools = isRestrictedChatAgent
    ? filterChatAgentAllowedTools(allowedAgentTools)
    : allowedAgentTools;
  const runtimeModelGroups = useMemo(
    () => groupRuntimeModelsByProvider(runtimeModels),
    [runtimeModels],
  );
  const runtimeAgentRequiresModel = selectedRuntimeAgent?.requiresModel ?? true;
  const selectedModelLabel = chatMode === "collab"
    ? selectedCollaborationWorkflow?.name ?? "选择协作流程"
    : modelSource === "agent"
      ? selectedAgent?.name ?? "选择角色"
      : selectedRuntimeModel
        ? selectedRuntimeModel.modelName
        : "选择模型";
  const modelLabel = chatMode !== "collab" && !runtimeAgentRequiresModel
    ? "无需模型"
    : selectedModelLabel;
  const runtimeAgentLabel = selectedRuntimeAgent?.label ?? "运行时";
  const enabledProcessOptionLabel = [
    showThinkingProcess ? "思考" : "",
    showToolCallProcess ? "工具" : "",
    chatMode === "chat" && chatExecutionMode === "agent" ? "Agent" : "",
  ].filter(Boolean).join("/");
  const effectiveContextWindowLabel = formatContextWindowLabel(effectiveContextWindow);
  const isAgentRunning = Boolean(activeAgentTaskId);
  const submitButtonLabel = isAgentRunning
    ? "停止"
    : isSending
      ? "处理中"
      : "发送";
  const canSubmit = Boolean(prompt.trim()) && !isSending && !activeAgentTaskId;
  const submitButtonClassName = [
    "size-9 shrink-0 rounded-full bg-background shadow-[0_6px_18px_oklch(0_0_0_/_10%)] disabled:opacity-100",
    "transition-all hover:-translate-y-px focus-visible:ring-primary/25 active:translate-y-px",
    isAgentRunning || isSending || canSubmit
      ? "text-primary hover:bg-primary/5 hover:text-primary"
      : "text-muted-foreground/45 shadow-xs hover:bg-background",
  ].join(" ");
  const toggleMenuItemClassName = "flex items-center justify-between gap-3 py-2";

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
              className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-primary"
            >
              <Link className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{file.path}</span>
            </span>
          ))}
          {unresolvedFileReferences.map((match) => (
            <span
              key={`missing-${match.token}`}
              className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive"
            >
              <span className="min-w-0 flex-1 truncate">未找到 @{match.token}</span>
            </span>
          ))}
          {ambiguousFileReferences.map((match) => (
            <span
              key={`ambiguous-${match.token}`}
              className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md bg-muted px-2 py-1 text-muted-foreground shadow-xs"
              title={match.matches.map((file) => file.path).join("\n")}
            >
              <span className="min-w-0 flex-1 truncate">@{match.token} 匹配 {match.matches.length} 个文件</span>
            </span>
          ))}
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-[69rem] px-3">
        <form
          action="#"
          className="relative flex w-full flex-col overflow-hidden rounded-xl bg-card shadow-[0_14px_34px_-30px_rgb(15_23_42_/_0.34),0_2px_8px_-7px_rgb(15_23_42_/_0.18),0_1px_2px_rgb(15_23_42_/_0.06)] ring-1 ring-border/40 focus-within:ring-3 focus-within:ring-ring/20"
          onSubmit={submitPrompt}
        >
        <div className="relative min-w-0">
          {activeReferenceToken && (
            <div className="absolute right-0 bottom-[calc(100%+0.5rem)] left-0 z-20 overflow-hidden rounded-md bg-popover text-popover-foreground shadow-lg">
              <div className="bg-muted/35 px-2.5 py-1.5 text-xs text-muted-foreground">
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
                      className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
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
            className="max-h-40 min-h-24 resize-none border-0 bg-transparent px-4 py-3 text-base shadow-none focus-visible:ring-0"
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  {chatMode === "collab" ? (
                    <Sparkles className="size-3.5" />
                  ) : chatMode === "agent" ? (
                    <Bot className="size-3.5" />
                  ) : (
                    <MessageSquare className="size-3.5" />
                  )}
                  <span>{modeLabel}</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuLabel>模式</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={chatMode} onValueChange={(value) => onChatModeChange(value as ChatMode)}>
                  <DropdownMenuRadioItem value="chat">聊天</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="agent">Agent</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="collab" disabled={collaborationWorkflows.length === 0}>
                    协作
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 min-w-0 max-w-[18rem] px-2 text-xs"
                  title={`${chatMode === "collab" ? "协作流程" : "模型"}：${modelLabel} / 上下文：${effectiveContextWindowLabel}`}
                >
                  <Orbit className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{modelLabel}</span>
                  {effectiveContextWindow !== 200000 && (
                    <>
                      <span className="shrink-0 text-muted-foreground">·</span>
                      <span className="shrink-0 text-muted-foreground">{effectiveContextWindowLabel}</span>
                    </>
                  )}
                  <ChevronDown className="size-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>模型配置</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {chatMode === "collab" ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                      disabled={isSettingsLoading}
                      title={selectedModelLabel}
                    >
                      <GitBranch className="size-3.5" />
                      <span className="min-w-0 flex-1 truncate">协作流程</span>
                      <span className="max-w-32 truncate text-xs text-muted-foreground">{selectedModelLabel}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                      {collaborationWorkflows.length === 0 ? (
                        <DropdownMenuItem disabled>未配置协作流程</DropdownMenuItem>
                      ) : (
                        <DropdownMenuRadioGroup
                          value={selectedCollaborationWorkflowId}
                          onValueChange={onCollaborationWorkflowChange}
                        >
                          {collaborationWorkflows.map((workflow) => (
                            <DropdownMenuRadioItem
                              key={workflow.id}
                              value={workflow.id}
                              title={workflow.description ?? undefined}
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{workflow.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {workflow.writerAgent.name} + {workflow.reviewerAgent.name}
                                </span>
                              </span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                      disabled={isSettingsLoading}
                      title={selectedModelLabel}
                    >
                      <Orbit className="size-3.5" />
                      <span className="min-w-0 flex-1 truncate">模型</span>
                      <span className="max-w-32 truncate text-xs text-muted-foreground">{selectedModelLabel}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-56">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Orbit className="size-3.5" />
                          模型
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-52">
                          {runtimeModelGroups.length === 0 ? (
                            <DropdownMenuItem disabled>未配置 LLM</DropdownMenuItem>
                          ) : (
                            runtimeModelGroups.map((provider) => {
                              return (
                                <DropdownMenuSub key={provider.providerId}>
                                  <DropdownMenuSubTrigger>{provider.providerName}</DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="w-56">
                                    {provider.models.length === 0 ? (
                                      <DropdownMenuItem disabled>未启用模型</DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuRadioGroup
                                        value={selectedRuntimeModel?.provider.id === provider.providerId ? selectedRuntimeModelId : ""}
                                        onValueChange={(value) => {
                                          onModelSourceChange("direct");
                                          onRuntimeModelChange(value);
                                        }}
                                      >
                                        {provider.models.map((model) => (
                                          <DropdownMenuRadioItem key={model.id} value={model.id}>
                                            <span className="truncate">{model.modelName}</span>
                                          </DropdownMenuRadioItem>
                                        ))}
                                      </DropdownMenuRadioGroup>
                                    )}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              );
                            })
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      {agentProfiles.length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Bot className="size-3.5" />
                            角色
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-56">
                            <DropdownMenuRadioGroup
                              value={modelSource === "agent" ? selectedAgent?.id ?? "" : ""}
                              onValueChange={(value) => {
                                onModelSourceChange("agent");
                                onSelectedAgentChange(value);
                              }}
                            >
                              {agentProfiles.map((agent) => (
                                <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                                  <span className="truncate">{agent.name}</span>
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger title={runtimeAgentLabel}>
                    <Bot className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">执行</span>
                    <span className="max-w-28 truncate text-xs text-muted-foreground">{runtimeAgentLabel}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-60">
                    <DropdownMenuRadioGroup value={selectedRuntimeAgentId} onValueChange={onRuntimeAgentChange}>
                      {runtimeAgents.map((agent) => (
                        <DropdownMenuRadioItem
                          key={agent.id}
                          value={agent.id}
                          title={agent.description}
                        >
                          <span className="truncate">{agent.label}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Wrench className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">过程</span>
                    <span className="max-w-28 truncate text-xs text-muted-foreground">
                      {enabledProcessOptionLabel || "无"}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    <DropdownMenuItem
                      className={toggleMenuItemClassName}
                      onSelect={(event) => {
                        event.preventDefault();
                        onShowThinkingProcessChange(!showThinkingProcess);
                      }}
                    >
                      <span className="min-w-0 flex-1">思考过程</span>
                      <Switch
                        size="sm"
                        checked={showThinkingProcess}
                        aria-label="思考过程"
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={onShowThinkingProcessChange}
                      />
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={toggleMenuItemClassName}
                      onSelect={(event) => {
                        event.preventDefault();
                        onShowToolCallProcessChange(!showToolCallProcess);
                      }}
                    >
                      <span className="min-w-0 flex-1">工具调用过程</span>
                      <Switch
                        size="sm"
                        checked={showToolCallProcess}
                        aria-label="工具调用过程"
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={onShowToolCallProcessChange}
                      />
                    </DropdownMenuItem>
                    {chatMode === "chat" && (
                      <DropdownMenuItem
                        className={toggleMenuItemClassName}
                        onSelect={(event) => {
                          event.preventDefault();
                          onChatExecutionModeChange(chatExecutionMode === "agent" ? "direct" : "agent");
                        }}
                      >
                        <span className="min-w-0 flex-1">Agent 执行</span>
                        <Switch
                          size="sm"
                          checked={chatExecutionMode === "agent"}
                          aria-label="Agent 执行"
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) =>
                            onChatExecutionModeChange(checked ? "agent" : "direct")
                          }
                        />
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={!isAgentExecution}
                >
                  <Wrench className="size-3.5" />
                  <span>工具</span>
                  <span className="text-muted-foreground">{visibleAllowedAgentTools.length}</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel>工具</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {AGENT_TOOL_DEFINITIONS.map((tool) => {
                  const isRestrictedTool = isRestrictedChatAgent && isChatAgentRestrictedTool(tool.name);

                  return (
                    <DropdownMenuCheckboxItem
                      key={tool.name}
                      checked={!isRestrictedTool && allowedAgentTools.includes(tool.name)}
                      disabled={isRestrictedTool}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) => onToggleAllowedAgentTool(tool.name, checked)}
                      title={isRestrictedTool
                        ? `${tool.description}。聊天 Agent 不允许修改文件或运行命令。`
                        : tool.description}
                    >
                      {tool.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button
            type={isAgentRunning ? "button" : "submit"}
            size="icon"
            className={submitButtonClassName}
            variant="outline"
            disabled={isAgentRunning ? false : isSending || !prompt.trim()}
            title={submitButtonLabel}
            onClick={isAgentRunning ? onAbortTask : undefined}
          >
            {isAgentRunning ? (
              <Square className="size-3.5 fill-current" />
            ) : isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span className="sr-only">{submitButtonLabel}</span>
          </Button>
        </div>
        </form>
      </div>
    </>
  );
});
Composer.displayName = "Composer";
