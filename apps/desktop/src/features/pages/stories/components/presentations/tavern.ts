import { toast } from "sonner";
import {
  openTavernStoryPresentation,
} from "@/features/pages/tavern/adapters/story";
import {
  resolveStoryNodeId,
  type StoryPresentationAdapter,
} from "./shared";

export const tavernStoryPresentation = {
  definition: {
    channel: "tavern",
    label: "酒馆",
    loadingLabel: "打开中",
    icon: "tavern",
  },
  open: async ({
    workspace,
    activeStory,
    seed,
    storyState,
    persistStoryState,
    navigate,
    nodeId,
    setOpeningStoryId,
  }) => {
    const targetNodeId = resolveStoryNodeId(seed, nodeId);
    setOpeningStoryId(seed.story.id);

    try {
      const target = await openTavernStoryPresentation({
        workspace,
        activeStory,
        seed,
        storyState,
        targetNodeId,
        persistStoryState,
      });
      navigate(target);
    } catch (error) {
      console.error("Failed to open story in tavern", error);
      toast.error("无法打开酒馆呈现。");
    } finally {
      setOpeningStoryId("");
    }
  },
} satisfies StoryPresentationAdapter<"tavern">;
