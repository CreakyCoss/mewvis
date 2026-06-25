import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { createAgentClient } from "@/agent-client/runtime";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { StoryImportDialog } from "./import-dialog";
import { useStoryPresentationActions } from "./presentation-actions";
import { StoryContent } from "./story-content";
import { StoryHeader } from "./story-header";
import { StorySidebar } from "./story-sidebar";
import { useStoryImport } from "./use-story-import";
import { useStoryManuscripts } from "./use-story-manuscripts";
import { useStoryState } from "./use-story-state";
import {
  type StoryConfigTab,
  type StoryDraft,
} from "./shared";

export const StoriesPage = () => {
  const agentClient = useMemo(() => createAgentClient(), []);
  const {
    runtimeAgentId,
    runtimeAgentRequiresModel,
    selectedRuntimeModel,
    settingsError,
  } = useRuntimeAgentSettings({
    agentClient,
    capability: "chat",
  });
  const [searchParams] = useSearchParams();
  const requestedStoryId = searchParams.get("storyId")?.trim() ?? "";
  const { activeWorkspace, defaultWorkspace, overview } = useWorkspaceOverview();
  const workspace = activeWorkspace ?? defaultWorkspace ?? overview?.workspaces[0] ?? null;
  const [activeTab, setActiveTab] = useState<StoryConfigTab>("overview");
  const {
    activeStory,
    createStory,
    isLoading,
    isSaving,
    persistStory,
    persistStoryState,
    selectStory,
    storyState,
  } = useStoryState({
    workspace,
    requestedStoryId,
  });
  const {
    openingStoryId,
    openStoryPresentation,
  } = useStoryPresentationActions({
    workspace,
    activeStory,
    storyState,
    persistStoryState,
  });
  const {
    convertImportDraft,
    importAsNewStory,
    importDraft,
    importRaw,
    importSourceKind,
    isImportOpen,
    mergeImportIntoActiveStory,
    openImportDialog,
    setImportDraft,
    setImportRaw,
    setImportSourceKind,
    setIsImportOpen,
  } = useStoryImport({
    activeStory,
    persistStory,
    persistStoryState,
    setActiveTab,
    storyState,
    workspace,
  });
  const {
    acceptManuscript,
    createManuscriptDraft,
    pendingDraftCount,
    polishManuscriptDraft,
    rejectManuscript,
    saveManuscriptDraft,
  } = useStoryManuscripts({
    activeStory,
    persistStory,
    runtimeAgentId,
    runtimeAgentRequiresModel,
    selectedRuntimeModel,
    settingsError,
    workspace,
  });

  const saveOverviewDraft = (draft: StoryDraft) => {
    if (!activeStory) {
      return;
    }

    persistStory({
      ...activeStory,
      title: draft.title.trim() || activeStory.title,
      outline: draft.outline,
      goal: draft.goal,
      userPersonaName: draft.userPersonaName.trim() || "我",
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-muted/20 text-foreground">
      <StorySidebar
        activeStoryId={activeStory?.id}
        canCreateStory={Boolean(workspace)}
        isSaving={isSaving}
        onCreateStory={createStory}
        onSelectStory={selectStory}
        stories={storyState.stories}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <StoryHeader
          activeStory={activeStory}
          canCreateStory={Boolean(workspace)}
          isSaving={isSaving}
          onCreateStory={createStory}
          onOpenImportDialog={openImportDialog}
          onOpenStoryPresentation={openStoryPresentation}
          openingStoryId={openingStoryId}
          workspaceName={workspace?.name}
        />

        <StoryContent
          activeTab={activeTab}
          canCreateStory={Boolean(workspace)}
          isLoading={isLoading}
          onAcceptManuscript={acceptManuscript}
          onCreateManuscriptDraft={createManuscriptDraft}
          onCreateStory={createStory}
          onOpenStoryPresentation={openStoryPresentation}
          onPolishManuscriptDraft={polishManuscriptDraft}
          onRejectManuscript={rejectManuscript}
          onSaveManuscriptDraft={saveManuscriptDraft}
          onSaveOverviewDraft={saveOverviewDraft}
          onSaveStory={persistStory}
          onSetActiveTab={setActiveTab}
          pendingDraftCount={pendingDraftCount}
          story={activeStory}
        />
      </div>

      <StoryImportDialog
        open={isImportOpen}
        activeStory={activeStory}
        importSourceKind={importSourceKind}
        importRaw={importRaw}
        importDraft={importDraft}
        setImportSourceKind={setImportSourceKind}
        setImportRaw={setImportRaw}
        setImportDraft={setImportDraft}
        onOpenChange={setIsImportOpen}
        onConvert={convertImportDraft}
        onImportNewStory={importAsNewStory}
        onMergeIntoActiveStory={mergeImportIntoActiveStory}
      />
    </section>
  );
};
