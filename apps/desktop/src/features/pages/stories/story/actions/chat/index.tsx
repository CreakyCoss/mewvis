import { MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryChatSelectDialog } from "./dialog";
import { createChatPayload } from "./payload";

export const ChatStoryAction = () => {
  const navigate = useNavigate();
  const { activeWorkspace, defaultWorkspace, overview } = useWorkspaceOverview();
  const chatWorkspace = activeWorkspace ?? defaultWorkspace ?? overview?.workspaces[0] ?? null;
  const buildNodeOptions = useStoryState((state) => state.buildNodeOptions);
  const getChatWorkspacePath = useStoryState((state) => state.getChatWorkspacePath);
  const story = useStoryState((state) => state.story);
  const [isNodeSelectOpen, setIsNodeSelectOpen] = useState(false);
  const storyNodeOptions = useMemo(() => buildNodeOptions(story), [buildNodeOptions, story]);

  useEffect(() => {
    setIsNodeSelectOpen(false);
  }, [story?.id]);

  const openStoryChat = (nodeId: string) => {
    if (!story || !chatWorkspace) {
      return;
    }

    navigate(getChatWorkspacePath(chatWorkspace.id), {
      state: {
        storyChatSeed: createChatPayload(story, {
          nodeId,
        }),
      },
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`${editorHeaderActionButtonClassName} h-9`}
        onClick={() => setIsNodeSelectOpen(true)}
        disabled={!story}
      >
        <MessageSquareText className="size-3.5" />
        聊天
      </Button>
      <StoryChatSelectDialog
        open={isNodeSelectOpen}
        nodeOptions={storyNodeOptions}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setIsNodeSelectOpen(false);
          }
        }}
        onConfirm={openStoryChat}
      />
    </>
  );
};
