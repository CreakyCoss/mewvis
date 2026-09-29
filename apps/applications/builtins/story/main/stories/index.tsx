import { selectDirectory } from "@/platform/directories";
import { BookOpen, FolderInput, Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "design-system/components/ui/button";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import {
  deleteStoryRecord,
  importStory,
  loadStoryLibrary,
  upgradeStoryProject,
  type StoryLibraryEntry,
  type StoryLibraryItem,
} from "./storage";
import { StoryCard, StoryUnavailableCard } from "./components/story-card";
import { StoryCreateDialog, type StoryCreateDialogHandle } from "./components/story-create-dialog";
import { StoryModulesContent, type StoryModulesHandle } from "./story";
import { TavernManageContent, type TavernManageHandle } from "./tavern/manage";

export const StoriesPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const modulesRef = useRef<StoryModulesHandle>(null);
  const tavernManageRef = useRef<TavernManageHandle>(null);
  const createDialogRef = useRef<StoryCreateDialogHandle>(null);
  const [storyItems, setStoryItems] = useState<StoryLibraryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [upgradingStoryId, setUpgradingStoryId] = useState("");

  const replaceStorySearch = (search: string) => {
    navigate(
      {
        pathname: location.pathname,
        search,
        hash: location.hash,
      },
      { replace: true },
    );
  };

  const refreshStories = async () => {
    setIsLoading(true);
    try {
      setStoryItems(await loadStoryLibrary());
    } catch (error) {
      console.error("Failed to load story library", error);
      toast.error("无法加载故事。");
      setStoryItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshStories();
  }, []);

  const closeStoryViews = () => {
    modulesRef.current?.close();
    tavernManageRef.current?.close();
  };

  const backToStoryHome = () => {
    closeStoryViews();
    replaceStorySearch("");
    void refreshStories();
  };

  const openStoryEditor = (item: StoryLibraryItem) => {
    tavernManageRef.current?.close();
    modulesRef.current?.open(item);
  };

  const openCreateStoryDialog = () => {
    createDialogRef.current?.();
  };

  const handleImportStory = async () => {
    setIsImporting(true);
    try {
      const selected = await selectDirectory();
      if (typeof selected !== "string") return;

      const item = await importStory(selected);
      setStoryItems((current) => [
        { ...item, status: "ready" },
        ...current.filter((currentItem) => currentItem.id !== item.id),
      ]);
      toast.success("故事已导入。");
      openStoryEditor(item);
    } catch (error) {
      console.error("Failed to import story", error);
      toast.error(error instanceof Error ? error.message : "故事导入失败。");
    } finally {
      setIsImporting(false);
    }
  };

  const handleStoryCreated = (item: StoryLibraryItem) => {
    setStoryItems((current) => [
      { ...item, status: "ready" },
      ...current.filter((currentItem) => currentItem.id !== item.id),
    ]);
    openStoryEditor(item);
  };

  const handleDeleteStory = async (item: Pick<StoryLibraryEntry, "id">, deleteContent: boolean) => {
    try {
      await deleteStoryRecord(item.id, deleteContent);
      setStoryItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      toast.success(deleteContent ? "故事及工作区内容已删除。" : "故事已从列表删除，工作区内容已保留。");
      return true;
    } catch (error) {
      console.error("Failed to delete story", error);
      toast.error(error instanceof Error ? error.message : "故事删除失败。");
      return false;
    }
  };

  const handleUpgradeStory = async (item: Extract<StoryLibraryEntry, { status: "unavailable" }>) => {
    setUpgradingStoryId(item.id);
    try {
      const result = await upgradeStoryProject(item.workspace);
      if (!result.upgraded) {
        toast.error(result.compatibility.reason || "当前项目无法升级到应用支持的版本。");
        return;
      }
      toast.success("故事项目版本已升级。");
      await refreshStories();
    } catch (error) {
      console.error("Failed to upgrade story project", error);
      toast.error(error instanceof Error ? error.message : "故事项目升级失败。");
    } finally {
      setUpgradingStoryId("");
    }
  };

  const renderLibraryHeader = () => (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
        <BookOpen className="size-5" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-1.5"
          onClick={() => void handleImportStory()}
          disabled={isImporting}
        >
          {isImporting ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <FolderInput className="size-4" />
          )}
          {isImporting ? "正在导入" : "导入故事"}
        </Button>
        <Button type="button" className="h-10 gap-1.5" onClick={openCreateStoryDialog}>
          <Plus className="size-4" />
          新建故事
        </Button>
      </div>
    </header>
  );

  const renderStoryList = () => {
    return (
      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
          {renderLibraryHeader()}

          <section className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] items-start gap-5">
            {storyItems.map((item) =>
              item.status === "ready" ? (
                <StoryCard
                  key={item.id}
                  overview={item.overview}
                  workspacePath={item.workspace.path}
                  onEdit={() => openStoryEditor(item)}
                  onDelete={(deleteContent) => handleDeleteStory(item, deleteContent)}
                />
              ) : (
                <StoryUnavailableCard
                  key={item.id}
                  name={item.workspace.name}
                  workspacePath={item.workspace.path}
                  compatibility={item.compatibility}
                  isUpgrading={upgradingStoryId === item.id}
                  onUpgrade={() => handleUpgradeStory(item)}
                  onDelete={(deleteContent) => handleDeleteStory(item, deleteContent)}
                />
              ),
            )}
          </section>
        </div>
      </ScrollArea>
    );
  };

  const content = (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {isLoading ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="app-empty-state m-6 flex min-h-[320px] items-center justify-center rounded-2xl text-sm text-muted-foreground">
              加载中...
            </div>
          </ScrollArea>
        ) : storyItems.length === 0 ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="app-empty-state m-6 flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-2xl px-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
                <BookOpen className="size-7" />
              </span>
              <div className="text-base font-semibold">暂无故事</div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 bg-background"
                  onClick={() => void handleImportStory()}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <FolderInput className="size-4" />
                  )}
                  {isImporting ? "正在导入" : "导入故事"}
                </Button>
                <Button type="button" className="gap-2" onClick={openCreateStoryDialog}>
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

      <StoryModulesContent
        bind={modulesRef}
        onBack={backToStoryHome}
        onOpenTavernSettings={(item) => tavernManageRef.current?.open(item)}
      />
      <TavernManageContent bind={tavernManageRef} />
      <StoryCreateDialog bind={createDialogRef} onCreated={handleStoryCreated} />
    </section>
  );

  return content;
};

export default StoriesPage;
