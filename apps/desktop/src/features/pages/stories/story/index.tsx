import type { Ref } from "react";
import { useImperativeHandle } from "react";
import { StoryHeader } from "./header";
import { StoryModules } from "./modules";
import { useStoryState, type StoryModulesHandle } from "./use-story-state";

export type { StoryModulesHandle } from "./use-story-state";

type StoryModulesContentProps = {
  bind: Ref<StoryModulesHandle>;
  onBack: () => void;
};

export const StoryModulesContent = ({ bind, onBack }: StoryModulesContentProps) => {
  const openStory = useStoryState((state) => state.openStory);

  useImperativeHandle(bind, () => ({ open: openStory }), [openStory]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <StoryHeader onBack={onBack} />
      <StoryModules />
    </div>
  );
};
