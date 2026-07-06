import { ListChecks, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExecutionChain, type ExecutionChainGroup } from "@/features/ai/components/execution-chain";

export type ExecutionStep = {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
};

type ExecutionTraceProps = {
  steps: ExecutionStep[];
  statusText?: string;
};

const getStepDetail = (step: ExecutionStep) => {
  if (step.status === "done" && step.id.startsWith("speaker-")) {
    return "已生成角色回复。";
  }

  return step.detail ?? "";
};

const getStepFallbackDetail = (step: ExecutionStep) => {
  if (step.status === "pending") {
    return "等待前置步骤完成。";
  }
  if (step.status === "running") {
    return "正在执行当前阶段。";
  }
  if (step.status === "done") {
    return "当前阶段已完成。";
  }
  if (step.status === "skipped") {
    return "当前阶段已跳过。";
  }
  return "当前阶段执行失败。";
};

export const ExecutionTrace = ({ steps, statusText }: ExecutionTraceProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const activeStatusText = statusText?.trim() ?? "";
  const runningStep = steps.find((step) => step.status === "running");
  const errorStep = steps.find((step) => step.status === "error");
  const doneCount = steps.filter((step) => step.status === "done").length;
  const summary = errorStep
    ? `${errorStep.label}失败`
    : activeStatusText || (runningStep ? `正在${runningStep.label}` : `${doneCount}/${steps.length} 步完成`);

  const groups: ExecutionChainGroup[] = useMemo(
    () =>
      steps.map((step) => {
        const detail = step.status === "running" && activeStatusText ? activeStatusText : getStepDetail(step);
        return {
          id: step.id,
          title: step.label,
          status: step.status,
          defaultOpen: step.status === "running" || step.status === "error",
          events: [
            {
              id: `${step.id}:detail`,
              content: detail || getStepFallbackDetail(step),
            },
          ],
        };
      }),
    [activeStatusText, steps],
  );

  if (steps.length === 0) {
    return null;
  }

  return (
    <>
      <div className="group/message flex justify-start">
        <div className="flex w-full max-w-[min(84%,720px)] gap-3">
          <div className="size-10 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 overflow-hidden">
            <button
              type="button"
              className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md bg-muted/35 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setIsDialogOpen(true)}
            >
              <ListChecks className="size-3.5 shrink-0" />
              <span className="shrink-0">生成过程</span>
              <span className="shrink-0 rounded-sm bg-background px-1.5 py-0.5 text-[11px]">{steps.length} 段</span>
              <span className="min-w-0 flex-1 truncate rounded-sm bg-background/70 px-1.5 py-0.5 text-[11px]">
                {summary}
              </span>
              {errorStep ? (
                <span className="shrink-0 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                  异常
                </span>
              ) : null}
              {runningStep ? <Loader2 className="size-3 shrink-0 animate-spin" /> : null}
              <span className="shrink-0 rounded-sm bg-background px-1.5 py-0.5 text-[11px]">查看</span>
            </button>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[min(86vh,44rem)] overflow-hidden sm:max-w-2xl">
          <DialogHeader className="pr-8">
            <DialogTitle>生成过程</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <ExecutionChain
            title="生成过程"
            groups={groups}
            icon={ListChecks}
            isBusy={Boolean(runningStep)}
            isCollapsed={false}
            showHeader={false}
            className="mb-0 bg-muted/25"
            contentClassName="max-h-[min(62vh,32rem)] px-2"
            onToggle={() => undefined}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
