import type { FormEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  FileText,
  Link,
  Loader2,
  Orbit,
  Send,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import {
  type AgentToolSummary,
} from "@/agent-client/types";
import {
  getActiveReferenceToken,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "@/features/ai/components/context-tools";
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
} from "@/features/pages/settings/agent/types";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import {
  ALL_SKILLS_GROUP_ID,
  NO_SKILLS_GROUP_ID,
} from "@/features/pages/skills/constants";
import type { WorkspaceSkillGroup } from "@/features/pages/skills/types";
import type { ComposerSubmitInput } from "../../types";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";

type ComposerProps = {
  files: WorkspaceFileEntry[];
  resetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
  agentProfiles: AgentProfile[];
  runtimeModels: RuntimeModelOption[];
  selectedRuntimeModelId: string;
  selectedRuntimeModel: RuntimeModelOption | null;
  selectedAgent: AgentProfile | null;
  agentTools: readonly AgentToolSummary[];
  allowedAgentTools: string[];
  skillGroups: WorkspaceSkillGroup[];
  defaultSkillGroupId: string;
  selectedSkillGroupIds: string[];
  selectedSkillGroupLabel: string;
  onShowThinkingProcessChange: (value: boolean) => void;
  onShowToolCallProcessChange: (value: boolean) => void;
  onSelectedAgentChange: (agentId: string) => void;
  onRuntimeModelChange: (id: string) => void;
  onToggleAllowedAgentTool: (toolId: string, enabled: boolean) => void;
  onSkillGroupChange: (skillGroupId: string, checked: boolean) => void;
  onSubmit: (input: ComposerSubmitInput) => void;
  onAbortTask: () => void;
};

const formatRuntimeModelLabel = (model: RuntimeModelOption) =>
  `${model.provider.name}/${model.modelName}`;

const formatRuntimeModelTitle = (model: RuntimeModelOption) =>
  `${model.provider.name} / ${model.modelName}`;

const NO_AGENT_PROFILE_ID = "__no_agent_profile__";

export const Composer = memo(({
  files,
  resetKey,
  isSending,
  activeAgentTaskId,
  isSettingsLoading,
  showThinkingProcess,
  showToolCallProcess,
  agentProfiles,
  runtimeModels,
  selectedRuntimeModelId,
  selectedRuntimeModel,
  selectedAgent,
  agentTools,
  allowedAgentTools,
  skillGroups,
  defaultSkillGroupId,
  selectedSkillGroupIds,
  selectedSkillGroupLabel,
  onShowThinkingProcessChange,
  onShowToolCallProcessChange,
  onSelectedAgentChange,
  onRuntimeModelChange,
  onToggleAllowedAgentTool,
  onSkillGroupChange,
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
  const visibleAllowedAgentTools = allowedAgentTools;
  const selectedModelLabel = selectedRuntimeModel
    ? selectedRuntimeModel.modelName
    : "选择模型";
  const selectedModelTitle = selectedRuntimeModel
    ? formatRuntimeModelTitle(selectedRuntimeModel)
    : selectedModelLabel;
  const selectedAgentLabel = selectedAgent?.name ?? "不使用角色";
  const modelMenuLabel = selectedAgent
    ? `${selectedModelLabel} · ${selectedAgent.name}`
    : selectedModelLabel;
  const enabledProcessOptionLabel = [
    showThinkingProcess ? "思考" : "",
    showToolCallProcess ? "工具" : "",
  ].filter(Boolean).join("/");
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 min-w-0 max-w-[18rem] px-2 text-xs"
                  title={`模型：${selectedModelTitle}；角色：${selectedAgentLabel}`}
                >
                  <Orbit className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{modelMenuLabel}</span>
                  <ChevronDown className="size-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>模型与角色</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    disabled={isSettingsLoading}
                    title={selectedModelTitle}
                  >
                    <Orbit className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">模型</span>
                    <span className="max-w-32 truncate text-xs text-muted-foreground">{selectedModelLabel}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {runtimeModels.length === 0 ? (
                      <DropdownMenuItem disabled>未配置 LLM</DropdownMenuItem>
                    ) : (
                      <DropdownMenuRadioGroup
                        value={selectedRuntimeModelId}
                        onValueChange={onRuntimeModelChange}
                      >
                        {runtimeModels.map((model) => (
                          <DropdownMenuRadioItem
                            key={model.id}
                            value={model.id}
                            title={formatRuntimeModelTitle(model)}
                          >
                            <span className="truncate">
                              {formatRuntimeModelLabel(model)}
                            </span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    disabled={isSettingsLoading}
                    title={selectedAgentLabel}
                  >
                    <Bot className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">角色</span>
                    <span className="max-w-32 truncate text-xs text-muted-foreground">{selectedAgentLabel}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    <DropdownMenuRadioGroup
                      value={selectedAgent?.id ?? NO_AGENT_PROFILE_ID}
                      onValueChange={(value) => {
                        onSelectedAgentChange(value === NO_AGENT_PROFILE_ID ? "" : value);
                      }}
                    >
                      <DropdownMenuRadioItem value={NO_AGENT_PROFILE_ID}>
                        <span className="truncate">不使用角色</span>
                      </DropdownMenuRadioItem>
                      {agentProfiles.length === 0 ? (
                        <DropdownMenuItem disabled>暂无角色</DropdownMenuItem>
                      ) : (
                        agentProfiles.map((agent) => (
                          <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                            <span className="truncate">{agent.name}</span>
                          </DropdownMenuRadioItem>
                        ))
                      )}
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
                  className="h-8 min-w-0 max-w-[13rem] px-2 text-xs"
                  title={`技能组：${selectedSkillGroupLabel}`}
                >
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>技能组</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {selectedSkillGroupLabel}
                  </span>
                  <ChevronDown className="size-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>技能组（当前对话）</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={selectedSkillGroupIds.includes(ALL_SKILLS_GROUP_ID)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    onSkillGroupChange(ALL_SKILLS_GROUP_ID, checked)
                  }
                >
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">全部</span>
                      {defaultSkillGroupId === ALL_SKILLS_GROUP_ID && (
                        <DefaultSkillGroupBadge />
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      使用 Skill 库中的全部技能
                    </span>
                  </span>
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={selectedSkillGroupIds.includes(NO_SKILLS_GROUP_ID)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) =>
                    onSkillGroupChange(NO_SKILLS_GROUP_ID, checked)
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate">不使用技能</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      本次对话不注入 Skill 上下文
                    </span>
                  </span>
                </DropdownMenuCheckboxItem>
                {skillGroups.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {skillGroups.map((group) => (
                      <DropdownMenuCheckboxItem
                        key={group.id}
                        checked={selectedSkillGroupIds.includes(group.id)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) =>
                          onSkillGroupChange(group.id, checked)
                        }
                        title={group.description ?? undefined}
                      >
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{group.name}</span>
                            {group.id === defaultSkillGroupId && (
                              <DefaultSkillGroupBadge />
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {group.skills.length} 个 Skill
                          </span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
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
                {agentTools.length === 0 ? (
                  <DropdownMenuItem disabled>暂无工具</DropdownMenuItem>
                ) : agentTools.map((tool) => (
                  <DropdownMenuCheckboxItem
                    key={tool.name}
                    checked={allowedAgentTools.includes(tool.name)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => onToggleAllowedAgentTool(tool.name, checked)}
                    title={tool.description ?? undefined}
                  >
                    {tool.label}
                  </DropdownMenuCheckboxItem>
                ))}
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

const DefaultSkillGroupBadge = () => (
  <span className="shrink-0 rounded-full bg-sidebar-primary/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sidebar-primary">
    默认
  </span>
);
