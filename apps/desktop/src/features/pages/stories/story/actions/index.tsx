import { ChatStoryAction } from "./chat";
import { ImportStoryAction } from "./import";
import { ResetStoryAction } from "./reset";
import { TavernStoryAction } from "./tavern";

export const StoryActions = () => (
  <div className="flex flex-wrap items-center gap-2">
    <ResetStoryAction />
    <ImportStoryAction />
    <ChatStoryAction />
    <TavernStoryAction />
  </div>
);
