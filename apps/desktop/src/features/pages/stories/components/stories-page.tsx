import { useLocation } from "react-router";
import { WindowDragRegion } from "@/components/window-drag-region";
import { isStoriesFullscreenSearch } from "../navigation";
import { StoryContent } from "./story-content";

export const StoriesPage = () => {
  const location = useLocation();
  const isHomeFullscreen = isStoriesFullscreenSearch(location.search);
  const content = (
    <section className="flex h-full min-h-0 flex-1 overflow-hidden bg-muted/20 text-foreground">
      <StoryContent isHomeFullscreen={isHomeFullscreen} />
    </section>
  );

  if (isHomeFullscreen) {
    return (
      <div className="fixed inset-0 z-[45] flex h-screen min-h-0 w-screen flex-col bg-background text-foreground">
        <WindowDragRegion className="h-10 shrink-0" />
        <div className="flex min-h-0 flex-1">{content}</div>
      </div>
    );
  }

  return content;
};
