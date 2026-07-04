import { ArrowLeft, BookOpen } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { StoryActions } from "./actions";
import { useStoryState } from "./use-story-state";

export const StoryHeader = () => {
  const navigate = useNavigate();
  const story = useStoryState((state) => state.story);

  return (
    <header className="shrink-0 border-b bg-background px-5 py-4 shadow-sm lg:px-7">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              title="返回故事入口"
              aria-label="返回故事入口"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/35 text-primary">
              <BookOpen className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold leading-7">{story?.title ?? "故事"}</h2>
              <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                编辑故事内容、结构、场景和可被呈现端读取的标准数据。
              </p>
            </div>
          </div>
        </div>

        <StoryActions />
      </div>
    </header>
  );
};
