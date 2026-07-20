import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Check, ChevronDown, Folder, Plus, Search, X } from "lucide-react";
import type { AgentToolSummary } from "@/agent-client/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentProfile } from "@/features/pages/settings/agent/types";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { WorkspaceSkillGroup } from "@/features/pages/skills/types";
import { isDefaultWorkspace } from "@/features/pages/workspace/default";
import type { Workspace } from "@/features/pages/workspace/types";
import type { ChatMessage, ComposerSubmitInput, PendingAgentQuestion } from "../../types";
import type { WorkspaceFileEntry } from "@/api/workspace-files";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { PendingAgentQuestionForm } from "./pending-agent-question-form";
import { useChatPanelStore } from "./store";

export type ChatPanelViewModel = {
  chatScrollAreaRef: RefObject<HTMLDivElement | null>;
  workspace: Workspace;
  workspaces: Workspace[];
  messages: ChatMessage[];
  selectedAgent: AgentProfile | null;
  chatError: string;
  settingsError: string;
  skillsError: string;
  sessionsError: string;
  pendingAgentQuestion: PendingAgentQuestion | null;
  agentQuestionAnswer: string;
  customAgentQuestionAnswer: string;
  isAnsweringAgentQuestion: boolean;
  files: WorkspaceFileEntry[];
  composerResetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  agentProfiles: AgentProfile[];
  runtimeModels: RuntimeModelOption[];
  selectedRuntimeModelId: string;
  selectedRuntimeModel: RuntimeModelOption | null;
  agentTools: readonly AgentToolSummary[];
  allowedAgentTools: string[];
  skillGroups: WorkspaceSkillGroup[];
  defaultSkillGroupId: string;
  selectedSkillGroupIds: string[];
  selectedSkillGroupLabel: string;
  isResourceSelectionLocked: boolean;
  onEditHistoryMessage: (messageId: string, nextText: string) => void;
  onDeleteHistoryMessage: (messageId: string) => void;
  onMoveHistoryMessage: (messageId: string, direction: "up" | "down") => void;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  setAgentQuestionAnswer: Dispatch<SetStateAction<string>>;
  setCustomAgentQuestionAnswer: Dispatch<SetStateAction<string>>;
  submitAgentQuestionAnswer: (answerValue: string) => Promise<void>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  setSelectedRuntimeModelId: (id: string) => void;
  toggleAllowedAgentTool: (toolId: string, enabled: boolean) => void;
  toggleSelectedSkillGroup: (skillGroupId: string, checked: boolean) => void;
  sendMessage: (input: ComposerSubmitInput) => Promise<void>;
  onAbortTask: () => void;
};

type StatusBannerProps = {
  message: string;
};

const StatusBanner = ({ message }: StatusBannerProps) => {
  if (!message) {
    return null;
  }

  return (
    <div className="mx-auto mb-3 max-w-5xl rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  );
};

type WorkspaceSwitcherProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
};

const WorkspaceSwitcher = ({ workspace, workspaces, onOpenWorkspace, onCreateWorkspace }: WorkspaceSwitcherProps) => {
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const defaultWorkspace = workspaces.find(isDefaultWorkspace) ?? null;
  const projectWorkspaces = workspaces.filter((item) => !isDefaultWorkspace(item));
  const isDefaultWorkspaceSelected = isDefaultWorkspace(workspace);
  const workspaceSwitcherLabel = isDefaultWorkspaceSelected ? "不使用项目" : workspace.name;
  const normalizedWorkspaceSearch = workspaceSearch.trim().toLowerCase();
  const visibleProjectWorkspaces = normalizedWorkspaceSearch
    ? projectWorkspaces.filter(
        (item) =>
          item.name.toLowerCase().includes(normalizedWorkspaceSearch) ||
          item.path.toLowerCase().includes(normalizedWorkspaceSearch),
      )
    : projectWorkspaces;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setWorkspaceSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 max-w-full rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          title={workspace.path}
        >
          {isDefaultWorkspaceSelected ? (
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <Folder className="size-4" />
              <X className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
            </span>
          ) : (
            <Folder className="size-4 shrink-0" />
          )}
          <span className="min-w-0 truncate">{workspaceSwitcherLabel}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 rounded-2xl border-border/70 bg-popover p-2 shadow-xl">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground/80" />
          <input
            type="search"
            value={workspaceSearch}
            onChange={(event) => setWorkspaceSearch(event.currentTarget.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="搜索项目"
            className="h-9 w-full rounded-lg border-0 bg-transparent pr-2 pl-8 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:bg-muted/45 focus:ring-0 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          {visibleProjectWorkspaces.length > 0 ? (
            visibleProjectWorkspaces.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className="h-10 gap-3 rounded-lg px-2.5 text-sm font-medium"
                title={item.path}
                onSelect={() => {
                  if (item.id !== workspace.id) {
                    onOpenWorkspace(item);
                  }
                }}
              >
                <Folder className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.id === workspace.id && <Check className="size-4 shrink-0 text-foreground" />}
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2.5 py-4 text-sm text-muted-foreground">没有匹配的项目</div>
          )}
        </div>
        <DropdownMenuSeparator className="mx-2 my-2" />
        <DropdownMenuItem className="h-10 gap-3 rounded-lg px-2.5 text-sm font-semibold" onSelect={onCreateWorkspace}>
          <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <Folder className="size-4" />
            <Plus className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
          </span>
          <span className="min-w-0 flex-1 truncate">新建工作区</span>
        </DropdownMenuItem>
        {defaultWorkspace && (
          <DropdownMenuItem
            className="h-10 gap-3 rounded-lg px-2.5 text-sm font-semibold"
            title={defaultWorkspace.path}
            onSelect={() => {
              if (defaultWorkspace.id !== workspace.id) {
                onOpenWorkspace(defaultWorkspace);
              }
            }}
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <Folder className="size-4" />
              <X className="absolute -right-1 -bottom-1 size-2.5 stroke-[3]" />
            </span>
            <span className="min-w-0 flex-1 truncate">不使用项目</span>
            {defaultWorkspace.id === workspace.id && <Check className="size-4 shrink-0 text-foreground" />}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const ChatPanel = () => {
  const [showThinkingProcess, setShowThinkingProcess] = useState(true);
  const [showToolCallProcess, setShowToolCallProcess] = useState(true);
  const {
    chatScrollAreaRef,
    workspace,
    workspaces,
    messages,
    selectedAgent,
    chatError,
    settingsError,
    skillsError,
    sessionsError,
    pendingAgentQuestion,
    agentQuestionAnswer,
    customAgentQuestionAnswer,
    isAnsweringAgentQuestion,
    files,
    composerResetKey,
    isSending,
    activeAgentTaskId,
    isSettingsLoading,
    agentProfiles,
    runtimeModels,
    selectedRuntimeModelId,
    selectedRuntimeModel,
    agentTools,
    allowedAgentTools,
    skillGroups,
    defaultSkillGroupId,
    selectedSkillGroupIds,
    selectedSkillGroupLabel,
    isResourceSelectionLocked,
    onOpenWorkspace,
    onCreateWorkspace,
    setAgentQuestionAnswer,
    setCustomAgentQuestionAnswer,
    submitAgentQuestionAnswer,
    setSelectedAgentId,
    setSelectedRuntimeModelId,
    toggleAllowedAgentTool,
    toggleSelectedSkillGroup,
    sendMessage,
    onAbortTask,
  } = useChatPanelStore();

  const isEmptyConversation = messages.length === 0 && !pendingAgentQuestion;
  const statusMessage = chatError || settingsError || skillsError || sessionsError;
  const workspaceSwitcher = (
    <WorkspaceSwitcher
      workspace={workspace}
      workspaces={workspaces}
      onOpenWorkspace={onOpenWorkspace}
      onCreateWorkspace={onCreateWorkspace}
    />
  );
  const emptyContextBar = (
    <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-1 text-sm text-muted-foreground">
      {workspaceSwitcher}
    </div>
  );
  const statusBanner = <StatusBanner message={statusMessage} />;
  const composerElement = (
    <Composer
      files={files}
      resetKey={composerResetKey}
      isSending={isSending}
      activeAgentTaskId={activeAgentTaskId}
      isSettingsLoading={isSettingsLoading}
      showThinkingProcess={showThinkingProcess}
      showToolCallProcess={showToolCallProcess}
      agentProfiles={agentProfiles}
      runtimeModels={runtimeModels}
      selectedRuntimeModelId={selectedRuntimeModelId}
      selectedRuntimeModel={selectedRuntimeModel}
      selectedAgent={selectedAgent}
      agentTools={agentTools}
      allowedAgentTools={allowedAgentTools}
      skillGroups={skillGroups}
      defaultSkillGroupId={defaultSkillGroupId}
      selectedSkillGroupIds={selectedSkillGroupIds}
      selectedSkillGroupLabel={selectedSkillGroupLabel}
      isResourceSelectionLocked={isResourceSelectionLocked}
      onShowThinkingProcessChange={setShowThinkingProcess}
      onShowToolCallProcessChange={setShowToolCallProcess}
      onSelectedAgentChange={setSelectedAgentId}
      onRuntimeModelChange={setSelectedRuntimeModelId}
      onToggleAllowedAgentTool={toggleAllowedAgentTool}
      onSkillGroupChange={toggleSelectedSkillGroup}
      onSubmit={(input) => void sendMessage(input)}
      onAbortTask={onAbortTask}
    />
  );

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <ScrollArea ref={chatScrollAreaRef} className="h-full min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex min-w-0 w-full max-w-5xl flex-col gap-4 px-4 py-5 lg:px-6 lg:py-6 xl:px-7 xl:py-7">
          {isEmptyConversation ? (
            <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center px-2 py-10">
              <div className="w-full space-y-7">
                <div className="text-center">
                  <h3
                    className="mx-auto flex w-full max-w-[38rem] min-w-0 items-baseline justify-center overflow-hidden text-center text-2xl font-semibold leading-tight tracking-normal whitespace-nowrap text-foreground sm:text-3xl xl:text-4xl"
                    title={`我们应该在 ${workspace.name} 中构建什么？`}
                  >
                    <span className="shrink-0">我们应该在&nbsp;</span>
                    <span className="min-w-0 truncate" title={workspace.name}>
                      {workspace.name}
                    </span>
                    <span className="shrink-0">&nbsp;中构建什么？</span>
                  </h3>
                </div>
                {statusBanner}
                <div className="space-y-3">
                  {composerElement}
                  {emptyContextBar}
                </div>
              </div>
            </div>
          ) : (
            <MessageList showThinkingProcess={showThinkingProcess} showToolCallProcess={showToolCallProcess} />
          )}
        </div>
      </ScrollArea>

      {!isEmptyConversation && (
        <div className="min-w-0 bg-background/90 px-4 py-3 shadow-[0_-10px_28px_-30px_rgb(15_23_42_/_0.32)] backdrop-blur lg:px-6 xl:px-7 xl:py-4">
          {statusBanner}
          {pendingAgentQuestion && (
            <PendingAgentQuestionForm
              pendingAgentQuestion={pendingAgentQuestion}
              agentQuestionAnswer={agentQuestionAnswer}
              customAgentQuestionAnswer={customAgentQuestionAnswer}
              isAnsweringAgentQuestion={isAnsweringAgentQuestion}
              onAgentQuestionAnswerChange={setAgentQuestionAnswer}
              onCustomAgentQuestionAnswerChange={setCustomAgentQuestionAnswer}
              onSubmitAgentQuestionAnswer={submitAgentQuestionAnswer}
            />
          )}
          {composerElement}
        </div>
      )}
    </section>
  );
};
