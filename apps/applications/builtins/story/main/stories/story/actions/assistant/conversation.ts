import { getApplicationChatClient } from "@mewvis/app-sdk/chat";
import { workspaceForPath } from "@/platform/bridge";
import type { StoryLibraryItem } from "../../../storage";
import { prepareStoryChatProfile } from "./resources";

const opening = new Map<string, Promise<string>>();
export const openStoryConversation = (
  story: StoryLibraryItem,
  fresh = false,
) => {
  const key = `${story.workspace.path}:${fresh ? "new" : "latest"}`;
  if (opening.has(key)) return opening.get(key)!;
  const pending = (async () => {
    const client = getApplicationChatClient();
    const workspace = await workspaceForPath(story.workspace.path);
    const latest = fresh
      ? undefined
      : (await client.listSessions({ workspaceId: workspace.id }))
          .filter((chat) => chat.sceneId === "story-assistant")
          .sort(
            (a, b) =>
              b.updatedAt - a.updatedAt ||
              b.createdAt - a.createdAt ||
              b.chatId.localeCompare(a.chatId),
          )[0];
    if (latest) return latest.chatId;
    const session = await client.createSession({
      workspaceId: workspace.id,
      sceneId: "story-assistant",
      profile: prepareStoryChatProfile({
        ...story,
        workspace: { ...story.workspace, id: workspace.id },
      }),
    });
    const flushed = await session.flush();
    if (!flushed.ok) throw new Error(flushed.error);
    return session.identity.id;
  })().finally(() => opening.delete(key));
  opening.set(key, pending);
  return pending;
};
