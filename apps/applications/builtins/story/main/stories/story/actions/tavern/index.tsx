import { BookOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "design-system/components/ui/button";
import { loadOrCreateStoryTavernConfig } from "@/stories/tavern/manage/storage";
import { TavernRoomDialog, type TavernRoomHandle } from "@/stories/tavern/room";
import {
  loadTavernChapterOptions,
  loadTavernStoryData,
  tavernChapterWorkspacePath,
  type TavernChapterOption,
} from "@/stories/tavern/room/story-project";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryTavernSelectDialog } from "./dialog";

export const TavernStoryAction = () => {
  const storyWorkspace = useStoryState((state) => state.storyWorkspace);
  const [isChapterSelectOpen, setIsChapterSelectOpen] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [chapterOptions, setChapterOptions] = useState<TavernChapterOption[]>([]);
  const roomDialogRef = useRef<TavernRoomHandle>(null);

  useEffect(() => {
    setIsChapterSelectOpen(false);
    setChapterOptions([]);
  }, [storyWorkspace?.id]);

  const openChapterSelect = async () => {
    if (!storyWorkspace) return;
    setIsChapterSelectOpen(true);
    setIsLoadingChapters(true);
    try {
      setChapterOptions(await loadTavernChapterOptions(storyWorkspace.path));
    } catch (error) {
      console.error("Failed to load story chapters", error);
      toast.error(error instanceof Error ? error.message : "无法读取故事章节。");
      setChapterOptions([]);
    } finally {
      setIsLoadingChapters(false);
    }
  };

  const openStoryTavern = async (chapterId: string) => {
    if (!storyWorkspace) {
      toast.error("找不到故事工作区，无法打开酒馆。");
      return;
    }

    try {
      const roomConfig = await loadOrCreateStoryTavernConfig({
        id: storyWorkspace.id,
        workspace: storyWorkspace,
      });
      const tavernStory = await loadTavernStoryData({
        chapterId,
        roomConfig,
        workspacePath: storyWorkspace.path,
      });

      roomDialogRef.current?.({
        workspacePath: tavernChapterWorkspacePath(storyWorkspace, chapterId),
        story: tavernStory,
      });
    } catch (error) {
      console.error("Failed to open story in tavern", error);
      toast.error(error instanceof Error ? error.message : "无法打开酒馆呈现。");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`${editorHeaderActionButtonClassName} h-9`}
        onClick={() => void openChapterSelect()}
        disabled={!storyWorkspace}
      >
        <BookOpen className="size-3.5" />
        酒馆
      </Button>
      <StoryTavernSelectDialog
        open={isChapterSelectOpen}
        chapterOptions={chapterOptions}
        isLoading={isLoadingChapters}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsChapterSelectOpen(false);
          }
        }}
        onConfirm={openStoryTavern}
      />
      <TavernRoomDialog bind={roomDialogRef} />
    </>
  );
};
