import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { CircleDot, GitBranch, GitMerge, Network, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  StoryAsset,
  StoryContextEdge,
  StoryContextNode,
  StoryContextStage,
} from "@/features/story";
import {
  createStoryEdge,
  createStoryNode,
  createStoryStage,
} from "../../story-form-utils";
import {
  EditorField,
  EmptyBlock,
  selectClassName,
  StorySection,
} from "../../story-primitives";
import type { StoryModuleSave } from "../types";

export type StoryGraphEditHandle = (story?: StoryAsset) => void;

type StoryGraphEditProps = {
  bind: Ref<StoryGraphEditHandle>;
  story: StoryAsset;
  onSave: StoryModuleSave;
};

export const StoryGraphEdit = ({
  bind,
  story,
  onSave,
}: StoryGraphEditProps) => {
  const [draft, setDraft] = useState<StoryAsset | null>(null);

  const open = (nextStory = story) => setDraft(nextStory);

  useImperativeHandle(bind, () => open);

  const close = () => setDraft(null);

  const updateStage = (
    stageId: string,
    updater: (stage: StoryContextStage) => StoryContextStage,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            graph: {
              ...current.graph,
              stages: current.graph.stages.map((stage) =>
                stage.id === stageId ? updater(stage) : stage
              ),
            },
          }
        : current
    );
  };

  const updateNode = (
    nodeId: string,
    updater: (node: StoryContextNode) => StoryContextNode,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            graph: {
              ...current.graph,
              nodes: current.graph.nodes.map((node) => node.id === nodeId ? updater(node) : node),
            },
          }
        : current
    );
  };

  const updateEdge = (
    edgeId: string,
    updater: (edge: StoryContextEdge) => StoryContextEdge,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            graph: {
              ...current.graph,
              edges: current.graph.edges.map((edge) => edge.id === edgeId ? updater(edge) : edge),
            },
          }
        : current
    );
  };

  const save = () => {
    if (!draft) {
      return;
    }
    onSave(draft);
    close();
  };

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {draft ? (
        <DialogContent className="max-h-[min(90vh,52rem)] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="size-4" />
              编辑故事结构
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[min(68vh,40rem)] pr-3">
            <div className="space-y-5">
              <StorySection
                icon={Network}
                title="阶段"
                action={(
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2"
                    onClick={() =>
                      setDraft({
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
                              updateStage(stage.id, (current) => ({
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
                              updateStage(stage.id, (current) => ({
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
                              updateStage(stage.id, (current) => ({
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
                              setDraft({
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
                      setDraft({
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
                                setDraft({
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
                                setDraft({
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
                                updateNode(node.id, (current) => ({ ...current, title: event.target.value }))
                              }
                            />
                          </EditorField>
                          <EditorField label="阶段">
                            <select
                              className={selectClassName}
                              value={node.stageId}
                              onChange={(event) =>
                                updateNode(node.id, (current) => ({ ...current, stageId: event.target.value }))
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
                                updateNode(node.id, (current) => ({
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
                                updateNode(node.id, (current) => ({ ...current, type: event.target.value }))
                              }
                            />
                          </EditorField>
                          <EditorField label="路径角色">
                            <Input
                              value={node.pathRole}
                              onChange={(event) =>
                                updateNode(node.id, (current) => ({ ...current, pathRole: event.target.value }))
                              }
                            />
                          </EditorField>
                          <EditorField label="状态">
                            <Input
                              value={node.status ?? ""}
                              onChange={(event) =>
                                updateNode(node.id, (current) => ({ ...current, status: event.target.value }))
                              }
                            />
                          </EditorField>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </StorySection>

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
                        setDraft({
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
                              setDraft({
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
                                updateEdge(edge.id, (current) => ({
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
                                updateEdge(edge.id, (current) => ({
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
                                updateEdge(edge.id, (current) => ({
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
                                updateEdge(edge.id, (current) => ({
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
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              取消
            </Button>
            <Button type="button" className="gap-2" onClick={save}>
              <Save className="size-4" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
};
