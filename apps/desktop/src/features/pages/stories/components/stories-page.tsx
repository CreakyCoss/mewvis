import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
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
import { StoryCreateDialog, type StoryCreateForm } from "./story-create-dialog";
import { StoryHeader } from "./story-header";
import { StoryTavernSelectDialog } from "./story-tavern-select-dialog";
import { useStoryImport } from "./use-story-import";
import { useStoryManuscripts } from "./use-story-manuscripts";
import { useStoryState } from "./use-story-state";
import type { StoryDraft } from "./story-form-utils";
import type { StoryConfigTab } from "./story-tabs";

export const StoriesPage = () => {
  const { runtimeAgentRequiresModel, selectedRuntimeModel, settingsError } = useRuntimeAgentSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isHomeFullscreen = isStoriesFullscreenSearch(location.search);
  const requestedStoryId = searchParams.get(STORIES_STORY_SEARCH_PARAM)?.trim() ?? "";
  const { activeWorkspace, defaultWorkspace, overview } = useWorkspaceOverview();
  const workspace = activeWorkspace ?? defaultWorkspace ?? overview?.workspaces[0] ?? null;
  const [activeTab, setActiveTab] = useState<StoryConfigTab>("overview");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [tavernSelectNodeId, setTavernSelectNodeId] = useState<string | null | undefined>(undefined);
  const [createForm, setCreateForm] = useState<StoryCreateForm>({
    name: "",
    workspacePath: "",
  });
  const {
    activeStory,
    activeStoryWorkspace,
    createStory,
    deleteStory,
    isLoading,
    isSaving,
    persistStory,
    persistStoryState,
    selectStory,
    storyState,
  } = useStoryState({
    requestedStoryId,
  });
  const isEditorOpen = isHomeFullscreen && Boolean(requestedStoryId) && activeStory?.id === requestedStoryId;
  const { openingStoryId, openStoryPresentation: openRegisteredStoryPresentation } = useStoryPresentationActions({
    workspace,
    activeStory,
    activeStoryWorkspace,
    storyState,
    persistStoryState,
  });
  const openStoryPresentation = useCallback(
    (channel: Parameters<typeof openRegisteredStoryPresentation>[0], nodeId?: string | null) => {
      if (channel === "tavern") {
        setTavernSelectNodeId(nodeId ?? null);
        return;
      }

      return openRegisteredStoryPresentation(channel, nodeId);
    },
    [openRegisteredStoryPresentation],
  );
  const {
    convertImportStory,
    importAsNewStory,
    importRaw,
    importStory,
    isConvertingImport,
    isImportOpen,
    mergeImportIntoActiveStory,
    openImportDialog,
    setImportRaw,
    setImportStory,
    setIsImportOpen,
  } = useStoryImport({
    activeStory,
    createStory,
    persistStory,
    selectedRuntimeModel,
    setActiveTab,
    settingsError,
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
    runtimeAgentRequiresModel,
    selectedRuntimeModel,
    settingsError,
    workspace: activeStoryWorkspace,
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

  const replaceStorySearch = useCallback(
    (search: string) => {
      navigate(
        {
          pathname: location.pathname,
          search,
          hash: location.hash,
        },
        { replace: true },
      );
    },
    [location.hash, location.pathname, navigate],
  );

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

  const openStoryEditor = useCallback(
    (story: NonNullable<typeof activeStory>) => {
      selectStory(story);
      setActiveTab("overview");
      replaceStorySearch(buildStoryOpenSearch({ storyId: story.id, fullscreen: true }));
    },
    [replaceStorySearch, selectStory],
  );

  const openCreateStoryDialog = () => {
    setCreateForm({
      name: "",
      workspacePath: "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleCreateStory = async () => {
    const story = await createStory(createForm);
    if (!story) {
      return;
    }
    setIsCreateDialogOpen(false);
    setActiveTab("overview");
    replaceStorySearch(buildStoryOpenSearch({ storyId: story.id, fullscreen: true }));
  };

  const handleDeleteStory = (story: NonNullable<typeof activeStory>) => {
    const confirmed = window.confirm(
      `删除故事「${story.title}」及其整个故事工作区？这个操作会同时删除 story/ 和 .tavern/ 运行时数据。`,
    );
    if (!confirmed) {
      return;
    }

    void deleteStory(story);
    if (requestedStoryId === story.id) {
      backToStoryHome();
    }
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
            canCreateStory
            isSaving={isSaving}
            onBackToList={backToStoryHome}
            onCreateStory={openCreateStoryDialog}
            onOpenImportDialog={openImportDialog}
            onOpenStoryPresentation={openStoryPresentation}
            openingStoryId={openingStoryId}
            pendingDraftCount={pendingDraftCount}
            workspaceName={activeStoryWorkspace?.name}
          />
        ) : null}

        <StoryContent
          activeTab={activeTab}
          canCreateStory
          isLoading={isLoading}
          onAcceptManuscript={acceptManuscript}
          onCreateManuscriptDraft={createManuscriptDraft}
          onCreateStory={openCreateStoryDialog}
          onDeleteStory={handleDeleteStory}
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
        importRaw={importRaw}
        importStory={importStory}
        isConvertingImport={isConvertingImport}
        setImportRaw={setImportRaw}
        setImportStory={setImportStory}
        onOpenChange={setIsImportOpen}
        onConvert={() => void convertImportStory()}
        onImportNewStory={importAsNewStory}
        onMergeIntoActiveStory={() => void mergeImportIntoActiveStory()}
      />

      <StoryTavernSelectDialog
        open={tavernSelectNodeId !== undefined}
        activeStory={activeStory}
        nodeId={tavernSelectNodeId ?? undefined}
        storyWorkspace={activeStoryWorkspace}
        tavernWorkspace={workspace}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setTavernSelectNodeId(undefined);
          }
        }}
      />

      <StoryCreateDialog
        open={isCreateDialogOpen}
        form={createForm}
        isSaving={isSaving}
        onOpenChange={setIsCreateDialogOpen}
        onFormChange={setCreateForm}
        onSubmit={handleCreateStory}
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
