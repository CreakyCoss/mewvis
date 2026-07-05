import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { createDefaultStoryJson } from "../../model/state";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";

export const ResetStoryAction = () => {
  const isSaving = useStoryState((state) => state.isSaving);
  const saveStory = useStoryState((state) => state.saveStory);
  const story = useStoryState((state) => state.story);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  useEffect(() => {
    setIsResetConfirmOpen(false);
  }, [story?.id]);

  const resetStory = async () => {
    if (!story) {
      return;
    }

    const savedStory = await saveStory(
      createDefaultStoryJson({
        id: story.id,
        title: "未命名故事",
        timestamp: Date.now(),
      }),
    );
    if (savedStory) {
      setIsResetConfirmOpen(false);
      toast.success("故事已重置。");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`${editorHeaderActionButtonClassName} h-9`}
        onClick={() => setIsResetConfirmOpen(true)}
        disabled={!story || isSaving}
      >
        <RotateCcw className="size-3.5" />
        重置
      </Button>
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置当前故事？</AlertDialogTitle>
            <AlertDialogDescription>
              将用一个空白故事覆盖「{story?.title ?? "当前故事"}」。当前故事的角色、场景、图谱和稿件都会被清空。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={() => void resetStory()} disabled={isSaving}>
              确认重置
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
