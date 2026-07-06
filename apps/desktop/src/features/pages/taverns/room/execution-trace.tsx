import { ListChecks } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const stepKey = useMemo(() => steps.map((step) => `${step.id}:${step.status}`).join("|"), [steps]);
  const activeStatusText = statusText?.trim() ?? "";
  const runningStep = steps.find((step) => step.status === "running");
  const errorStep = steps.find((step) => step.status === "error");
  const doneCount = steps.filter((step) => step.status === "done").length;
  const hasActiveStep = Boolean(runningStep || errorStep || activeStatusText);
  const summary = errorStep
    ? `${errorStep.label}失败`
    : activeStatusText || (runningStep ? `正在${runningStep.label}` : `${doneCount}/${steps.length} 步完成`);

  useEffect(() => {
    setIsExpanded(hasActiveStep);
  }, [hasActiveStep, stepKey]);

  const groups: ExecutionChainGroup[] = steps.map((step) => {
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
  });

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="group/message flex justify-start">
      <div className="flex w-full max-w-[min(84%,720px)] gap-3">
        <div className="size-10 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 overflow-hidden">
          <ExecutionChain
            title="生成过程"
            groups={groups}
            icon={ListChecks}
            isBusy={Boolean(runningStep)}
            isCollapsed={!isExpanded}
            summaryText={summary}
            className="mb-0"
            onToggle={() => setIsExpanded((current) => !current)}
          />
        </div>
      </div>
    </div>
  );
};
