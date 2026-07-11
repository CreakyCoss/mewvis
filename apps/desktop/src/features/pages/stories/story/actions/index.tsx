import { StoryAssistantAction } from "./assistant";
import { TavernStoryAction } from "./tavern";

export const StoryActions = () => (
  <div className="flex flex-wrap items-center gap-2">
    <StoryAssistantAction />
    <TavernStoryAction />
  </div>
);
