import {
  ArrowLeft,
  BookOpen,
  FileText,
  FileUp,
  GitBranch,
  Pencil,
  Plus,
  Target,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { resolveAvatar } from "@/assets/avatars";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { StoryJson } from "@/features/story/model/story-types";
import {
  createStory as createStoryInWorkspace,
  deleteStoryRecord,
  loadStoryById,
  loadStoryLibrary,
  saveStoryJson,
  updateStoryRecordName,
  type CreateStoryInput,
  type StoryWorkspace,
} from "@/features/story/persistence/story-storage";
import { StoryCreateDialog, type StoryCreateForm } from "./components/story-create-dialog";
import { StoryModulesContent, type StoryModulesHandle } from "./story";
import { StoryImportDialog } from "./story/actions/import";
import {
  STORIES_FULLSCREEN_SEARCH_PARAM,
  STORIES_STORY_SEARCH_PARAM,
  buildStoryOpenSearch,
  isStoriesFullscreenSearch,
} from "./navigation";

export const StoriesPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomeFullscreen = isStoriesFullscreenSearch(location.search);
  const modulesRef = useRef<StoryModulesHandle>(null);
  const pendingOpenStoryRef = useRef<StoryJson | null>(null);
  const lastOpenedStoryIdRef = useRef("");
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedStoryId = searchParams.get(STORIES_STORY_SEARCH_PARAM)?.trim() ?? "";
  const [stories, setStories] = useState<StoryJson[]>([]);
  const [storyWorkspacesById, setStoryWorkspacesById] = useState<Record<string, StoryWorkspace>>({});
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [pendingDeleteStory, setPendingDeleteStory] = useState<StoryJson | null>(null);
  const [createForm, setCreateForm] = useState<StoryCreateForm>({
    name: "",
    workspacePath: "",
  });

  const activeStory = stories.find((story) => story.id === requestedStoryId) ?? pendingOpenStoryRef.current ?? null;
  const selectedStory = stories.find((story) => story.id === selectedStoryId) ?? activeStory ?? stories[0] ?? null;
  const isEditorOpen = isHomeFullscreen && Boolean(requestedStoryId) && (isLoading || Boolean(activeStory));

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

  const refreshStories = useCallback(async () => {
    setIsLoading(true);
    try {
      const { state, workspacesByStoryId } = await loadStoryLibrary(requestedStoryId);
      setStories(state.stories);
      setStoryWorkspacesById(workspacesByStoryId);
      setSelectedStoryId((current) =>
        current && state.stories.some((story) => story.id === current)
          ? current
          : state.activeStoryId || state.stories[0]?.id || "",
      );
    } catch (error) {
      console.error("Failed to load story library", error);
      toast.error("无法加载故事。");
      setStories([]);
      setStoryWorkspacesById({});
      setSelectedStoryId("");
    } finally {
      setIsLoading(false);
    }
  }, [requestedStoryId]);

  useEffect(() => {
    void refreshStories();
  }, [refreshStories]);

  useEffect(() => {
    if (!isEditorOpen) {
      lastOpenedStoryIdRef.current = "";
      return;
    }
    if (!activeStory || lastOpenedStoryIdRef.current === requestedStoryId) {
      return;
    }
    if (!modulesRef.current) {
      return;
    }

    modulesRef.current(activeStory);
    pendingOpenStoryRef.current = null;
    lastOpenedStoryIdRef.current = activeStory.id;
    setSelectedStoryId(activeStory.id);
  }, [activeStory, isEditorOpen, requestedStoryId]);

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
    (story: StoryJson) => {
      pendingOpenStoryRef.current = story;
      setSelectedStoryId(story.id);
      navigate({
        pathname: location.pathname,
        search: buildStoryOpenSearch({ storyId: story.id, fullscreen: true }),
        hash: location.hash,
      });
    },
    [location.hash, location.pathname, navigate],
  );

  const createStoryWorkspace = useCallback(async (input: CreateStoryInput) => {
    setIsSaving(true);
    try {
      const { record, story, workspace: storyWorkspace } = await createStoryInWorkspace(input);
      setStories((current) => [story, ...current.filter((item) => item.id !== story.id)]);
      setStoryWorkspacesById((current) => ({
        ...current,
        [story.id]: storyWorkspace,
      }));
      setSelectedStoryId(story.id);
      toast.success("故事已创建。");
      return {
        record,
        story,
        workspace: storyWorkspace,
      };
    } catch (error) {
      console.error("Failed to create story", error);
      toast.error(error instanceof Error ? error.message : "故事创建失败。");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const openCreateStoryDialog = () => {
    setCreateForm({
      name: "",
      workspacePath: "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleCreateStory = async () => {
    const created = await createStoryWorkspace(createForm);
    if (!created) {
      return;
    }

    setIsCreateDialogOpen(false);
    openStoryEditor(created.story);
  };

  const resolveStoryWorkspace = useCallback(
    async (storyId: string) => {
      if (storyWorkspacesById[storyId]) {
        return storyWorkspacesById[storyId];
      }

      const loaded = await loadStoryById(storyId);
      if (!loaded) {
        return null;
      }
      setStoryWorkspacesById((current) => ({
        ...current,
        [storyId]: loaded.workspace,
      }));
      return loaded.workspace;
    },
    [storyWorkspacesById],
  );

  const persistStoryFromPage = useCallback(
    async (story: StoryJson) => {
      const storyWorkspace = await resolveStoryWorkspace(story.id);
      if (!storyWorkspace) {
        toast.error("找不到故事工作区，无法保存。");
        return null;
      }

      setIsSaving(true);
      try {
        const savedStory = await saveStoryJson(storyWorkspace, {
          ...story,
          workspaceId: storyWorkspace.id,
          updatedAt: Date.now(),
        });
        let nextWorkspace = storyWorkspace;
        if (storyWorkspace.name !== savedStory.title) {
          const updatedRecord = await updateStoryRecordName(savedStory.id, savedStory.title);
          nextWorkspace = {
            id: updatedRecord.id,
            name: updatedRecord.name,
            path: updatedRecord.workspacePath,
          };
        }

        setStoryWorkspacesById((current) => ({
          ...current,
          [savedStory.id]: nextWorkspace,
        }));
        setStories((current) => current.map((item) => (item.id === savedStory.id ? savedStory : item)));
        return savedStory;
      } catch (error) {
        console.error("Failed to save story", error);
        toast.error("故事保存失败。");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [resolveStoryWorkspace],
  );

  const saveImportedStory = useCallback(
    async (story: StoryJson) => {
      const savedStory = await persistStoryFromPage(story);
      if (savedStory) {
        pendingOpenStoryRef.current = savedStory;
        openStoryEditor(savedStory);
        modulesRef.current?.(savedStory);
      }
      return savedStory;
    },
    [openStoryEditor, persistStoryFromPage],
  );

  const handleDeleteStory = async (story: StoryJson) => {
    setIsSaving(true);
    try {
      await deleteStoryRecord(story.id);
      setStories((current) => current.filter((item) => item.id !== story.id));
      setStoryWorkspacesById((current) => {
        const next = { ...current };
        delete next[story.id];
        return next;
      });
      setSelectedStoryId((current) => (current === story.id ? "" : current));
      if (requestedStoryId === story.id) {
        backToStoryHome();
      }
      setPendingDeleteStory(null);
      toast.success("故事及工作区已删除。");
    } catch (error) {
      console.error("Failed to delete story", error);
      toast.error(error instanceof Error ? error.message : "故事删除失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const renderStoryList = () => {
    const totalCharacterCount = stories.reduce((sum, item) => sum + item.characters.length, 0);
    const totalNodeCount = stories.reduce((sum, item) => sum + item.graph.nodes.length, 0);
    const totalDraftCount = stories.reduce(
      (sum, item) => sum + item.manuscriptInbox.drafts.filter((draft) => draft.status === "pending").length,
      0,
    );

    return (
      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="flex w-full flex-col gap-5 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {isHomeFullscreen ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0"
                  title="返回侧边栏"
                  aria-label="返回侧边栏"
                  onClick={exitHomeFullscreen}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              ) : null}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
                <BookOpen className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-7">故事</h1>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{stories.length} 个故事</span>
                  <span>{totalCharacterCount} 角色</span>
                  <span>{totalNodeCount} 节点</span>
                  <span>{totalDraftCount} 待收稿</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => setIsImportOpen(true)}
                disabled={isSaving || !selectedStory}
              >
                <FileUp className="size-4" />
                导入故事
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5"
                onClick={openCreateStoryDialog}
                disabled={isSaving}
              >
                <Plus className="size-4" />
                新建故事
              </Button>
            </div>
          </header>

          <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-5">
            {stories.map((item) => (
              <StoryCard
                key={item.id}
                story={item}
                isActive={item.id === selectedStory?.id}
                onSelect={() => setSelectedStoryId(item.id)}
                onEdit={() => openStoryEditor(item)}
                onDelete={() => setPendingDeleteStory(item)}
              />
            ))}
          </section>
        </div>
      </ScrollArea>
    );
  };

  const content = (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-muted/20 text-foreground">
      <div className="flex min-w-0 flex-1 flex-col">
        {isEditorOpen ? (
          <StoryModulesContent bind={modulesRef} />
        ) : isLoading ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          </ScrollArea>
        ) : stories.length === 0 ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex min-h-[320px] flex-col px-6 py-5">
              {isHomeFullscreen ? (
                <div className="flex shrink-0">
                  <Button type="button" variant="ghost" className="h-9 gap-2 px-2.5" onClick={exitHomeFullscreen}>
                    <ArrowLeft className="size-4" />
                    返回
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <BookOpen className="size-10 text-muted-foreground" />
                <div className="text-base font-medium">暂无故事</div>
                <Button type="button" className="gap-2" onClick={openCreateStoryDialog} disabled={isSaving}>
                  <Plus className="size-4" />
                  新建故事
                </Button>
              </div>
            </div>
          </ScrollArea>
        ) : (
          renderStoryList()
        )}
      </div>

      <StoryImportDialog
        open={isImportOpen}
        originalStory={selectedStory}
        onOpenChange={setIsImportOpen}
        onSaveStory={saveImportedStory}
      />

      <StoryCreateDialog
        open={isCreateDialogOpen}
        form={createForm}
        isSaving={isSaving}
        onOpenChange={setIsCreateDialogOpen}
        onFormChange={setCreateForm}
        onSubmit={handleCreateStory}
      />

      <AlertDialog open={Boolean(pendingDeleteStory)} onOpenChange={(open) => !open && setPendingDeleteStory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除故事？</AlertDialogTitle>
            <AlertDialogDescription>
              删除「{pendingDeleteStory?.title ?? "当前故事"}」及其整个故事工作区？这个操作会同时删除 story/ 和 .tavern/
              运行时数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSaving || !pendingDeleteStory}
              onClick={() => {
                if (pendingDeleteStory) {
                  void handleDeleteStory(pendingDeleteStory);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

const StoryCardMetric = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) => (
  <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5 text-[11px] text-foreground/80">
    <Icon className="size-3.5 shrink-0" />
    <span className="truncate">
      {value} {label}
    </span>
  </span>
);

const StoryCard = ({
  story,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  story: StoryJson;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const activeNode =
    story.graph.nodes.find((node) => node.id === story.graph.activeNodeId) ??
    story.graph.nodes.find((node) => node.id === story.graph.entryNodeId) ??
    story.graph.nodes[0] ??
    null;
  const pendingDraftCount = story.manuscriptInbox.drafts.filter((draft) => draft.status === "pending").length;
  const visibleCharacters = story.characters.slice(0, 4);
  const hiddenCharacterCount = Math.max(0, story.characters.length - visibleCharacters.length);

  return (
    <article
      className={[
        "flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_18px_50px_-42px_rgb(15_23_42_/_0.55)] transition-colors",
        isActive
          ? "border-primary/45 bg-primary/[0.035] shadow-[0_20px_58px_-38px_rgb(13_148_136_/_0.45)]"
          : "hover:border-primary/20",
      ].join(" ")}
    >
      <button
        type="button"
        className="flex min-w-0 flex-col text-left transition-colors hover:bg-accent/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={onSelect}
      >
        <div className="relative">
          <div className="h-[clamp(6.25rem,9vw,7.5rem)] w-full overflow-hidden rounded-t-lg bg-gradient-to-br from-primary/15 via-muted to-background shadow-inner" />
          <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-teal-100/30 bg-slate-950/65 px-2.5 py-1 text-xs font-semibold leading-4 text-teal-50 shadow-[0_12px_28px_-18px_rgb(15_23_42_/_0.9)] ring-1 ring-teal-100/24 backdrop-blur-md">
            标准故事
          </span>
          <div className="absolute inset-x-0 -bottom-6 flex justify-start px-4">
            <div className="flex min-w-0 items-end overflow-hidden pb-px">
              {visibleCharacters.length > 0 ? (
                <div className="flex min-w-0 items-end">
                  {visibleCharacters.map((character, index) => {
                    const avatar = resolveAvatar(character.avatar);
                    return (
                      <span
                        key={character.id}
                        className={[
                          "flex size-12 items-center justify-center overflow-hidden rounded-lg border-2 border-background bg-background shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]",
                          index > 0 ? "-ml-3" : "",
                        ].join(" ")}
                      >
                        <img src={avatar.src} alt={character.name} className="size-full object-cover" />
                      </span>
                    );
                  })}
                  {hiddenCharacterCount > 0 ? (
                    <span className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-lg border-2 border-background bg-background/95 text-sm font-semibold text-muted-foreground shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                      +{hiddenCharacterCount}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="flex size-12 items-center justify-center rounded-lg border-2 border-background bg-background/90 text-primary shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                  <BookOpen className="size-5" />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col px-3.5 pt-8 pb-3">
          <h3 className="min-w-0 text-xl font-semibold leading-7 line-clamp-2">{story.title}</h3>
          <p className="mt-1.5 min-h-5 line-clamp-1 text-xs leading-5 text-muted-foreground">
            {story.outline || "暂无故事定位。"}
          </p>

          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <StoryCardMetric icon={UsersRound} label="角色" value={story.characters.length} />
            <StoryCardMetric icon={GitBranch} label="节点" value={story.graph.nodes.length} />
            <StoryCardMetric icon={BookOpen} label="场景" value={story.scenes.length} />
          </div>

          <div className="mt-2.5">
            <div className="border-t pt-2.5">
              <div className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.055] px-3 py-2 text-xs leading-5 text-muted-foreground">
                <Target className="absolute -right-3 -bottom-4 size-14 text-primary/5" />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Target className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-5 text-foreground">当前目标</div>
                  <div className="line-clamp-1">{story.goal || activeNode?.title || "暂无整体目标。"}</div>
                </div>
              </div>
            </div>
            {pendingDraftCount > 0 ? (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3.5" />
                {pendingDraftCount} 篇待收稿
              </div>
            ) : null}
          </div>
        </div>
      </button>

      <div className="border-t bg-background/80 p-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <Button
            type="button"
            size="sm"
            variant={isActive ? "secondary" : "outline"}
            className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
            onClick={onSelect}
          >
            <BookOpen className="size-4 shrink-0" />
            <span className="truncate">{isActive ? "已选中" : "选中"}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
            onClick={onEdit}
          >
            <Pencil className="size-4 shrink-0" />
            <span className="truncate">编辑</span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9 shrink-0 bg-background/80 text-destructive hover:text-destructive"
            title="删除故事及工作区"
            aria-label="删除故事及工作区"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  );
};

export default StoriesPage;
