import { FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { editorHeaderActionButtonClassName } from "../../../components/story-primitives";
import { useStoryState } from "../../use-story-state";
import { StoryImportDialog } from "./dialog";

export { StoryImportDialog } from "./dialog";

export const ImportStoryAction = () => {
  const isSaving = useStoryState((state) => state.isSaving);
  const saveStory = useStoryState((state) => state.saveStory);
  const story = useStoryState((state) => state.story);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => {
    setIsImportOpen(false);
  }, [story?.id]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`${editorHeaderActionButtonClassName} h-9`}
        onClick={() => setIsImportOpen(true)}
        disabled={!story || isSaving}
      >
        <FileUp className="size-3.5" />
        导入
      </Button>
      <StoryImportDialog
        open={isImportOpen}
        originalStory={story}
        onOpenChange={setIsImportOpen}
        onSaveStory={(nextStory) => saveStory(nextStory)}
      />
    </>
  );
};
