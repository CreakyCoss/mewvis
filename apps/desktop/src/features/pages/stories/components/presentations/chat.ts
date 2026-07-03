import { resolveStoryNodeId, type StoryPresentationAdapter } from "./shared";

export const chatStoryPresentation = {
  definition: {
    channel: "chat",
    label: "聊天",
    icon: "chat",
  },
  open: ({ workspace, activeStory, navigate, nodeId }) => {
    if (!workspace) {
      return;
    }

    const targetNodeId = resolveStoryNodeId(activeStory, nodeId);
    const search = [
      `storyId=${encodeURIComponent(activeStory.id)}`,
      targetNodeId ? `storyNodeId=${encodeURIComponent(targetNodeId)}` : "",
    ]
      .filter(Boolean)
      .join("&");

    navigate({
      pathname: `/chat/${workspace.id}/new`,
      search: search ? `?${search}` : "",
    });
  },
} satisfies StoryPresentationAdapter<"chat">;
