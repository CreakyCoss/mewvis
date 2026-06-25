import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { createAgentClient } from "@/agent-client/runtime";
import { WindowDragRegion } from "@/components/window-drag-region";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import {
  STORIES_FULLSCREEN_SEARCH_PARAM,
  STORIES_STORY_SEARCH_PARAM,
  buildStoryOpenSearch,
  isStoriesFullscreenSearch,
} from "../navigation";
import { StoryImportDialog } from "./import-dialog";
import { useStoryPresentationActions } from "./presentation-actions";
import { StoryContent } from "./story-content";
import { StoryHeader } from "./story-header";
import { useStoryImport } from "./use-story-import";
import { useStoryManuscripts } from "./use-story-manuscripts";
import { useStoryState } from "./use-story-state";
import type { StoryDraft } from "./story-form-utils";
import type { StoryConfigTab } from "./story-tabs";

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
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isHomeFullscreen = isStoriesFullscreenSearch(location.search);
  const requestedStoryId = searchParams.get(STORIES_STORY_SEARCH_PARAM)?.trim() ?? "";
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
  const isEditorOpen = isHomeFullscreen &&
    Boolean(requestedStoryId) &&
    activeStory?.id === requestedStoryId;
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

  const replaceStorySearch = useCallback((search: string) => {
    navigate(
      {
        pathname: location.pathname,
        search,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, navigate]);

  const exitHomeFullscreen = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete(STORIES_FULLSCREEN_SEARCH_PARAM);

    const nextSearch = params.toString();
    replaceStorySearch(nextSearch ? `?${nextSearch}` : "");
  }, [location.search, replaceStorySearch]);

  const backToStoryHome = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set(STORIES_FULLSCREEN_SEARCH_PARAM, "1");
    params.delete(STORIES_STORY_SEARCH_PARAM);

    const nextSearch = params.toString();
    replaceStorySearch(nextSearch ? `?${nextSearch}` : "");
  }, [location.search, replaceStorySearch]);

  const openStoryEditor = useCallback((story: NonNullable<typeof activeStory>) => {
    selectStory(story);
    setActiveTab("overview");
    replaceStorySearch(buildStoryOpenSearch({ storyId: story.id, fullscreen: true }));
  }, [replaceStorySearch, selectStory]);

  const handleCreateStory = () => {
    const story = createStory();
    if (!story) {
      return;
    }
    setActiveTab("overview");
    replaceStorySearch(buildStoryOpenSearch({ storyId: story.id, fullscreen: true }));
  };

  const handleSelectStory = (story: NonNullable<typeof activeStory>) => {
    selectStory(story);
    setActiveTab("overview");
  };

  const content = (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-muted/20 text-foreground">
      <div className="flex min-w-0 flex-1 flex-col">
        {isEditorOpen ? (
          <StoryHeader
            activeStory={activeStory}
            canCreateStory={Boolean(workspace)}
            isSaving={isSaving}
            onBackToList={backToStoryHome}
            onCreateStory={handleCreateStory}
            onOpenImportDialog={openImportDialog}
            onOpenStoryPresentation={openStoryPresentation}
            openingStoryId={openingStoryId}
            pendingDraftCount={pendingDraftCount}
            workspaceName={workspace?.name}
          />
        ) : null}

        <StoryContent
          activeTab={activeTab}
          canCreateStory={Boolean(workspace)}
          isLoading={isLoading}
          onAcceptManuscript={acceptManuscript}
          onCreateManuscriptDraft={createManuscriptDraft}
          onCreateStory={handleCreateStory}
          onOpenImportDialog={openImportDialog}
          onOpenStoryPresentation={openStoryPresentation}
          onPolishManuscriptDraft={polishManuscriptDraft}
          onRejectManuscript={rejectManuscript}
          onSaveManuscriptDraft={saveManuscriptDraft}
          onSaveOverviewDraft={saveOverviewDraft}
          onSaveStory={persistStory}
          onSelectStory={handleSelectStory}
          onSetActiveTab={setActiveTab}
          onStartEditing={openStoryEditor}
          onExitHomeFullscreen={isHomeFullscreen ? exitHomeFullscreen : undefined}
          isEditing={isEditorOpen}
          story={activeStory}
          stories={storyState.stories}
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

  if (isHomeFullscreen) {
    return (
      <div className="fixed inset-0 z-[45] flex h-screen min-h-0 w-screen flex-col bg-background text-foreground">
        <WindowDragRegion className="h-10 shrink-0" />
        <div className="flex min-h-0 flex-1">{content}</div>
      </div>
    );
  }

  return content;
};
