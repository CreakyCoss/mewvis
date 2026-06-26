import { toast } from "sonner";
import {
  getStoryNodeDataPackage,
  upsertStoryAsset,
  type StoryAsset,
} from "@/features/story";
import {
  openTavernPresentationInput,
} from "@/features/pages/tavern/presentation/open";
import {
  resolveStoryNodeId,
  type StoryPresentationAdapter,
} from "./shared";
import {
  createTavernPresentationInputFromStoryDataPackage,
} from "./tavern-input";

const resolvePreferredTavernRoomIds = (
  story: StoryAsset,
) => [
  ...story.sourceRefs
    .filter((ref) => ref.channel === "tavern")
    .map((ref) => ref.id),
  story.id,
];

const upsertTavernStoryPresentationSourceRef = (
  story: StoryAsset,
  room: {
    id: string;
    title: string;
  },
): StoryAsset => ({
  ...story,
  sourceRefs: story.sourceRefs.some((ref) =>
    ref.channel === "tavern" && ref.id === room.id
  )
    ? story.sourceRefs
    : [...story.sourceRefs, { channel: "tavern", id: room.id, label: room.title }],
});

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
    storyState,
    persistStoryState,
    navigate,
    nodeId,
    setOpeningStoryId,
  }) => {
    const targetNodeId = resolveStoryNodeId(activeStory, nodeId);
    const dataPackage = getStoryNodeDataPackage(activeStory, {
      nodeId: targetNodeId,
    });
    const presentationInput = createTavernPresentationInputFromStoryDataPackage(dataPackage);
    setOpeningStoryId(activeStory.id);

    try {
      const { room, target } = await openTavernPresentationInput({
        workspace,
        presentationInput,
        preferredRoomIds: resolvePreferredTavernRoomIds(activeStory),
        targetNodeId,
      });
      await persistStoryState(upsertStoryAsset(
        storyState,
        upsertTavernStoryPresentationSourceRef(activeStory, room),
      ));
      navigate(target);
    } catch (error) {
      console.error("Failed to open story in tavern", error);
      toast.error("无法打开酒馆呈现。");
    } finally {
      setOpeningStoryId("");
    }
  },
} satisfies StoryPresentationAdapter<"tavern">;
