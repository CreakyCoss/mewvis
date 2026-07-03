import { toast } from "sonner";
import { getStoryNodeDataPackage } from "@/features/story";
import { openTavernPresentationInput } from "@/features/pages/tavern/presentation/open";
import type { TavernRoom } from "@/features/pages/tavern/types";
import { resolveStoryNodeId, type StoryPresentationAdapter } from "./shared";
import { createTavernPresentationInputFromStoryDataPackage } from "./tavern-input";

const trimPathEnd = (value: string) => value.trim().replace(/[\\/]+$/, "");

const tavernPathSegment = (value: string, fallback: string) =>
  value
    .trim()
    .replace(/[\\/]/g, "-")
    .replace(/\.\./g, "")
    .replace(/^\.+/, "")
    .trim() || fallback;

export const buildStoryTavernRuntimePath = ({
  storyWorkspacePath,
  storyId,
  tavernId,
}: {
  storyWorkspacePath: string;
  storyId: string;
  tavernId: string;
}) => [
  trimPathEnd(storyWorkspacePath),
  ".tavern",
  tavernPathSegment(storyId, "story"),
  tavernPathSegment(tavernId, "tavern"),
].join("/");

export const openStoryTavernPresentation = async ({
  storyWorkspace,
  activeStory,
  tavernRoom,
  navigate,
  nodeId,
  setOpeningStoryId,
}: {
  storyWorkspace: NonNullable<Parameters<StoryPresentationAdapter<"tavern">["open"]>[0]["storyWorkspace"]>;
  activeStory: Parameters<StoryPresentationAdapter<"tavern">["open"]>[0]["activeStory"];
  tavernRoom: TavernRoom;
  navigate: Parameters<StoryPresentationAdapter<"tavern">["open"]>[0]["navigate"];
  nodeId?: string | null;
  setOpeningStoryId: Parameters<StoryPresentationAdapter<"tavern">["open"]>[0]["setOpeningStoryId"];
}) => {
  const targetNodeId = resolveStoryNodeId(activeStory, nodeId);
  const dataPackage = getStoryNodeDataPackage(activeStory, {
    nodeId: targetNodeId,
  });
  const presentationInput = createTavernPresentationInputFromStoryDataPackage(dataPackage);
  setOpeningStoryId(activeStory.id);

  try {
    const { target } = await openTavernPresentationInput({
      workspace: storyWorkspace,
      storyId: activeStory.id,
      storyNodeId: targetNodeId,
      tavernId: tavernRoom.id,
      runtimePath: buildStoryTavernRuntimePath({
        storyWorkspacePath: storyWorkspace.path,
        storyId: activeStory.id,
        tavernId: tavernRoom.id,
      }),
      carrierRoom: tavernRoom,
      presentationInput,
    });
    navigate(target);
  } catch (error) {
    console.error("Failed to open story in tavern", error);
    toast.error("无法打开酒馆呈现。");
  } finally {
    setOpeningStoryId("");
  }
};

export const tavernStoryPresentation = {
  definition: {
    channel: "tavern",
    label: "酒馆",
    loadingLabel: "打开中",
    icon: "tavern",
  },
  open: async ({ storyWorkspace, activeStory, tavernRoom, navigate, nodeId, setOpeningStoryId }) => {
    if (!storyWorkspace) {
      toast.error("找不到故事工作区，无法打开酒馆。");
      return;
    }
    if (!tavernRoom) {
      toast.error("请选择一个酒馆后进入。");
      return;
    }

    await openStoryTavernPresentation({
      storyWorkspace,
      activeStory,
      tavernRoom,
      navigate,
      nodeId,
      setOpeningStoryId,
    });
  },
} satisfies StoryPresentationAdapter<"tavern">;
