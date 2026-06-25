import { BookOpen, FileText, FileUp, GitBranch, MessageSquareText, Plus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { createAgentClient } from "@/agent-client/runtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { cn } from "@/lib/utils";
import { StoryImportDialog } from "./import-dialog";
import { useStoryPresentationActions } from "./presentation-actions";
import { useStoryImport } from "./use-story-import";
import { useStoryManuscripts } from "./use-story-manuscripts";
import { useStoryState } from "./use-story-state";
import { StoryCharactersModule } from "./modules/characters";
import { StoryGraphModule } from "./modules/graph";
import { StoryManuscriptsModule } from "./modules/manuscripts";
import { StoryOverviewModule } from "./modules/overview";
import {
  storyPresentationDefinitions,
  type StoryPresentationIcon,
} from "./presentations/registry";
import { StoryScenesModule } from "./modules/scenes";
import { StoryWorldModule } from "./modules/world";
import {
  formatCount,
  getPendingDraftCount,
  storyConfigTabs,
  StoryMetric,
  type StoryConfigTab,
  type StoryDraft,
} from "./shared";

const storyPresentationIconMap = {
  chat: MessageSquareText,
  tavern: BookOpen,
} satisfies Record<StoryPresentationIcon, typeof BookOpen>;

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
      <aside className="hidden w-80 shrink-0 border-r bg-background md:flex md:flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-7">故事</h1>
            <p className="text-xs text-muted-foreground">
              {formatCount(storyState.stories.length, "个故事")}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            className="size-8 shrink-0"
            onClick={createStory}
            disabled={!workspace || isSaving}
            title="新建故事"
            aria-label="新建故事"
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {storyState.stories.map((story) => (
              <button
                key={story.id}
                type="button"
                className={cn(
                  "flex w-full min-w-0 flex-col gap-2 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted",
                  activeStory?.id === story.id && "bg-muted",
                )}
                onClick={() => selectStory(story)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{story.title}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{formatCount(story.characters.length, "角色")}</Badge>
                  <Badge variant="outline">{formatCount(story.scenes.length, "场景")}</Badge>
                  {getPendingDraftCount(story) > 0 ? (
                    <Badge variant="secondary">{formatCount(getPendingDraftCount(story), "待收稿")}</Badge>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-4 lg:px-6">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <BookOpen className="size-4 text-muted-foreground" />
              <h1 className="truncate text-lg font-semibold">故事</h1>
            </div>
            <div className="hidden min-w-0 md:block">
              <h2 className="truncate text-lg font-semibold leading-7">
                {activeStory?.title ?? "故事资产"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {workspace?.name ?? "未选择工作区"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2 md:hidden"
              onClick={createStory}
              disabled={!workspace || isSaving}
            >
              <Plus className="size-4" />
              新建
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={openImportDialog}
              disabled={!workspace || isSaving}
            >
              <FileUp className="size-4" />
              导入
            </Button>
            {storyPresentationDefinitions.map((definition) => {
              const Icon = storyPresentationIconMap[definition.icon];
              const isOpening = Boolean(
                definition.loadingLabel &&
                  activeStory &&
                  openingStoryId === activeStory.id,
              );
              return (
                <Button
                  key={definition.channel}
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => void openStoryPresentation(
                    definition.channel,
                  )}
                  disabled={!activeStory || !workspace || isOpening}
                >
                  <Icon className="size-4" />
                  {isOpening ? definition.loadingLabel : definition.label}
                </Button>
              );
            })}
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          ) : !activeStory ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
              <BookOpen className="size-10 text-muted-foreground" />
              <div className="text-base font-medium">暂无故事资产</div>
              <Button type="button" className="gap-2" onClick={createStory} disabled={!workspace}>
                <Plus className="size-4" />
                新建故事
              </Button>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 lg:px-6">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StoryMetric icon={UsersRound} label="角色" value={String(activeStory.characters.length)} />
                <StoryMetric icon={BookOpen} label="世界书" value={String(activeStory.lorebookEntries.length)} />
                <StoryMetric icon={GitBranch} label="节点" value={String(activeStory.graph.nodes.length)} />
                <StoryMetric icon={FileText} label="待收稿" value={String(pendingDraftCount)} />
              </section>

              <div className="flex gap-2 overflow-x-auto rounded-lg border bg-background p-2">
                {storyConfigTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <Button
                      key={tab.id}
                      type="button"
                      variant={activeTab === tab.id ? "secondary" : "ghost"}
                      className="h-9 shrink-0 gap-2"
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon className="size-4" />
                      {tab.label}
                    </Button>
                  );
                })}
              </div>

              {activeTab === "overview" ? (
                <StoryOverviewModule
                  story={activeStory}
                  onSave={saveOverviewDraft}
                />
              ) : null}
              {activeTab === "characters" ? (
                <StoryCharactersModule story={activeStory} onSave={persistStory} />
              ) : null}
              {activeTab === "scenes" ? (
                <StoryScenesModule story={activeStory} onSave={persistStory} />
              ) : null}
              {activeTab === "world" ? (
                <StoryWorldModule story={activeStory} onSave={persistStory} />
              ) : null}
              {activeTab === "graph" ? (
                <StoryGraphModule
                  story={activeStory}
                  onSave={persistStory}
                  onOpenNodeTavern={(nodeId) => void openStoryPresentation("tavern", nodeId)}
                  onOpenNodeChat={(nodeId) => openStoryPresentation("chat", nodeId)}
                />
              ) : null}
              {activeTab === "manuscripts" ? (
                <StoryManuscriptsModule
                  story={activeStory}
                  onAccept={acceptManuscript}
                  onCreateDraft={createManuscriptDraft}
                  onPolishDraft={polishManuscriptDraft}
                  onSaveDraft={saveManuscriptDraft}
                  onReject={rejectManuscript}
                />
              ) : null}

              <Separator />
            </div>
          )}
        </ScrollArea>
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
