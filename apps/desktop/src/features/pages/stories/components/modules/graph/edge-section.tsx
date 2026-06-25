import { GitMerge, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  StoryAsset,
  StoryContextEdge,
} from "@/features/story";
import { createStoryEdge } from "../../story-form-utils";
import {
  EditorField,
  EmptyBlock,
  selectClassName,
  StorySection,
} from "../../story-primitives";

type StoryGraphEdgeSectionProps = {
  draft: StoryAsset;
  onDraftChange: (draft: StoryAsset) => void;
  onUpdateEdge: (
    edgeId: string,
    updater: (edge: StoryContextEdge) => StoryContextEdge,
  ) => void;
};

export const StoryGraphEdgeSection = ({
  draft,
  onDraftChange,
  onUpdateEdge,
}: StoryGraphEdgeSectionProps) => (
  <StorySection
    icon={GitMerge}
    title="分支"
    action={(
      <Button
        type="button"
        size="sm"
        className="gap-2"
        disabled={draft.graph.nodes.length < 2}
        onClick={() => {
          const edge = createStoryEdge(draft);
          if (edge) {
            onDraftChange({
              ...draft,
              graph: { ...draft.graph, edges: [...draft.graph.edges, edge] },
            });
          }
        }}
      >
        <Plus className="size-4" />
        添加
      </Button>
    )}
  >
    {draft.graph.edges.length === 0 ? (
      <EmptyBlock text="暂无分支" />
    ) : (
      <div className="space-y-3">
        {draft.graph.edges.map((edge) => (
          <div key={edge.id} className="rounded-md border p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="truncate text-sm font-medium">{edge.label || "分支"}</div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onDraftChange({
                    ...draft,
                    graph: {
                      ...draft.graph,
                      edges: draft.graph.edges.filter((item) => item.id !== edge.id),
                    },
                  })
                }
                title="删除分支"
                aria-label="删除分支"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <EditorField label="起点">
                <select
                  className={selectClassName}
                  value={edge.fromNodeId}
                  onChange={(event) =>
                    onUpdateEdge(edge.id, (current) => ({
                      ...current,
                      fromNodeId: event.target.value,
                    }))
                  }
                >
                  {draft.graph.nodes.map((node) => (
                    <option key={node.id} value={node.id}>{node.title}</option>
                  ))}
                </select>
              </EditorField>
              <EditorField label="终点">
                <select
                  className={selectClassName}
                  value={edge.toNodeId}
                  onChange={(event) =>
                    onUpdateEdge(edge.id, (current) => ({
                      ...current,
                      toNodeId: event.target.value,
                    }))
                  }
                >
                  {draft.graph.nodes.map((node) => (
                    <option key={node.id} value={node.id}>{node.title}</option>
                  ))}
                </select>
              </EditorField>
              <EditorField label="标签">
                <Input
                  value={edge.label}
                  onChange={(event) =>
                    onUpdateEdge(edge.id, (current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              </EditorField>
              <EditorField label="优先级">
                <Input
                  type="number"
                  value={edge.priority}
                  onChange={(event) =>
                    onUpdateEdge(edge.id, (current) => ({
                      ...current,
                      priority: Number(event.target.value) || 0,
                    }))
                  }
                />
              </EditorField>
            </div>
          </div>
        ))}
      </div>
    )}
  </StorySection>
);
