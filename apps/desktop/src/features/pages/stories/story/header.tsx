import { ArrowLeft, BookOpen, FileText, GitBranch, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { getPendingDraftCount } from "../components/story-form-utils";
import { StoryActions } from "./actions";
import { useStoryState } from "./use-story-state";

export const StoryHeader = () => {
  const navigate = useNavigate();
  const story = useStoryState((state) => state.story);
  const headerStats: Array<{
    icon: LucideIcon;
    label: string;
    value: number;
  }> = [
    { icon: UsersRound, label: "角色", value: story?.characters.length ?? 0 },
    { icon: BookOpen, label: "场景", value: story?.scenes.length ?? 0 },
    { icon: GitBranch, label: "剧情节点", value: story?.graph.nodes.length ?? 0 },
    { icon: FileText, label: "待收稿", value: story ? getPendingDraftCount(story) : 0 },
  ];

  return (
    <header className="shrink-0 border-b bg-background px-5 py-4 shadow-sm lg:px-7">
      <div className="flex flex-col gap-3">
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

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {headerStats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-center gap-3 rounded-lg border bg-muted/10 px-3 py-2.5 shadow-xs">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold leading-5">{value}</div>
                <div className="truncate text-[11px] leading-4 text-muted-foreground">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
};
