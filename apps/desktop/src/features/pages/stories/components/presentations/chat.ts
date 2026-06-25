import {
  resolveStoryNodeId,
  type StoryPresentationAdapter,
} from "./shared";

export const chatStoryPresentation = {
  definition: {
    channel: "chat",
    label: "聊天",
    icon: "chat",
  },
  open: ({
    workspace,
    seed,
    navigate,
    nodeId,
  }) => {
    const targetNodeId = resolveStoryNodeId(seed, nodeId);
    const search = [
      `storyId=${encodeURIComponent(seed.story.id)}`,
      targetNodeId ? `storyNodeId=${encodeURIComponent(targetNodeId)}` : "",
    ].filter(Boolean).join("&");

    navigate({
      pathname: `/chat/${workspace.id}/new`,
      search: search ? `?${search}` : "",
    });
  },
} satisfies StoryPresentationAdapter<"chat">;
