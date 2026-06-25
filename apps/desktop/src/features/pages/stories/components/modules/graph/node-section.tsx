import { CircleDot, GitBranch, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  StoryAsset,
  StoryContextNode,
} from "@/features/story";
import {
  createStoryNode,
  createStoryStage,
} from "../../story-form-utils";
import {
  EditorField,
  EmptyBlock,
  selectClassName,
  StorySection,
} from "../../story-primitives";

type StoryGraphNodeSectionProps = {
  draft: StoryAsset;
  onDraftChange: (draft: StoryAsset) => void;
  onUpdateNode: (
    nodeId: string,
    updater: (node: StoryContextNode) => StoryContextNode,
  ) => void;
};

export const StoryGraphNodeSection = ({
  draft,
  onDraftChange,
  onUpdateNode,
}: StoryGraphNodeSectionProps) => (
  <StorySection
    icon={GitBranch}
    title="节点"
    action={(
      <Button
        type="button"
        size="sm"
        className="gap-2"
        onClick={() => {
          const stages = draft.graph.stages.length > 0
            ? draft.graph.stages
            : [createStoryStage(0)];
          const stagedStory = {
            ...draft,
            graph: { ...draft.graph, stages },
          };
          const node = createStoryNode(stagedStory);
          onDraftChange({
            ...stagedStory,
            graph: {
              ...stagedStory.graph,
              entryNodeId: stagedStory.graph.entryNodeId || node.id,
              activeNodeId: stagedStory.graph.activeNodeId || node.id,
              nodes: [...stagedStory.graph.nodes, node],
            },
          });
        }}
      >
        <Plus className="size-4" />
        添加
      </Button>
    )}
  >
    {draft.graph.nodes.length === 0 ? (
      <EmptyBlock text="暂无节点" />
    ) : (
      <div className="space-y-4">
        {draft.graph.nodes.map((node) => (
          <div key={node.id} className="rounded-md border p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-medium">{node.title}</div>
                  {draft.graph.entryNodeId === node.id ? <Badge variant="secondary">入口</Badge> : null}
                  {draft.graph.activeNodeId === node.id ? <Badge variant="outline">当前</Badge> : null}
                </div>
                <div className="text-xs text-muted-foreground">{node.id}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() =>
                    onDraftChange({
                      ...draft,
                      graph: { ...draft.graph, entryNodeId: node.id },
                    })
                  }
                  title="设为入口"
                  aria-label="设为入口"
                >
                  <CircleDot className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  disabled={draft.graph.nodes.length <= 1}
                  onClick={() => {
                    const nextNodes = draft.graph.nodes.filter((item) => item.id !== node.id);
                    const fallbackNodeId = nextNodes[0]?.id ?? "";
                    onDraftChange({
                      ...draft,
                      graph: {
                        ...draft.graph,
                        entryNodeId: draft.graph.entryNodeId === node.id
                          ? fallbackNodeId
                          : draft.graph.entryNodeId,
                        activeNodeId: draft.graph.activeNodeId === node.id
                          ? fallbackNodeId
                          : draft.graph.activeNodeId,
                        nodes: nextNodes,
                        edges: draft.graph.edges.filter((edge) =>
                          edge.fromNodeId !== node.id && edge.toNodeId !== node.id
                        ),
                      },
                    });
                  }}
                  title="删除节点"
                  aria-label="删除节点"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <EditorField label="标题">
                <Input
                  value={node.title}
                  onChange={(event) =>
                    onUpdateNode(node.id, (current) => ({ ...current, title: event.target.value }))
                  }
                />
              </EditorField>
              <EditorField label="阶段">
                <select
                  className={selectClassName}
                  value={node.stageId}
                  onChange={(event) =>
                    onUpdateNode(node.id, (current) => ({ ...current, stageId: event.target.value }))
                  }
                >
                  {draft.graph.stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.title}</option>
                  ))}
                </select>
              </EditorField>
              <EditorField label="绑定场景">
                <select
                  className={selectClassName}
                  value={node.sceneId ?? ""}
                  onChange={(event) =>
                    onUpdateNode(node.id, (current) => ({
                      ...current,
                      sceneId: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">未绑定</option>
                  {draft.scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>{scene.title}</option>
                  ))}
                </select>
              </EditorField>
              <EditorField label="类型">
                <Input
                  value={node.type}
                  onChange={(event) =>
                    onUpdateNode(node.id, (current) => ({ ...current, type: event.target.value }))
                  }
                />
              </EditorField>
              <EditorField label="路径角色">
                <Input
                  value={node.pathRole}
                  onChange={(event) =>
                    onUpdateNode(node.id, (current) => ({ ...current, pathRole: event.target.value }))
                  }
                />
              </EditorField>
              <EditorField label="状态">
                <Input
                  value={node.status ?? ""}
                  onChange={(event) =>
                    onUpdateNode(node.id, (current) => ({ ...current, status: event.target.value }))
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
