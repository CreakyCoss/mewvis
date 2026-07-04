import type { Ref } from "react";
import { useImperativeHandle } from "react";
import { StoryHeader } from "./header";
import { StoryModules } from "./modules";
import { useStoryState, type StoryModulesHandle } from "./use-story-state";

export type { StoryModulesHandle } from "./use-story-state";

export const StoryModulesContent = ({ bind }: { bind: Ref<StoryModulesHandle> }) => {
  const openStory = useStoryState((state) => state.openStory);

  useImperativeHandle(bind, () => openStory, [openStory]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <StoryHeader />
      <StoryModules />
    </div>
  );
};
