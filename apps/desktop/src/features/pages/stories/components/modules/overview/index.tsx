import { Pencil, ScrollText } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { StoryAsset } from "@/features/story";
import { StorySection, type StoryDraft } from "../../shared";
import { StoryOverviewEdit, type StoryOverviewEditHandle } from "./edit";

type StoryOverviewModuleProps = {
  story: StoryAsset;
  onSave: (draft: StoryDraft) => void;
};

export const StoryOverviewModule = ({
  story,
  onSave,
}: StoryOverviewModuleProps) => {
  const editRef = useRef<StoryOverviewEditHandle>(null);

  return (
    <>
      <StorySection
        icon={ScrollText}
        title="基础信息"
        description="维护故事整体定位、目标和用户称呼。"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => editRef.current?.(story)}
          >
            <Pencil className="size-4" />
            编辑
          </Button>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">标题</div>
              <div className="mt-1 text-sm font-medium">{story.title}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">故事定位</div>
              <div className="mt-1 line-clamp-4 text-sm leading-6">
                {story.outline || "未填写"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">目标</div>
              <div className="mt-1 line-clamp-3 text-sm leading-6">
                {story.goal || "未填写"}
              </div>
            </div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <div>用户称呼：{story.userPersonaName || "我"}</div>
            <div>创建：{new Date(story.createdAt).toLocaleString()}</div>
            <div>更新：{new Date(story.updatedAt).toLocaleString()}</div>
            {story.sourceRefs.length > 0 ? (
              <div>来源：{story.sourceRefs.map((ref) => ref.label || ref.id).join("、")}</div>
            ) : null}
          </div>
        </div>
      </StorySection>

      <StoryOverviewEdit bind={editRef} story={story} onSave={onSave} />
    </>
  );
};
