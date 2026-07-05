import type { Ref } from "react";
import { useCallback, useImperativeHandle } from "react";
import { StoryHeader } from "./header";
import { StoryModules } from "./modules";
import { useStoryState, type StoryModulesHandle } from "./use-story-state";
import type { StoryLibraryItem } from "../storage";

export type { StoryModulesHandle } from "./use-story-state";

type StoryModulesContentProps = {
  bind: Ref<StoryModulesHandle>;
  onBack: () => void;
  onOpenManuscripts: (item: StoryLibraryItem) => void;
};

export const StoryModulesContent = ({ bind, onBack, onOpenManuscripts }: StoryModulesContentProps) => {
  const story = useStoryState((state) => state.story);
  const closeStory = useStoryState((state) => state.closeStory);
  const openStory = useStoryState((state) => state.openStory);

  const close = useCallback(() => {
    closeStory();
  }, [closeStory]);

  const handleBack = () => {
    close();
    onBack();
  };

  useImperativeHandle(bind, () => ({ close, open: openStory }), [close, openStory]);

  if (!story) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <StoryHeader onBack={handleBack} />
      <StoryModules onOpenManuscripts={onOpenManuscripts} />
    </div>
  );
};
