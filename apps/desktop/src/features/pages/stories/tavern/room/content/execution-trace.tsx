import { ListChecks, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExecutionChain, type ExecutionChainGroup } from "@/features/ai/components/execution-chain";
import type { ExecutionStep } from "../context";

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

const getStepStatusDetail = (step: ExecutionStep) => {
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
              content: detail || getStepStatusDetail(step),
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
              className="app-process-block app-process-trigger flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl px-3 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25"
              onClick={() => setIsDialogOpen(true)}
            >
              <ListChecks className="size-3.5 shrink-0" />
              <span className="shrink-0">生成过程</span>
              <span className="shrink-0 rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-xs">
                {steps.length} 段
              </span>
              <span className="min-w-0 flex-1 truncate rounded-md bg-background/70 px-2 py-0.5 text-xs">{summary}</span>
              {errorStep ? (
                <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive">异常</span>
              ) : null}
              {runningStep ? <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : null}
              <span className="shrink-0 text-xs">查看</span>
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
