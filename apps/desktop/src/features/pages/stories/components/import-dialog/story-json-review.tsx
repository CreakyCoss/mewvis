import { ScrollArea } from "@/components/ui/scroll-area";
import type { StoryJson } from "@/features/story/model/story-types";
import { EmptyBlock } from "../story-primitives";

type StoryJsonImportReviewProps = {
  story: StoryJson | null;
};

export const StoryJsonImportReview = ({
  story,
}: StoryJsonImportReviewProps) => (
  <ScrollArea className="min-h-0 w-full rounded-md border bg-background lg:flex-1">
    <div className="space-y-4 p-4">
      {!story ? (
        <EmptyBlock text="转换后会在这里预览 story.json" />
      ) : (
        <>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">标题</div>
              <div className="mt-1 font-medium">{story.title}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">结构</div>
              <div className="mt-1 font-medium">
                {story.characters.length} 角色 / {story.scenes.length} 场景 / {story.graph.nodes.length} 节点
              </div>
            </div>
          </div>
          <pre className="max-h-[34rem] overflow-auto rounded-md border bg-muted/20 p-3 text-xs leading-5">
            {JSON.stringify(story, null, 2)}
          </pre>
        </>
      )}
    </div>
  </ScrollArea>
);
