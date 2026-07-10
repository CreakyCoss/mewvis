import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TavernRoomConfig } from "@/features/pages/taverns/manage/model";
import { buildStoryNodeScene } from "@/features/pages/stories/story/model/node";
import { TavernRoomDialog, type TavernRoomHandle } from "@/features/pages/taverns/room";
import type { TavernStoryData } from "@/features/pages/taverns/room/model";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryTavernSelectDialog } from "./dialog";

type OpenStoryTavernInput = {
  nodeId: string;
  roomConfig: TavernRoomConfig;
};

export const TavernStoryAction = () => {
  const buildNodeOptions = useStoryState((state) => state.buildNodeOptions);
  const getTavernWorkspacePath = useStoryState((state) => state.getTavernWorkspacePath);
  const story = useStoryState((state) => state.story);
  const storyWorkspace = useStoryState((state) => state.storyWorkspace);
  const [isNodeSelectOpen, setIsNodeSelectOpen] = useState(false);
  const roomDialogRef = useRef<TavernRoomHandle>(null);
  const storyNodeOptions = useMemo(() => buildNodeOptions(story), [buildNodeOptions, story]);

  useEffect(() => {
    setIsNodeSelectOpen(false);
  }, [story?.id]);

  const openStoryTavern = async ({ nodeId, roomConfig }: OpenStoryTavernInput) => {
    if (!story || !storyWorkspace) {
      toast.error("找不到故事工作区，无法打开酒馆。");
      return;
    }

    try {
      const storyNodeScene = buildStoryNodeScene(story, nodeId);
      const tavernStory: TavernStoryData = {
        ...storyNodeScene,
        roomConfig,
      };

      roomDialogRef.current?.({
        workspacePath: getTavernWorkspacePath(nodeId, roomConfig.id),
        story: tavernStory,
      });
    } catch (error) {
      console.error("Failed to open story in tavern", error);
      toast.error("无法打开酒馆呈现。");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`${editorHeaderActionButtonClassName} h-9`}
        onClick={() => setIsNodeSelectOpen(true)}
        disabled={!story}
      >
        <BookOpen className="size-3.5" />
        酒馆
      </Button>
      <StoryTavernSelectDialog
        open={isNodeSelectOpen}
        nodeOptions={storyNodeOptions}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsNodeSelectOpen(false);
          }
        }}
        onConfirm={(input) => openStoryTavern(input)}
      />
      <TavernRoomDialog bind={roomDialogRef} />
    </>
  );
};
