import { ArrowDown, ArrowUp, GitBranch, Plus, Save, Trash2 } from "lucide-react";
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
import type { SaveCollaborationWorkflowInput } from "../../agent/types";
import { useAgentSettings } from "../../agent/hooks/use-agent";

type WorkflowStepDraft = NonNullable<SaveCollaborationWorkflowInput["steps"]>[number];

type CollaborationWorkflowSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const createWorkflowStepId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `workflow-step-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const CollaborationWorkflowSettingsDialog = ({
  open,
  onOpenChange,
}: CollaborationWorkflowSettingsDialogProps) => {
  const {
    workflows,
    workflowDraft,
    selectedWorkflowId,
    agentProfiles,
    isLoading,
    isSaving,
    error,
    createNewWorkflow,
    selectWorkflow,
    updateWorkflowDraft,
    saveWorkflow,
    removeWorkflow,
  } = useAgentSettings(open);

  const workflowSteps = workflowDraft.steps ?? [];

  const handleSave = async () => {
    const didSave = await saveWorkflow();
    if (didSave) {
      onOpenChange(false);
    }
  };

  const updateWorkflowStep = (stepId: string, updater: (step: WorkflowStepDraft) => WorkflowStepDraft) => {
    updateWorkflowDraft((current) => ({
      ...current,
      steps: (current.steps ?? []).map((step) => (step.id === stepId ? updater(step) : step)),
    }));
  };

  const moveWorkflowStep = (stepId: string, direction: -1 | 1) => {
    updateWorkflowDraft((current) => {
      const steps = [...(current.steps ?? [])];
      const index = steps.findIndex((step) => step.id === stepId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= steps.length) {
        return current;
      }
      const [step] = steps.splice(index, 1);
      steps.splice(nextIndex, 0, step);

      return { ...current, steps };
    });
  };

  const addWorkflowStep = () => {
    updateWorkflowDraft((current) => ({
      ...current,
      steps: [
        ...(current.steps ?? []),
        {
          id: createWorkflowStepId(),
          name: `步骤 ${(current.steps?.length ?? 0) + 1}`,
          agentId: agentProfiles[0]?.id ?? "",
          instruction: "",
          phase: null,
        },
      ],
    }));
  };

  const removeWorkflowStep = (stepId: string) => {
    updateWorkflowDraft((current) => ({
      ...current,
      steps: (current.steps ?? []).filter((step) => step.id !== stepId),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden border-border/70 bg-popover p-0 shadow-[var(--shadow-floating)] sm:max-w-5xl">
        <DialogHeader>
          <div className="border-b border-border/70 bg-card/35 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                <GitBranch className="size-4" />
              </span>
              <span>协作流程设置</span>
            </DialogTitle>
            <DialogDescription className="mt-2">配置自定义协作流程、执行角色和步骤。</DialogDescription>
          </div>
        </DialogHeader>

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[260px_1fr]">
          <aside className="flex min-h-0 flex-col gap-3 border-r border-border/70 bg-surface/60 px-4 py-4">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={createNewWorkflow}
              disabled={isLoading}
            >
              <Plus className="size-4" />
              <span>新增协作流程</span>
            </Button>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  className={[
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-[color,background-color,border-color,box-shadow] motion-reduce:transition-none",
                    workflow.id === selectedWorkflowId
                      ? "border-primary/20 bg-card text-foreground ring-1 ring-primary/10"
                      : "border-transparent bg-card/65 hover:bg-card",
                  ].join(" ")}
                  onClick={() => selectWorkflow(workflow.id)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                    <GitBranch className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{workflow.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {workflow.description || "自定义协作流程"}
                    </span>
                  </span>
                </button>
              ))}
              {!workflows.length && !isLoading && (
                <div className="app-empty-state rounded-xl px-3 py-8 text-center text-sm text-muted-foreground">
                  暂无自定义协作流程
                </div>
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                正在读取协作流程设置
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                  <div className="space-y-2">
                    <Label htmlFor="workflow-name">流程名称</Label>
                    <Input
                      id="workflow-name"
                      value={workflowDraft.name}
                      placeholder="例如：起草 + 严格审查"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateWorkflowDraft((current) => ({ ...current, name: value }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workflow-description">流程描述</Label>
                    <Input
                      id="workflow-description"
                      value={workflowDraft.description ?? ""}
                      placeholder="用于聊天页识别这个流程"
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        updateWorkflowDraft((current) => ({ ...current, description: value }));
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label>流程步骤</Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addWorkflowStep}
                      disabled={agentProfiles.length === 0}
                    >
                      <Plus className="size-4" />
                      <span>新增步骤</span>
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {workflowSteps.map((step, index) => (
                      <div
                        key={step.id}
                        className="space-y-3 rounded-xl border border-border/60 bg-card/75 px-3 py-3 shadow-xs"
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
                              disabled={index === workflowSteps.length - 1}
                              onClick={() => moveWorkflowStep(step.id ?? "", 1)}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              title="删除步骤"
                              disabled={workflowSteps.length <= 1}
                              onClick={() => removeWorkflowStep(step.id ?? "")}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
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
                              disabled={agentProfiles.length === 0}
                              onChange={(event) => {
                                const agentId = event.currentTarget.value;
                                updateWorkflowStep(step.id ?? "", (current) => ({ ...current, agentId }));
                              }}
                            >
                              {agentProfiles.length === 0 ? (
                                <NativeSelectOption value="">请先创建角色</NativeSelectOption>
                              ) : (
                                agentProfiles.map((agent) => (
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
                    {workflowSteps.length === 0 && (
                      <div className="app-empty-state rounded-xl px-3 py-8 text-center text-sm text-muted-foreground">
                        {agentProfiles.length === 0 ? "请先手动创建角色，再新增协作步骤" : "请新增至少一个协作步骤"}
                      </div>
                    )}
                  </div>
                </div>

                {selectedWorkflowId && (
                  <div className="flex justify-end rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void removeWorkflow(selectedWorkflowId)}
                      disabled={isSaving}
                    >
                      <Trash2 className="size-4" />
                      <span>删除协作流程</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-border/70 bg-card/35 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            <Save className="size-4" />
            <span>{isSaving ? "保存中" : "保存流程"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
