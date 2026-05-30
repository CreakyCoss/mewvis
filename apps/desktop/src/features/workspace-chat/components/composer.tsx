import type { FormEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  Gauge,
  Link,
  Loader2,
  MessageSquare,
  Plug,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  AGENT_TOOL_DEFINITIONS,
  type AgentRuntimeAgentDefinition,
  type AgentToolName,
} from "@/agent-runtime/contracts";
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
import { Textarea } from "@/components/ui/textarea";
import type { AgentProfile } from "@/features/agent-settings/types";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type {
  ChatMode,
  ComposerSubmitInput,
  ContextWindowPreset,
  ModelSource,
} from "../page-types";
import type { WorkspaceFileEntry } from "../types";
import {
  getActiveReferenceToken,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "../utils/references";

type ComposerProps = {
  files: WorkspaceFileEntry[];
  resetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  chatMode: ChatMode;
  contextWindowPreset: ContextWindowPreset;
  modelSource: ModelSource;
  runtimeAgents: readonly AgentRuntimeAgentDefinition[];
  selectedRuntimeAgent: AgentRuntimeAgentDefinition | null;
  selectedRuntimeAgentId: string;
  agentProfiles: AgentProfile[];
  providers: LlmProvider[];
  selectedProviderId: string;
  selectedModel: ProviderModel | null;
  selectedAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  allowedAgentTools: AgentToolName[];
  onChatModeChange: (mode: ChatMode) => void;
  onContextWindowPresetChange: (preset: ContextWindowPreset) => void;
  onModelSourceChange: (source: ModelSource) => void;
  onRuntimeAgentChange: (agentId: string) => void;
  onSelectedAgentChange: (agentId: string) => void;
  onReviewerAgentChange: (agentId: string) => void;
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
  onToggleAllowedAgentTool: (toolId: AgentToolName, enabled: boolean) => void;
  onSubmit: (input: ComposerSubmitInput) => void;
};

export const Composer = memo(({
  files,
  resetKey,
  isSending,
  activeAgentTaskId,
  isSettingsLoading,
  chatMode,
  contextWindowPreset,
  modelSource,
  runtimeAgents,
  selectedRuntimeAgent,
  selectedRuntimeAgentId,
  agentProfiles,
  providers,
  selectedProviderId,
  selectedModel,
  selectedAgent,
  reviewerAgent,
  allowedAgentTools,
  onChatModeChange,
  onContextWindowPresetChange,
  onModelSourceChange,
  onRuntimeAgentChange,
  onSelectedAgentChange,
  onReviewerAgentChange,
  onProviderChange,
  onModelChange,
  onToggleAllowedAgentTool,
  onSubmit,
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
  const runtimeAgentRequiresModel = selectedRuntimeAgent?.requiresModel ?? true;
  const modelLabel = chatMode !== "collab" && !runtimeAgentRequiresModel
    ? "无需模型"
    : chatMode === "collab" && selectedAgent && reviewerAgent
    ? `${selectedAgent.name} + ${reviewerAgent.name}`
    : modelSource === "agent"
      ? selectedAgent?.name ?? "选择 Agent"
      : selectedModel?.modelName || selectedModel?.modelId || "选择模型";
  const runtimeAgentLabel = selectedRuntimeAgent?.label ?? "运行时";
  const contextWindowLabel = contextWindowPreset === 1000000 ? "1M" : "200k";

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

      <form
        action="#"
        className="mx-auto flex max-w-5xl flex-col overflow-hidden rounded-xl border border-input bg-card shadow-sm focus-within:ring-3 focus-within:ring-ring/25"
        onSubmit={submitPrompt}
      >
        <div className="relative min-w-0">
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
                    <Wrench className="size-3.5" />
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
                  <DropdownMenuRadioItem value="collab" disabled={agentProfiles.length === 0}>
                    协作
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  <Gauge className="size-3.5" />
                  <span>{contextWindowLabel}</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel>上下文窗口</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={String(contextWindowPreset)}
                  onValueChange={(value) => {
                    onContextWindowPresetChange(value === "1000000" ? 1000000 : 200000);
                  }}
                >
                  <DropdownMenuRadioItem value="200000">200k tokens</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="1000000">1M tokens</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 max-w-48 px-2 text-xs"
                  disabled={isSettingsLoading || (chatMode !== "collab" && !runtimeAgentRequiresModel)}
                  title={modelLabel}
                >
                  <span className="truncate">{modelLabel}</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>模型选择</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {agentProfiles.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Agent</DropdownMenuSubTrigger>
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
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>模型</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-52">
                    {providers.length === 0 ? (
                      <DropdownMenuItem disabled>未配置 LLM</DropdownMenuItem>
                    ) : (
                      providers.map((provider) => {
                        const enabledModels = provider.models.filter((model) => model.isEnabled);

                        return (
                          <DropdownMenuSub key={provider.id}>
                            <DropdownMenuSubTrigger>{provider.name}</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-56">
                              {enabledModels.length === 0 ? (
                                <DropdownMenuItem disabled>未启用模型</DropdownMenuItem>
                              ) : (
                                <DropdownMenuRadioGroup
                                  value={selectedProviderId === provider.id ? selectedModel?.id ?? "" : ""}
                                  onValueChange={(value) => {
                                    onModelSourceChange("direct");
                                    onProviderChange(provider.id);
                                    onModelChange(value);
                                  }}
                                >
                                  {enabledModels.map((model) => (
                                    <DropdownMenuRadioItem key={model.id} value={model.id}>
                                      <span className="truncate">{model.modelName || model.modelId}</span>
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
                {chatMode === "collab" && agentProfiles.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>写作 Agent</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                        <DropdownMenuRadioGroup value={selectedAgent?.id ?? ""} onValueChange={onSelectedAgentChange}>
                          {agentProfiles.map((agent) => (
                            <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                              <span className="truncate">{agent.name}</span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>审查 Agent</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-56">
                        <DropdownMenuRadioGroup value={reviewerAgent?.id ?? ""} onValueChange={onReviewerAgentChange}>
                          {agentProfiles.map((agent) => (
                            <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                              <span className="truncate">{agent.name}</span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="h-8 max-w-44 px-2 text-xs">
                  <Plug className="size-3.5" />
                  <span className="truncate">{runtimeAgentLabel}</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>运行时 Agent</DropdownMenuLabel>
                <DropdownMenuSeparator />
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
              </DropdownMenuContent>
            </DropdownMenu>

            {chatMode === "agent" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
                    <Wrench className="size-3.5" />
                    <span>工具 {allowedAgentTools.length}</span>
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuLabel>Agent 工具</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {AGENT_TOOL_DEFINITIONS.map((tool) => (
                    <DropdownMenuCheckboxItem
                      key={tool.name}
                      checked={allowedAgentTools.includes(tool.name)}
                      onCheckedChange={(checked) => onToggleAllowedAgentTool(tool.name, checked)}
                      title={tool.description}
                    >
                      {tool.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            disabled={isSending || Boolean(activeAgentTaskId) || !prompt.trim()}
            title={isSending || activeAgentTaskId ? "处理中" : "发送"}
          >
            {isSending || activeAgentTaskId ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            <span className="sr-only">{isSending || activeAgentTaskId ? "处理中" : "发送"}</span>
          </Button>
        </div>
      </form>
    </>
  );
});
Composer.displayName = "Composer";
