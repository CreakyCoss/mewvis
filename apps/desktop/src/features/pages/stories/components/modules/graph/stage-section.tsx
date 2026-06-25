import { Network, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  StoryAsset,
  StoryContextStage,
} from "@/features/story";
import { createStoryStage } from "../../story-form-utils";
import {
  EditorField,
  EmptyBlock,
  StorySection,
} from "../../story-primitives";

type StoryGraphStageSectionProps = {
  draft: StoryAsset;
  onDraftChange: (draft: StoryAsset) => void;
  onUpdateStage: (
    stageId: string,
    updater: (stage: StoryContextStage) => StoryContextStage,
  ) => void;
};

export const StoryGraphStageSection = ({
  draft,
  onDraftChange,
  onUpdateStage,
}: StoryGraphStageSectionProps) => (
  <StorySection
    icon={Network}
    title="阶段"
    action={(
      <Button
        type="button"
        size="sm"
        className="gap-2"
        onClick={() =>
          onDraftChange({
            ...draft,
            graph: {
              ...draft.graph,
              stages: [...draft.graph.stages, createStoryStage(draft.graph.stages.length)],
            },
          })
        }
      >
        <Plus className="size-4" />
        添加
      </Button>
    )}
  >
    {draft.graph.stages.length === 0 ? (
      <EmptyBlock text="暂无阶段" />
    ) : (
      <div className="space-y-3">
        {draft.graph.stages.map((stage) => (
          <div key={stage.id} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[10rem_minmax(0,1fr)_5rem_auto]">
            <EditorField label="标题">
              <Input
                value={stage.title}
                onChange={(event) =>
                  onUpdateStage(stage.id, (current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </EditorField>
            <EditorField label="摘要">
              <Input
                value={stage.summary ?? ""}
                onChange={(event) =>
                  onUpdateStage(stage.id, (current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
              />
            </EditorField>
            <EditorField label="顺序">
              <Input
                type="number"
                value={stage.order}
                onChange={(event) =>
                  onUpdateStage(stage.id, (current) => ({
                    ...current,
                    order: Number(event.target.value) || 0,
                  }))
                }
              />
            </EditorField>
            <div className="flex items-end justify-end">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                disabled={draft.graph.stages.length <= 1}
                onClick={() => {
                  const fallbackStage = draft.graph.stages.find((item) => item.id !== stage.id);
                  onDraftChange({
                    ...draft,
                    graph: {
                      ...draft.graph,
                      stages: draft.graph.stages.filter((item) => item.id !== stage.id),
                      nodes: draft.graph.nodes.map((node) =>
                        node.stageId === stage.id && fallbackStage
                          ? { ...node, stageId: fallbackStage.id }
                          : node
                      ),
                    },
                  });
                }}
                title="删除阶段"
                aria-label="删除阶段"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </StorySection>
);
