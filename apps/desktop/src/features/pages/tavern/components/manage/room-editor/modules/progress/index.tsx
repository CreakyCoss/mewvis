import { Activity, Pencil } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "../../../../../types";
import {
  CompactSummaryItem,
  EditorSection,
} from "../../primitives";
import {
  formatCount,
  getActiveTaskCount,
  getOutcomeEventCount,
  getProgressPlacementText,
  getStatusEventCounts,
} from "../../utils";
import { ProgressEdit, type ProgressEditHandle } from "./edit";
import type { ModuleSave } from "../types";

type ProgressSectionProps = {
  data: TavernRoom;
  onSave: ModuleSave;
};

export const ProgressSection = ({
  data,
  onSave,
}: ProgressSectionProps) => {
  const editRef = useRef<ProgressEditHandle>(null);
  const activeTaskCount = getActiveTaskCount(data);
  const outcomeEventCount = getOutcomeEventCount(data);
  const statusEventCounts = getStatusEventCounts(data);
  const progressPlacementText = getProgressPlacementText(data);

  return (
    <>
      <EditorSection
        icon={Activity}
        title="进度系统"
        description="检查状态栏定义、规则引擎、任务目标、结局条件和可重建快照。"
        action={(
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => editRef.current?.(data)}
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
        )}
        contentClassName="space-y-0 pb-4"
      >
        <div className="grid gap-2 rounded-md border border-border/70 bg-muted/15 p-2 sm:grid-cols-2 lg:grid-cols-4">
          <CompactSummaryItem
            label="状态定义"
            value={formatCount(data.statusDefinitions.length, "项")}
          />
          <CompactSummaryItem
            label="状态规则"
            value={formatCount(data.statusRules.length, "条")}
          />
          <CompactSummaryItem
            label="状态面板"
            value={formatCount(data.progressViews.length, "个")}
            description={progressPlacementText || "未配置展示位置"}
          />
          <CompactSummaryItem
            label="任务定义"
            value={formatCount(data.taskDefinitions.length, "个")}
            description={formatCount(activeTaskCount, "进行中")}
          />
          <CompactSummaryItem
            label="结局条件"
            value={formatCount(data.sceneOutcomes.length, "个")}
            description={formatCount(outcomeEventCount, "已触发")}
          />
          <CompactSummaryItem
            label="状态事件"
            value={formatCount(data.statusEvents.length, "条")}
            description={`${statusEventCounts.applied} 已应用 / ${statusEventCounts.pending} 待确认`}
          />
          <CompactSummaryItem
            label="检查点"
            value={formatCount(data.statusCheckpoints.length, "个")}
            description="可用于裁切后重建状态"
          />
          <CompactSummaryItem
            label="应用方式"
            value={data.progressTracker.applyMode === "review" ? "确认后应用" : "自动应用"}
            description={`置信阈值 ${data.progressTracker.factConfidenceThreshold}`}
          />
        </div>
      </EditorSection>

      <ProgressEdit
        bind={editRef}
        data={data}
        onSave={onSave}
      />
    </>
  );
};
