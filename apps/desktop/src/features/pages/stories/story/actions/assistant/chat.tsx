import { useEffect, useMemo, useState } from "react";
import { loadChat, saveChat } from "@/api/chat";
import { Spinner } from "@/components/ui/spinner";
import { Chat } from "@/features/pages/chats/chat";
import type { ChatInitialData, ChatMessage } from "@/features/pages/chats/chat/type";
import type { ChatInputResources } from "@/features/pages/chats/components/chat-input/type";
import type { StoryLibraryItem } from "../../../storage";
import { prepareStoryChatResources } from "./resources";

const defaultDisplayOptions = {
  showThinkingProcess: true,
  showToolCallProcess: true,
};

type StoryChatState = {
  resources: ChatInputResources;
  isLoading: boolean;
  error: string;
};

const initialState: StoryChatState = {
  resources: {},
  isLoading: true,
  error: "",
};

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

type StoryChatProps = {
  story: StoryLibraryItem;
  chatId: string;
};

export const StoryChat = ({ story, chatId }: StoryChatProps) => {
  const [state, setState] = useState(initialState);
  const initialData = useMemo<ChatInitialData>(
    () => ({
      resources: state.resources,
      displayOptions: defaultDisplayOptions,
    }),
    [state.resources],
  );

  useEffect(() => {
    let cancelled = false;
    setState(initialState);

    if (!chatId) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([prepareStoryChatResources(story), loadChat<ChatMessage>(story.workspace.path, chatId)])
      .then(async ([resources, savedChat]) => {
        if (!savedChat || savedChat.messages.length === 0) {
          await saveChat({
            workspacePath: story.workspace.path,
            chatId,
            title: `${story.overview.title} · 结构化创作`,
            messages: [createStoryIntroduction(story)],
          });
        }

        if (!cancelled) {
          setState({ resources, isLoading: false, error: "" });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            ...initialState,
            isLoading: false,
            error: error instanceof Error ? error.message : "故事会话加载失败",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, story]);

  if (!chatId) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-sm text-destructive">
        会话 ID 无效
      </div>
    );
  }

  if (state.isLoading || state.error) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center gap-2 bg-background px-6 text-sm text-muted-foreground">
        {state.error ? null : <Spinner />}
        <span>{state.error || "正在加载故事会话"}</span>
      </div>
    );
  }

  return <Chat chatId={chatId} workspacePath={story.workspace.path} initialData={initialData} />;
};
