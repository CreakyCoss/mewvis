import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadStoryById } from "../../../storage";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryAssistantDialog } from "./dialog";

export const StoryAssistantAction = () => {
  const story = useStoryState((state) => state.story);
  const project = useStoryState((state) => state.storyProject);
  const workspace = useStoryState((state) => state.storyWorkspace);
  const openStory = useStoryState((state) => state.openStory);
  const [open, setOpen] = useState(false);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && story) {
      try {
        const loaded = await loadStoryById(story.id);
        if (loaded) {
          openStory({
            id: loaded.story.id,
            project: loaded.project,
            story: loaded.story,
            workspace: loaded.workspace,
          });
        }
      } catch (error) {
        console.error("Failed to reload story after assistant", error);
        toast.error("故事助手已关闭，但重新读取故事失败。");
      }
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`${editorHeaderActionButtonClassName} h-9`}
        onClick={() => setOpen(true)}
        disabled={!story || !project || !workspace}
      >
        <Sparkles className="size-3.5" />
        创作助手
      </Button>
      {story && project && workspace ? (
        <StoryAssistantDialog
          open={open}
          onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}
          project={project}
          story={story}
          workspace={workspace}
        />
      ) : null}
    </>
  );
};
