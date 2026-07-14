import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryAssistantDialog } from "./dialog";

export const StoryAssistantAction = () => {
  const overview = useStoryState((state) => state.overview);
  const documents = useStoryState((state) => state.documents);
  const workspace = useStoryState((state) => state.storyWorkspace);
  const reloadStory = useStoryState((state) => state.reloadStory);
  const [open, setOpen] = useState(false);
  const [dialogInstance, setDialogInstance] = useState(0);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && overview) {
      try {
        await reloadStory();
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
        onClick={() => {
          setDialogInstance((current) => current + 1);
          setOpen(true);
        }}
        disabled={!overview || !workspace}
      >
        <Sparkles className="size-3.5" />
        创作助手
      </Button>
      {overview && workspace ? (
        <StoryAssistantDialog
          key={`${overview.id}:${dialogInstance}`}
          documents={documents}
          open={open}
          onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}
          overview={overview}
          workspace={workspace}
        />
      ) : null}
    </>
  );
};
