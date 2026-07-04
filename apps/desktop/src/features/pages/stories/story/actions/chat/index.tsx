import { MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useWorkspaceOverview } from "@/features/pages/workspace/provider";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryChatSelectDialog } from "./dialog";
import { getDefaultNodeId, resolveNodeId } from "../node";

const buildChatSearch = ({ nodeId, storyId }: { nodeId?: string | null; storyId: string }) => {
  const search = [`storyId=${encodeURIComponent(storyId)}`, nodeId ? `storyNodeId=${encodeURIComponent(nodeId)}` : ""]
    .filter(Boolean)
    .join("&");

  return search ? `?${search}` : "";
};

export const ChatStoryAction = () => {
  const navigate = useNavigate();
  const { activeWorkspace, defaultWorkspace, overview } = useWorkspaceOverview();
  const chatWorkspace = activeWorkspace ?? defaultWorkspace ?? overview?.workspaces[0] ?? null;
  const buildNodeOptions = useStoryState((state) => state.buildNodeOptions);
  const getChatWorkspacePath = useStoryState((state) => state.getChatWorkspacePath);
  const story = useStoryState((state) => state.story);
  const [chatSelectNodeId, setChatSelectNodeId] = useState<string | null | undefined>(undefined);
  const storyNodeOptions = useMemo(() => buildNodeOptions(story), [buildNodeOptions, story]);

  useEffect(() => {
    setChatSelectNodeId(undefined);
  }, [story?.id]);

  const openStoryChat = (nodeId: string) => {
    if (!story || !chatWorkspace) {
      return;
    }

    const storyNodeId = resolveNodeId(story, nodeId);
    navigate({
      pathname: getChatWorkspacePath(chatWorkspace.id),
      search: buildChatSearch({
        storyId: story.id,
        nodeId: storyNodeId,
      }),
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`${editorHeaderActionButtonClassName} h-9`}
        onClick={() => setChatSelectNodeId(getDefaultNodeId(story))}
        disabled={!story}
      >
        <MessageSquareText className="size-3.5" />
        聊天
      </Button>
      <StoryChatSelectDialog
        open={chatSelectNodeId !== undefined}
        initialNodeId={chatSelectNodeId ?? undefined}
        nodeOptions={storyNodeOptions}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setChatSelectNodeId(undefined);
          }
        }}
        onConfirm={openStoryChat}
      />
    </>
  );
};
