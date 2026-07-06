import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openTavernPresentationInput } from "@/features/pages/taverns/tavern/presentation/open";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";
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
  const navigate = useNavigate();
  const buildNodeOptions = useStoryState((state) => state.buildNodeOptions);
  const getTavernWorkspacePath = useStoryState((state) => state.getTavernWorkspacePath);
  const story = useStoryState((state) => state.story);
  const storyWorkspace = useStoryState((state) => state.storyWorkspace);
  const [tavernSelectNodeId, setTavernSelectNodeId] = useState<string | null | undefined>(undefined);
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
      const { runtimeState, target } = await openTavernPresentationInput({
        workspace: storyWorkspace,
        storyId: story.id,
        storyNodeId,
        tavernId: tavernRoom.id,
        runtimePath: getTavernWorkspacePath(storyNodeId),
        carrierRoom: tavernRoom,
        presentationInput: createTavernPayload(story, {
          nodeId: storyNodeId,
        }),
      });
      navigate(target, {
        state: {
          tavernRuntimeState: runtimeState,
        },
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
    </>
  );
};
