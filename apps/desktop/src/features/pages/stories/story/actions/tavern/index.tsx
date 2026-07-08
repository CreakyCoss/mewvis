import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { TavernRoomDialog, type TavernRoomHandle } from "@/features/pages/taverns/room";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryTavernSelectDialog } from "./dialog";
import { createTavernPayload } from "./payload";
import { getDefaultNodeId, resolveNodeId } from "../node";

type OpenStoryTavernInput = {
  nodeId: string;
  tavernRoom: TavernRoom;
};

export const TavernStoryAction = () => {
  const buildNodeOptions = useStoryState((state) => state.buildNodeOptions);
  const getTavernWorkspacePath = useStoryState((state) => state.getTavernWorkspacePath);
  const story = useStoryState((state) => state.story);
  const storyWorkspace = useStoryState((state) => state.storyWorkspace);
  const [tavernSelectNodeId, setTavernSelectNodeId] = useState<string | null | undefined>(undefined);
  const roomDialogRef = useRef<TavernRoomHandle>(null);
  const storyNodeOptions = useMemo(() => buildNodeOptions(story), [buildNodeOptions, story]);

  useEffect(() => {
    setTavernSelectNodeId(undefined);
  }, [story?.id]);

  const openStoryTavern = async ({ nodeId, tavernRoom }: OpenStoryTavernInput) => {
    if (!story || !storyWorkspace) {
      toast.error("找不到故事工作区，无法打开酒馆。");
      return;
    }

    const storyNodeId = resolveNodeId(story, nodeId);
    try {
      roomDialogRef.current?.({
        tavernRoom,
        openingInput: createTavernPayload(story, {
          nodeId: storyNodeId,
        }),
        tavernWorkspacePath: getTavernWorkspacePath(storyNodeId, tavernRoom.id),
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
        onClick={() => setTavernSelectNodeId(getDefaultNodeId(story))}
        disabled={!story}
      >
        <BookOpen className="size-3.5" />
        酒馆
      </Button>
      <StoryTavernSelectDialog
        open={tavernSelectNodeId !== undefined}
        initialNodeId={tavernSelectNodeId ?? undefined}
        nodeOptions={storyNodeOptions}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setTavernSelectNodeId(undefined);
          }
        }}
        onConfirm={(input) => openStoryTavern(input)}
      />
      <TavernRoomDialog bind={roomDialogRef} />
    </>
  );
};
