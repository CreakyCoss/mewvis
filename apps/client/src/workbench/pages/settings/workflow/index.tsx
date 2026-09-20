import { useCallback, useEffect, useRef, useState } from "react";
import { GitBranch, Loader2, Plus } from "lucide-react";
import { getAiAgentSettings } from "@/api/agents";
import { Button } from "design-system/components/ui/button";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { formatDateTime } from "@/utils/time";
import { SettingsPageHeader } from "../page-header";
import { WorkflowEditDialog, type WorkflowEditDialogHandle } from "./edit";
import type { CollaborationWorkflow } from "./types";

const WorkflowRow = ({ workflow, onOpen }: { workflow: CollaborationWorkflow; onOpen: () => void }) => (
  <button
    type="button"
    className="group grid min-h-15 w-full min-w-0 grid-cols-[minmax(180px,0.8fr)_minmax(240px,1.25fr)_100px_150px] items-center gap-4 border-b border-border/70 px-4 text-left transition-colors hover:bg-accent/20 focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/20 focus-visible:outline-none max-lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1.2fr)_100px]"
    onClick={onOpen}
    aria-label={`编辑协作流程 ${workflow.name || "未命名流程"}`}
  >
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
        <GitBranch className="size-4" />
      </span>
      <span className="truncate text-sm font-medium">{workflow.name || "未命名流程"}</span>
    </span>
    <span className="truncate text-sm text-muted-foreground">{workflow.description || "暂无描述"}</span>
    <span className="text-sm text-foreground">{workflow.steps.length} 个步骤</span>
    <span className="text-sm text-muted-foreground max-lg:hidden">{formatDateTime(workflow.updatedAt)}</span>
  </button>
);

const WorkflowTableHeader = () => (
  <div className="grid min-h-15 grid-cols-[minmax(180px,0.8fr)_minmax(240px,1.25fr)_100px_150px] items-center gap-4 border-b border-border/70 px-4 text-xs font-medium text-muted-foreground max-lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1.2fr)_100px]">
    <span>协作流程</span>
    <span>描述</span>
    <span>步骤</span>
    <span className="max-lg:hidden">更新时间</span>
  </div>
);

export const WorkflowSettingsPage = () => {
  const workflowEditDialogRef = useRef<WorkflowEditDialogHandle>(null);
  const [workflows, setWorkflows] = useState<CollaborationWorkflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWorkflows = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const settings = await getAiAgentSettings();
      setWorkflows(settings.collaborationWorkflows);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const openCreateWorkflow = () => {
    workflowEditDialogRef.current?.open({ mode: "create" });
  };

  const openEditWorkflow = (workflow: CollaborationWorkflow) => {
    workflowEditDialogRef.current?.open({ mode: "edit", workflow });
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface/45">
      <SettingsPageHeader
        title="协作流程设置"
        description="管理多角色协作步骤和执行顺序"
        action={
          <Button type="button" onClick={openCreateWorkflow}>
            <Plus className="size-4" />
            <span>添加协作流程</span>
          </Button>
        }
      />

      <ScrollArea className="min-h-0 flex-1 bg-transparent">
        <div className="w-full px-6">
          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              <span>正在读取协作流程设置</span>
            </div>
          ) : workflows.length > 0 ? (
            <div className="w-full">
              <WorkflowTableHeader />
              <div aria-label="已配置的协作流程">
                {workflows.map((workflow) => (
                  <WorkflowRow key={workflow.id} workflow={workflow} onOpen={() => openEditWorkflow(workflow)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="app-empty-state mt-8 flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
                <GitBranch className="size-6" />
              </span>
              <div className="space-y-1">
                <h3 className="font-semibold">还没有创建协作流程</h3>
                <p className="text-sm text-muted-foreground">创建流程后，可以按顺序调度多个角色共同完成任务。</p>
              </div>
              <Button type="button" onClick={openCreateWorkflow}>
                <Plus className="size-4" />
                <span>添加协作流程</span>
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <WorkflowEditDialog bind={workflowEditDialogRef} onSaved={loadWorkflows} />
    </section>
  );
};
