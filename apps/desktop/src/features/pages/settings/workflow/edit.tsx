import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { ArrowDown, ArrowUp, GitBranch, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { deleteCollaborationWorkflow, getAiAgentSettings, saveCollaborationWorkflow } from "@/api/agents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createUuid } from "@/utils/ids";
import type { AiAgent } from "../agent/types";
import type { CollaborationWorkflow, CollaborationWorkflowStep, SaveCollaborationWorkflowInput } from "./types";

type WorkflowEditMode = "create" | "edit";
type WorkflowStepDraft = NonNullable<SaveCollaborationWorkflowInput["steps"]>[number];

type WorkflowEditDialogOpenOptions = { mode: "create" } | { mode: "edit"; workflow: CollaborationWorkflow };

export type WorkflowEditDialogHandle = {
  open: (options?: WorkflowEditDialogOpenOptions) => void;
};

type WorkflowEditDialogProps = {
  bind: Ref<WorkflowEditDialogHandle>;
  onSaved?: () => void | Promise<void>;
};

const createInitialWorkflowSteps = (writerAgentId: string, reviewerAgentId: string): CollaborationWorkflowStep[] => [
  {
    id: createUuid(),
    name: "起草",
    agentId: writerAgentId,
    instruction: null,
    phase: "draft",
  },
  {
    id: createUuid(),
    name: "审查",
    agentId: reviewerAgentId || writerAgentId,
    instruction: null,
    phase: "review",
  },
  {
    id: createUuid(),
    name: "修订",
    agentId: writerAgentId,
    instruction: null,
    phase: "revise",
  },
];

const createWorkflowDraft = (agents: AiAgent[]): SaveCollaborationWorkflowInput => {
  const writerAgent = agents[0];
  const reviewerAgent = agents.find((agent) => agent.id !== writerAgent?.id) ?? writerAgent;

  return {
    id: null,
    name: "",
    description: "",
    writerAgentId: writerAgent?.id ?? "",
    reviewerAgentId: reviewerAgent?.id ?? "",
    draftInstruction: "",
    reviewInstruction: "",
    reviseInstruction: "",
    steps: writerAgent ? createInitialWorkflowSteps(writerAgent.id, reviewerAgent?.id ?? writerAgent.id) : [],
  };
};

const workflowToDraft = (workflow: CollaborationWorkflow): SaveCollaborationWorkflowInput => ({
  id: workflow.id,
  name: workflow.name,
  description: workflow.description ?? "",
  writerAgentId: workflow.writerAgentId,
  reviewerAgentId: workflow.reviewerAgentId,
  draftInstruction: workflow.draftInstruction ?? "",
  reviewInstruction: workflow.reviewInstruction ?? "",
  reviseInstruction: workflow.reviseInstruction ?? "",
  steps: workflow.steps.map((step) => ({
    id: step.id,
    name: step.name,
    agentId: step.agentId,
    instruction: step.instruction ?? "",
    phase: step.phase,
  })),
});

export const WorkflowEditDialog = ({ bind, onSaved }: WorkflowEditDialogProps) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkflowEditMode>("create");
  const [agents, setAgents] = useState<AiAgent[]>([]);
  const [draft, setDraft] = useState<SaveCollaborationWorkflowInput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const openRequestIdRef = useRef(0);

  const resetTransientState = () => {
    setError("");
    setIsDeleteConfirmOpen(false);
  };

  const openEditor = (options: WorkflowEditDialogOpenOptions) => {
    const requestId = openRequestIdRef.current + 1;
    openRequestIdRef.current = requestId;
    setMode(options.mode);
    setAgents([]);
    setDraft(options.mode === "edit" ? workflowToDraft(options.workflow) : createWorkflowDraft([]));
    setIsLoading(true);
    resetTransientState();
    setOpen(true);

    void getAiAgentSettings()
      .then((settings) => {
        if (requestId !== openRequestIdRef.current) return;

        setAgents(settings.agents);
        if (options.mode === "create") {
          setDraft(createWorkflowDraft(settings.agents));
        }
      })
      .catch((caught) => {
        if (requestId === openRequestIdRef.current) {
          setError(String(caught));
        }
      })
      .finally(() => {
        if (requestId === openRequestIdRef.current) {
          setIsLoading(false);
        }
      });
  };

  const closeDialog = () => {
    openRequestIdRef.current += 1;
    setOpen(false);
    setAgents([]);
    setDraft(null);
    setIsLoading(false);
    resetTransientState();
  };

  useImperativeHandle(
    bind,
    () => ({
      open: (options = { mode: "create" }) => openEditor(options),
    }),
    [bind],
  );

  const updateDraft = (updater: (current: SaveCollaborationWorkflowInput) => SaveCollaborationWorkflowInput) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const updateWorkflowStep = (stepId: string, updater: (step: WorkflowStepDraft) => WorkflowStepDraft) => {
    updateDraft((current) => ({
      ...current,
      steps: (current.steps ?? []).map((step) => (step.id === stepId ? updater(step) : step)),
    }));
  };

  const moveWorkflowStep = (stepId: string, direction: -1 | 1) => {
    updateDraft((current) => {
      const steps = [...(current.steps ?? [])];
      const index = steps.findIndex((step) => step.id === stepId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) return current;

      const [step] = steps.splice(index, 1);
      steps.splice(nextIndex, 0, step);
      return { ...current, steps };
    });
  };

  const addWorkflowStep = () => {
    updateDraft((current) => ({
      ...current,
      steps: [
        ...(current.steps ?? []),
        {
          id: createUuid(),
          name: `步骤 ${(current.steps?.length ?? 0) + 1}`,
          agentId: agents[0]?.id ?? "",
          instruction: "",
          phase: null,
        },
      ],
    }));
  };

  const removeWorkflowStep = (stepId: string) => {
    updateDraft((current) => ({
      ...current,
      steps: (current.steps ?? []).filter((step) => step.id !== stepId),
    }));
  };

  const saveWorkflow = async () => {
    if (!draft) return;

    if (!draft.name.trim()) {
      setError("协作流程名称不能为空");
      return;
    }

    const steps = draft.steps ?? [];
    if (steps.length === 0) {
      setError("请至少配置一个协作步骤");
      return;
    }

    const invalidStepIndex = steps.findIndex((step) => !step.name.trim() || !step.agentId);
    if (invalidStepIndex >= 0) {
      setError(`请完善第 ${invalidStepIndex + 1} 个协作步骤`);
      return;
    }

    const firstStep = steps[0];
    const reviewerStep = steps.find((step) => step.agentId !== firstStep.agentId) ?? steps[1] ?? firstStep;
    setIsSaving(true);
    setError("");

    try {
      await saveCollaborationWorkflow({
        ...draft,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        writerAgentId: firstStep.agentId,
        reviewerAgentId: reviewerStep.agentId,
        draftInstruction: draft.draftInstruction?.trim() || null,
        reviewInstruction: draft.reviewInstruction?.trim() || null,
        reviseInstruction: draft.reviseInstruction?.trim() || null,
        steps: steps.map((step) => ({
          ...step,
          name: step.name.trim(),
          instruction: step.instruction?.trim() || null,
        })),
      });
      closeDialog();
      await onSaved?.();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteWorkflow = async () => {
    if (mode !== "edit" || !draft?.id) return;

    setIsSaving(true);
    setError("");

    try {
      await deleteCollaborationWorkflow(draft.id);
      setIsDeleteConfirmOpen(false);
      closeDialog();
      await onSaved?.();
    } catch (caught) {
      setIsDeleteConfirmOpen(false);
      setError(String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving) return;
    if (!nextOpen) {
      closeDialog();
      return;
    }
    setOpen(true);
  };

  const workflowSteps = draft?.steps ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="!flex max-h-[calc(100vh-2rem)] w-[min(800px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden border-border/70 bg-popover p-0 shadow-[var(--shadow-floating)] sm:max-w-[800px]">
          <DialogHeader className="shrink-0">
            <div className="border-b border-border/70 bg-card/35 px-6 pt-6 pb-5">
              <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <GitBranch className="size-5" />
                </span>
                <span>{mode === "create" ? "新增协作流程" : "编辑协作流程"}</span>
              </DialogTitle>
              <DialogDescription className="mt-1.5 pl-[52px]">配置流程信息、执行角色和步骤顺序。</DialogDescription>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              <span>正在读取可用角色</span>
            </div>
          ) : draft ? (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void saveWorkflow();
              }}
            >
              <div className="min-h-0 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {error ? (
                  <div
                    role="alert"
                    className="mx-6 mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  >
                    {error}
                  </div>
                ) : null}

                <section className="px-6 py-5" aria-labelledby="workflow-basic-heading">
                  <h3 id="workflow-basic-heading" className="mb-4 text-sm font-semibold">
                    基本信息
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="workflow-name">流程名称</Label>
                      <Input
                        id="workflow-name"
                        value={draft.name}
                        placeholder="例如：起草 + 严格审查"
                        autoFocus
                        onChange={(event) => {
                          const name = event.currentTarget.value;
                          updateDraft((current) => ({ ...current, name }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workflow-description">流程描述</Label>
                      <Input
                        id="workflow-description"
                        value={draft.description ?? ""}
                        placeholder="用于聊天页识别这个流程"
                        onChange={(event) => {
                          const description = event.currentTarget.value;
                          updateDraft((current) => ({ ...current, description }));
                        }}
                      />
                    </div>
                  </div>
                </section>

                <section className="border-t border-border/70 px-6 py-5" aria-labelledby="workflow-steps-heading">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 id="workflow-steps-heading" className="text-sm font-semibold">
                        流程步骤
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">按照列表顺序依次调度角色执行任务。</p>
                    </div>
                    <Button type="button" variant="outline" onClick={addWorkflowStep} disabled={agents.length === 0}>
                      <Plus className="size-4" />
                      <span>新增步骤</span>
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {workflowSteps.map((step, index) => (
                      <div
                        key={step.id}
                        className="space-y-3 rounded-xl border border-border/60 bg-card/75 p-3 shadow-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">步骤 {index + 1}</div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              title="上移"
                              aria-label={`上移步骤 ${index + 1}`}
                              disabled={index === 0}
                              onClick={() => moveWorkflowStep(step.id ?? "", -1)}
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              title="下移"
                              aria-label={`下移步骤 ${index + 1}`}
                              disabled={index === workflowSteps.length - 1}
                              onClick={() => moveWorkflowStep(step.id ?? "", 1)}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 text-muted-foreground hover:text-destructive"
                              title="删除步骤"
                              aria-label={`删除步骤 ${index + 1}`}
                              disabled={workflowSteps.length <= 1}
                              onClick={() => removeWorkflowStep(step.id ?? "")}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="space-y-2">
                            <Label htmlFor={`workflow-step-name-${step.id}`}>步骤名称</Label>
                            <Input
                              id={`workflow-step-name-${step.id}`}
                              value={step.name}
                              placeholder="例如：审查结构"
                              onChange={(event) => {
                                const name = event.currentTarget.value;
                                updateWorkflowStep(step.id ?? "", (current) => ({ ...current, name }));
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`workflow-step-agent-${step.id}`}>执行角色</Label>
                            <NativeSelect
                              id={`workflow-step-agent-${step.id}`}
                              className="w-full"
                              value={step.agentId}
                              disabled={agents.length === 0}
                              onChange={(event) => {
                                const agentId = event.currentTarget.value;
                                updateWorkflowStep(step.id ?? "", (current) => ({ ...current, agentId }));
                              }}
                            >
                              {agents.length === 0 ? (
                                <NativeSelectOption value="">请先创建角色</NativeSelectOption>
                              ) : (
                                agents.map((agent) => (
                                  <NativeSelectOption key={agent.id} value={agent.id}>
                                    {agent.name}
                                  </NativeSelectOption>
                                ))
                              )}
                            </NativeSelect>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`workflow-step-instruction-${step.id}`}>步骤说明</Label>
                          <Textarea
                            id={`workflow-step-instruction-${step.id}`}
                            value={step.instruction ?? ""}
                            placeholder="可选：描述这个步骤要完成什么、重点检查什么或输出什么"
                            className="min-h-20 resize-none"
                            onChange={(event) => {
                              const instruction = event.currentTarget.value;
                              updateWorkflowStep(step.id ?? "", (current) => ({ ...current, instruction }));
                            }}
                          />
                        </div>
                      </div>
                    ))}

                    {workflowSteps.length === 0 ? (
                      <div className="app-empty-state rounded-xl px-3 py-8 text-center text-sm text-muted-foreground">
                        {agents.length === 0 ? "请先创建角色，再新增协作步骤" : "请新增至少一个协作步骤"}
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              <DialogFooter className="shrink-0 border-t border-border/70 bg-card/35 px-6 py-4 sm:justify-between">
                <div>
                  {mode === "edit" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      disabled={isSaving}
                    >
                      <Trash2 className="size-4" />
                      <span>删除协作流程</span>
                    </Button>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
                    取消
                  </Button>
                  <Button type="submit" disabled={isSaving || agents.length === 0}>
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    <span>{isSaving ? "正在保存" : "保存流程"}</span>
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{draft?.name || "这个协作流程"}”？</AlertDialogTitle>
            <AlertDialogDescription>删除后，聊天中将无法再选择此协作流程。此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isSaving} onClick={() => void deleteWorkflow()}>
              {isSaving ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
