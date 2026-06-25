import { BookOpen, FileText, FileUp, GitBranch, MessageSquareText, Plus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { createAgentClient } from "@/agent-client/runtime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useRuntimeAgentSettings } from "@/features/ai/hooks/use-runtime-agent-settings";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import {
  acceptStoryManuscriptDraft,
  assertStoryImportDraftReady,
  createEmptyStoryState,
  createStandaloneStoryAsset,
  createStoryAssetFromImportDraft,
  createStoryImportDraftFromText,
  mergeStoryImportDraftIntoStory,
  rejectStoryManuscriptDraft,
  runStoryWriterAgent,
  submitStoryManuscriptDraft,
  updateStoryManuscriptDraft,
  upsertStoryAsset,
  type StoryAsset,
  type StoryImportDraft,
  type StoryImportSourceKind,
  type StoryManuscriptDraftUpdateInput,
  type StoryManuscriptSubmissionInput,
  type StoryState,
} from "@/features/story";
import { loadStoryState, saveStoryState } from "@/features/story/storage";
import { cn } from "@/lib/utils";
import { StoryImportDialog } from "./import-dialog";
import { useStoryPresentationActions } from "./presentation-actions";
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
  const [storyState, setStoryState] = useState<StoryState>(() => createEmptyStoryState());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<StoryConfigTab>("overview");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importSourceKind, setImportSourceKind] = useState<StoryImportSourceKind>("unknown");
  const [importRaw, setImportRaw] = useState("");
  const [importDraft, setImportDraft] = useState<StoryImportDraft | null>(null);

  const activeStory = useMemo(
    () => storyState.stories.find((story) => story.id === storyState.activeStoryId) ??
      storyState.stories[0] ??
      null,
    [storyState.activeStoryId, storyState.stories],
  );

  useEffect(() => {
    if (!workspace) {
      setStoryState(createEmptyStoryState());
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    loadStoryState(workspace.path, workspace.id)
      .then((nextState) => {
        if (cancelled) {
          return;
        }
        const requestedStory = requestedStoryId
          ? nextState.stories.find((story) => story.id === requestedStoryId) ?? null
          : null;
        const selectedStory = requestedStory ??
          nextState.stories.find((story) => story.id === nextState.activeStoryId) ??
          nextState.stories[0] ??
          null;
        setStoryState({
          ...nextState,
          activeStoryId: selectedStory?.id ?? nextState.activeStoryId,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error("Failed to load story state", error);
        toast.error("无法加载故事资产。");
        setStoryState(createEmptyStoryState());
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestedStoryId, workspace]);

  useEffect(() => {
    if (!requestedStoryId || storyState.activeStoryId === requestedStoryId) {
      return;
    }
    const requestedStory = storyState.stories.find((story) => story.id === requestedStoryId);
    if (requestedStory) {
      selectStory(requestedStory);
    }
  }, [requestedStoryId, storyState.activeStoryId, storyState.stories]);

  const persistStoryState = async (nextState: StoryState) => {
    if (!workspace) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveStoryState(workspace.path, workspace.id, nextState);
      setStoryState(saved);
    } catch (error) {
      console.error("Failed to save story state", error);
      toast.error("故事保存失败。");
    } finally {
      setIsSaving(false);
    }
  };
  const {
    openingStoryId,
    openStoryPresentation,
  } = useStoryPresentationActions({
    workspace,
    activeStory,
    storyState,
    persistStoryState,
  });

  const persistStory = (story: StoryAsset) => {
    void persistStoryState(upsertStoryAsset(storyState, {
      ...story,
      updatedAt: Date.now(),
    }));
  };

  const selectStory = (story: StoryAsset) => {
    setStoryState((current) => ({
      ...current,
      activeStoryId: story.id,
    }));
  };

  const createStory = () => {
    if (!workspace) {
      return;
    }

    const story = createStandaloneStoryAsset({
      workspaceId: workspace.id,
      title: `新故事 ${storyState.stories.length + 1}`,
    });
    void persistStoryState({
      ...upsertStoryAsset({
        ...storyState,
        activeStoryId: story.id,
      }, story),
      activeStoryId: story.id,
    });
  };

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

  const acceptManuscript = (draftId: string, patch?: StoryManuscriptDraftUpdateInput) => {
    if (!activeStory) {
      return;
    }

    try {
      const inbox = patch
        ? updateStoryManuscriptDraft(activeStory.manuscriptInbox, draftId, patch)
        : activeStory.manuscriptInbox;
      persistStory({
        ...activeStory,
        manuscriptInbox: acceptStoryManuscriptDraft(inbox, draftId).inbox,
      });
      toast.success("已收稿。");
    } catch (error) {
      console.error("Failed to accept manuscript", error);
      toast.error("收稿失败。");
    }
  };

  const saveManuscriptDraft = (
    draftId: string,
    patch: StoryManuscriptDraftUpdateInput,
  ) => {
    if (!activeStory) {
      return;
    }

    try {
      persistStory({
        ...activeStory,
        manuscriptInbox: updateStoryManuscriptDraft(activeStory.manuscriptInbox, draftId, patch),
      });
      toast.success("稿件已保存。");
    } catch (error) {
      console.error("Failed to save manuscript draft", error);
      toast.error(error instanceof Error ? error.message : "保存稿件失败。");
    }
  };

  const createManuscriptDraft = (
    input: Omit<StoryManuscriptSubmissionInput, "storyId" | "source">,
  ) => {
    if (!activeStory) {
      return;
    }

    try {
      const { inbox } = submitStoryManuscriptDraft(activeStory.manuscriptInbox, {
        ...input,
        storyId: activeStory.id,
        source: "manual",
      });
      persistStory({
        ...activeStory,
        manuscriptInbox: inbox,
      });
      toast.success("稿件已加入收稿箱。");
    } catch (error) {
      console.error("Failed to create manuscript draft", error);
      toast.error(error instanceof Error ? error.message : "创建稿件失败。");
    }
  };

  const polishManuscriptDraft = async ({
    nodeId,
    title,
    summary,
    content,
  }: {
    nodeId: string;
    title: string;
    summary?: string;
    content: string;
  }) => {
    if (!workspace || !activeStory) {
      throw new Error("当前没有可用故事。");
    }
    if (settingsError) {
      throw new Error(settingsError);
    }
    if (!runtimeAgentId) {
      throw new Error("请先选择可用的 Agent 运行配置。");
    }
    if (runtimeAgentRequiresModel && !selectedRuntimeModel) {
      throw new Error("请先在设置中选择模型。");
    }

    return runStoryWriterAgent({
      workspacePath: workspace.path,
      agentId: runtimeAgentId,
      runtimeModel: selectedRuntimeModel ? requireRuntimeModelInput(selectedRuntimeModel) : null,
      story: activeStory,
      nodeId,
      mode: "polish",
      title,
      summary,
      content,
    });
  };

  const rejectManuscript = (draftId: string) => {
    if (!activeStory) {
      return;
    }

    try {
      persistStory({
        ...activeStory,
        manuscriptInbox: rejectStoryManuscriptDraft(activeStory.manuscriptInbox, draftId),
      });
      toast.success("已退回稿件。");
    } catch (error) {
      console.error("Failed to reject manuscript", error);
      toast.error("退回失败。");
    }
  };

  const openImportDialog = () => {
    setImportRaw("");
    setImportDraft(null);
    setImportSourceKind("unknown");
    setIsImportOpen(true);
  };

  const convertImportDraft = () => {
    try {
      setImportDraft(createStoryImportDraftFromText(importRaw, {
        sourceKind: importSourceKind,
      }));
      toast.success("已转换为标准故事草稿。");
    } catch (error) {
      console.error("Failed to convert story import draft", error);
      toast.error(error instanceof Error ? error.message : "导入转换失败。");
    }
  };

  const importAsNewStory = () => {
    if (!workspace || !importDraft) {
      return;
    }

    try {
      assertStoryImportDraftReady(importDraft);
      const story = createStoryAssetFromImportDraft({
        workspaceId: workspace.id,
        draft: importDraft,
      });
      void persistStoryState({
        ...upsertStoryAsset({
          ...storyState,
          activeStoryId: story.id,
        }, story),
        activeStoryId: story.id,
      });
      setActiveTab("overview");
      setIsImportOpen(false);
      toast.success("故事已导入。");
    } catch (error) {
      console.error("Failed to import story", error);
      toast.error(error instanceof Error ? error.message : "故事导入失败。");
    }
  };

  const mergeImportIntoActiveStory = () => {
    if (!activeStory || !importDraft) {
      return;
    }

    try {
      assertStoryImportDraftReady(importDraft);
      const updatedStory = mergeStoryImportDraftIntoStory(activeStory, importDraft);
      persistStory(updatedStory);
      setActiveTab(importDraft.mode === "lorebookPatch" ? "world" : "overview");
      setIsImportOpen(false);
      toast.success("导入内容已合并。");
    } catch (error) {
      console.error("Failed to merge story import", error);
      toast.error(error instanceof Error ? error.message : "导入合并失败。");
    }
  };

  const pendingDraftCount = activeStory ? getPendingDraftCount(activeStory) : 0;

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
