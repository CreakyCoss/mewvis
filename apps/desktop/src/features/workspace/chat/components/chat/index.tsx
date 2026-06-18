import type { Dispatch, RefObject, SetStateAction } from "react";
import type { RuntimeAgentDefinition, RuntimeAgentToolName } from "@/ai/runtime-protocol";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  AgentProfile,
  CollaborationWorkflowProfile,
} from "@/features/ai/components/agent-setting/types";
import type { RuntimeModelOption } from "@/features/ai/components/llm-setting/store";
import type { WorkspaceSkillGroup } from "@/features/skills/types";
import type { Workspace } from "@/features/workspace/types";
import type {
  ChatExecutionMode,
  ChatMode,
  ComposerSubmitInput,
  CollaborationPlanDecisionRequest,
  ModelSource,
  PendingAgentQuestion,
} from "../../page-types";
import type { ChatMessage, WorkspaceFileEntry } from "../../types";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { PendingAgentQuestionForm } from "./pending-agent-question-form";
import { StatusBanner } from "./status-banner";
import { useChatPanelStore } from "./store";
import { WorkspaceSwitcher } from "./workspace-switcher";

export type ChatPanelViewModel = {
  chatScrollAreaRef: RefObject<HTMLDivElement | null>;
  workspace: Workspace;
  workspaces: Workspace[];
  messages: ChatMessage[];
  expandedThinkingIds: Set<string>;
  expandedAgentEventIds: Set<string>;
  modelSource: ModelSource;
  selectedAgent: AgentProfile | null;
  chatError: string;
  settingsError: string;
  skillsError: string;
  sessionsError: string;
  pendingAgentQuestion: PendingAgentQuestion | null;
  collaborationPlanDecision: CollaborationPlanDecisionRequest | null;
  agentQuestionAnswer: string;
  customAgentQuestionAnswer: string;
  isAnsweringAgentQuestion: boolean;
  files: WorkspaceFileEntry[];
  composerResetKey: number;
  isSending: boolean;
  activeAgentTaskId: string;
  isSettingsLoading: boolean;
  chatMode: ChatMode;
  chatExecutionMode: ChatExecutionMode;
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
  effectiveContextWindow: number;
  availableRuntimeAgents: readonly RuntimeAgentDefinition[];
  selectedRuntimeAgent: RuntimeAgentDefinition | null;
  runtimeAgentId: string;
  agentProfiles: AgentProfile[];
  runtimeModels: RuntimeModelOption[];
  selectedRuntimeModelId: string;
  selectedRuntimeModel: RuntimeModelOption | null;
  collaborationWorkflows: CollaborationWorkflowProfile[];
  selectedCollaborationWorkflow: CollaborationWorkflowProfile | null;
  selectedCollaborationWorkflowId: string;
  allowedAgentTools: RuntimeAgentToolName[];
  skillGroups: WorkspaceSkillGroup[];
  defaultSkillGroupId: string;
  selectedSkillGroupIds: string[];
  selectedSkillGroupLabel: string;
  toggleThinking: (messageId: string) => void;
  toggleAgentEvents: (messageId: string) => void;
  toggleAgentThinkingBlock: (messageId: string, blockId: string) => void;
  toggleAgentBlock: (messageId: string, blockId: string) => void;
  onEditHistoryMessage: (messageId: string, nextText: string) => void;
  onDeleteHistoryMessage: (messageId: string) => void;
  onMoveHistoryMessage: (messageId: string, direction: "up" | "down") => void;
  onOpenWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace: () => void;
  resolveCollaborationPlanDecision: (approved: boolean) => void;
  setAgentQuestionAnswer: Dispatch<SetStateAction<string>>;
  setCustomAgentQuestionAnswer: Dispatch<SetStateAction<string>>;
  submitAgentQuestionAnswer: (answerValue: string) => Promise<void>;
  setChatMode: Dispatch<SetStateAction<ChatMode>>;
  setChatExecutionMode: Dispatch<SetStateAction<ChatExecutionMode>>;
  setShowThinkingProcess: Dispatch<SetStateAction<boolean>>;
  setShowToolCallProcess: Dispatch<SetStateAction<boolean>>;
  setModelSource: Dispatch<SetStateAction<ModelSource>>;
  setSelectedRuntimeAgentId: Dispatch<SetStateAction<string>>;
  setSelectedAgentId: Dispatch<SetStateAction<string>>;
  setSelectedCollaborationWorkflowId: Dispatch<SetStateAction<string>>;
  setSelectedRuntimeModelId: (id: string) => void;
  toggleAllowedAgentTool: (toolId: RuntimeAgentToolName, enabled: boolean) => void;
  toggleSelectedSkillGroup: (skillGroupId: string, checked: boolean) => void;
  sendMessage: (input: ComposerSubmitInput) => Promise<void>;
  onAbortTask: () => void;
};

export const ChatPanel = () => {
  const {
    chatScrollAreaRef,
    workspace,
    workspaces,
    messages,
    modelSource,
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
    chatMode,
    chatExecutionMode,
    showThinkingProcess,
    showToolCallProcess,
    effectiveContextWindow,
    availableRuntimeAgents,
    selectedRuntimeAgent,
    runtimeAgentId,
    agentProfiles,
    runtimeModels,
    selectedRuntimeModelId,
    selectedRuntimeModel,
    collaborationWorkflows,
    selectedCollaborationWorkflow,
    selectedCollaborationWorkflowId,
    allowedAgentTools,
    skillGroups,
    defaultSkillGroupId,
    selectedSkillGroupIds,
    selectedSkillGroupLabel,
    onOpenWorkspace,
    onCreateWorkspace,
    setAgentQuestionAnswer,
    setCustomAgentQuestionAnswer,
    submitAgentQuestionAnswer,
    setChatMode,
    setChatExecutionMode,
    setShowThinkingProcess,
    setShowToolCallProcess,
    setModelSource,
    setSelectedRuntimeAgentId,
    setSelectedAgentId,
    setSelectedCollaborationWorkflowId,
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
      chatMode={chatMode}
      chatExecutionMode={chatExecutionMode}
      showThinkingProcess={showThinkingProcess}
      showToolCallProcess={showToolCallProcess}
      effectiveContextWindow={effectiveContextWindow}
      modelSource={modelSource}
      runtimeAgents={availableRuntimeAgents}
      selectedRuntimeAgent={selectedRuntimeAgent}
      selectedRuntimeAgentId={runtimeAgentId}
      agentProfiles={agentProfiles}
      runtimeModels={runtimeModels}
      selectedRuntimeModelId={selectedRuntimeModelId}
      selectedRuntimeModel={selectedRuntimeModel}
      selectedAgent={selectedAgent}
      collaborationWorkflows={collaborationWorkflows}
      selectedCollaborationWorkflow={selectedCollaborationWorkflow}
      selectedCollaborationWorkflowId={selectedCollaborationWorkflowId}
      allowedAgentTools={allowedAgentTools}
      skillGroups={skillGroups}
      defaultSkillGroupId={defaultSkillGroupId}
      selectedSkillGroupIds={selectedSkillGroupIds}
      selectedSkillGroupLabel={selectedSkillGroupLabel}
      onChatModeChange={setChatMode}
      onChatExecutionModeChange={setChatExecutionMode}
      onShowThinkingProcessChange={setShowThinkingProcess}
      onShowToolCallProcessChange={setShowToolCallProcess}
      onModelSourceChange={setModelSource}
      onRuntimeAgentChange={setSelectedRuntimeAgentId}
      onSelectedAgentChange={setSelectedAgentId}
      onCollaborationWorkflowChange={setSelectedCollaborationWorkflowId}
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
            <MessageList />
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
