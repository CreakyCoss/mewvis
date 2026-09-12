import { useMemo } from "react";
import { Chat } from "@/chat/react";
import { useDesktopChatSession } from "@/chat/desktop/react";
import type { ChatMessage } from "@/chat/core";
import type { StoryLibraryItem } from "../../../storage";
import { prepareStoryChatProfile } from "./resources";

const createStoryIntroduction = (story: StoryLibraryItem): ChatMessage => ({
  id: `story-introduction:${story.id}`,
  role: "assistant",
  status: "done",
  createdAt: Date.now(),
  blocks: [
    {
      id: `story-introduction-text:${story.id}`,
      type: "text",
      content: [
        `已连接「${story.overview.title}」的结构化故事项目。`,
        "",
        "我可以帮你开书、完善作品定位、设计卷纲和章节细纲，也可以按细纲写作。所有变更会先校验，只有通过后才会写入故事。",
      ].join("\n"),
    },
  ],
});

export function StoryChat({ story, chatId }: { story: StoryLibraryItem; chatId: string }) {
  const profile = useMemo(
    () => ({ ...prepareStoryChatProfile(story), initialMessages: [createStoryIntroduction(story)] }),
    [story],
  );
  const { session, error } = useDesktopChatSession(
    chatId
      ? {
          identity: { scope: `workspace:${story.workspace.id}`, id: chatId },
          workspaceId: story.workspace.id,
          origin: { kind: "builtin", sceneId: "story-assistant" },
          workspacePath: story.workspace.path,
          profile,
        }
      : null,
  );
  if (!session) return <Chat.Loading error={error || (!chatId ? "会话 ID 无效" : undefined)} />;
  return <Chat session={session} />;
}
