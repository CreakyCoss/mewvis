import type { Ref } from "react";
import { useCallback, useImperativeHandle } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WindowDragRegion } from "@/components/window-drag-region";
import { StoryHeader } from "./header";
import { StoryModules } from "./modules";
import { useStoryState } from "./use-story-state";
import type { StoryLibraryItem } from "../storage";

export type StoryModulesHandle = {
  close: () => void;
  open: (item: StoryLibraryItem) => void;
};

type StoryModulesContentProps = {
  bind: Ref<StoryModulesHandle>;
  onBack: () => void;
};

const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none !bg-background p-0 text-foreground !ring-0";

export const StoryModulesContent = ({ bind, onBack }: StoryModulesContentProps) => {
  const story = useStoryState((state) => state.story);
  const closeStory = useStoryState((state) => state.closeStory);
  const openStory = useStoryState((state) => state.openStory);

  const close = useCallback(() => {
    closeStory();
  }, [closeStory]);

  useImperativeHandle(bind, () => ({ close, open: openStory }), [close, openStory]);

  const handleBack = useCallback(() => {
    close();
    onBack();
  }, [close, onBack]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleBack();
      }
    },
    [handleBack],
  );

  return (
    <Dialog open={Boolean(story)} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/5 backdrop-blur-none"
        className={fullScreenDialogContentClassName}
      >
        <DialogTitle className="sr-only">{story?.title ? `${story.title} · 编辑` : "故事编辑"}</DialogTitle>
        <WindowDragRegion className="h-10 shrink-0" />
        {story ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <StoryHeader onBack={handleBack} />
            <StoryModules />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
