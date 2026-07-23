import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { loadStoryById, type StoryLibraryItem } from "@/features/pages/stories/storage";
import { Chat } from "../../chat";
import type { ChatInitialData } from "../../chat/type";
import type { ChatInputResources } from "../../components/chat-input/type";
import { prepareStoryChatResources } from "./prepare";

const defaultDisplayOptions = {
  showThinkingProcess: true,
  showToolCallProcess: true,
};

type StoryChatState = {
  story: StoryLibraryItem | null;
  resources: ChatInputResources;
  isLoading: boolean;
  error: string;
};

const initialState: StoryChatState = {
  story: null,
  resources: {},
  isLoading: true,
  error: "",
};

export const StoryChat = () => {
  const { storyId = "", chatId = "" } = useParams();
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

    if (!storyId) {
      setState({ ...initialState, isLoading: false, error: "故事地址无效" });
      return () => {
        cancelled = true;
      };
    }

    void loadStoryById(storyId)
      .then(async (story) => {
        if (!story) {
          throw new Error("故事不存在");
        }
        const resources = await prepareStoryChatResources(story);
        if (!cancelled) {
          setState({ story, resources, isLoading: false, error: "" });
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
  }, [storyId]);

  if (!storyId || !chatId) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center bg-background px-6 text-sm text-destructive">
        会话地址无效
      </main>
    );
  }

  if (state.isLoading || !state.story) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center gap-2 bg-background px-6 text-sm text-muted-foreground">
        {state.error ? null : <Spinner />}
        <span>{state.error || "正在加载故事会话"}</span>
      </main>
    );
  }

  return <Chat chatId={chatId} workspacePath={state.story.workspace.path} initialData={initialData} />;
};
