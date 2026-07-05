import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { StoryJson } from "./story/model/types";
import { deleteStoryRecord, loadStoryLibrary } from "./storage";
import { StoryCard } from "./components/story-card";
import { StoryCreateDialog, type StoryCreateDialogHandle } from "./components/story-create-dialog";
import { StoryModulesContent, type StoryModulesHandle } from "./story";
import { FULLSCREEN_SEARCH, isFullscreenSearch } from "@/utils/navigation";

export const StoriesPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomeFullscreen = isFullscreenSearch(location.search);
  const modulesRef = useRef<StoryModulesHandle>(null);
  const createDialogRef = useRef<StoryCreateDialogHandle>(null);
  const [editingStoryId, setEditingStoryId] = useState("");
  const [stories, setStories] = useState<StoryJson[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      const { stories } = await loadStoryLibrary();
      setStories(stories);
    } catch (error) {
      console.error("Failed to load story library", error);
      toast.error("无法加载故事。");
      setStories([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshStories();
  }, []);

  const exitHomeFullscreen = () => {
    setEditingStoryId("");
    replaceStorySearch("");
  };

  const backToStoryHome = () => {
    setEditingStoryId("");
    replaceStorySearch(FULLSCREEN_SEARCH);
    void refreshStories();
  };

  const openStoryEditor = (story: StoryJson) => {
    modulesRef.current?.open(story);
    setEditingStoryId(story.id);
    navigate({
      pathname: location.pathname,
      search: FULLSCREEN_SEARCH,
      hash: location.hash,
    });
  };

  const openCreateStoryDialog = () => {
    createDialogRef.current?.();
  };

  const handleStoryCreated = (story: StoryJson) => {
    setStories((current) => [story, ...current.filter((item) => item.id !== story.id)]);
    openStoryEditor(story);
  };

  const handleDeleteStory = async (story: StoryJson) => {
    try {
      await deleteStoryRecord(story.id);
      setStories((current) => current.filter((item) => item.id !== story.id));
      if (editingStoryId === story.id) {
        backToStoryHome();
      }
      toast.success("故事及工作区已删除。");
    } catch (error) {
      console.error("Failed to delete story", error);
      toast.error(error instanceof Error ? error.message : "故事删除失败。");
    }
  };

  const renderStoryList = () => {
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
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" className="h-9 gap-1.5" onClick={openCreateStoryDialog}>
                <Plus className="size-4" />
                新建故事
              </Button>
            </div>
          </header>

          <section className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-start gap-5">
            {stories.map((item) => (
              <StoryCard
                key={item.id}
                story={item}
                onEdit={() => openStoryEditor(item)}
                onDelete={() => handleDeleteStory(item)}
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
        <div className={editingStoryId ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <StoryModulesContent bind={modulesRef} onBack={backToStoryHome} />
        </div>
        {editingStoryId ? null : isLoading ? (
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

      <StoryCreateDialog bind={createDialogRef} onCreated={handleStoryCreated} />
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

export default StoriesPage;
