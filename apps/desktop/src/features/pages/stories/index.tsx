import { BookOpen, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  deleteStoryRecord,
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

  const openStoryTavern = (item: StoryLibraryItem) => {
    modulesRef.current?.close();
    tavernManageRef.current?.open(item);
  };

  const openCreateStoryDialog = () => {
    createDialogRef.current?.();
  };

  const handleStoryCreated = (item: StoryLibraryItem) => {
    setStoryItems((current) => [
      { ...item, status: "ready" },
      ...current.filter((currentItem) => currentItem.id !== item.id),
    ]);
    openStoryEditor(item);
  };

  const handleDeleteStory = async (item: Pick<StoryLibraryEntry, "id">) => {
    try {
      await deleteStoryRecord(item.id);
      setStoryItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      toast.success("故事及子工作区已删除。");
    } catch (error) {
      console.error("Failed to delete story", error);
      toast.error(error instanceof Error ? error.message : "故事删除失败。");
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

  const renderStoryList = () => {
    return (
      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="flex w-full flex-col gap-5 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
                <BookOpen className="size-5 text-primary" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" className="h-9 gap-1.5" onClick={openCreateStoryDialog}>
                <Plus className="size-4" />
                新建故事
              </Button>
            </div>
          </header>

          <section className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-start gap-5">
            {storyItems.map((item) =>
              item.status === "ready" ? (
                <StoryCard
                  key={item.id}
                  overview={item.overview}
                  onEdit={() => openStoryEditor(item)}
                  onTavern={() => openStoryTavern(item)}
                  onDelete={() => handleDeleteStory(item)}
                />
              ) : (
                <StoryUnavailableCard
                  key={item.id}
                  name={item.workspace.name}
                  workspacePath={item.workspace.path}
                  compatibility={item.compatibility}
                  isUpgrading={upgradingStoryId === item.id}
                  onUpgrade={() => handleUpgradeStory(item)}
                  onDelete={() => handleDeleteStory(item)}
                />
              ),
            )}
          </section>
        </div>
      </ScrollArea>
    );
  };

  const content = (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-muted/20 text-foreground">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {isLoading ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          </ScrollArea>
        ) : storyItems.length === 0 ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex min-h-[320px] flex-col px-6 py-5">
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <BookOpen className="size-10 text-muted-foreground" />
                <div className="text-base font-medium">暂无故事</div>
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

      <StoryModulesContent bind={modulesRef} onBack={backToStoryHome} />
      <TavernManageContent bind={tavernManageRef} onBack={backToStoryHome} />
      <StoryCreateDialog bind={createDialogRef} onCreated={handleStoryCreated} />
    </section>
  );

  return content;
};

export default StoriesPage;
