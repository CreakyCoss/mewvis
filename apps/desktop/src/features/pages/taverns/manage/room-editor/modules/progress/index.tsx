import {
  Activity,
  ArchiveRestore,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  GitBranch,
  History,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Target,
  Trophy,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { TavernRoom } from "../../../../tavern/types";
import {
  EditorMetricStrip,
  EditorProgressCard,
  EditorSection,
  EditorSettingGroup,
  EditorSettingRow,
  EditorStatusPill,
  editorHeaderActionButtonClassName,
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

const getProgressModeLabel = (data: TavernRoom) => {
  if (data.progressTracker.mode === "manual") {
    return "手动";
  }

  if (data.progressTracker.mode === "afterTurn") {
    return "每轮";
  }

  return `${data.progressTracker.intervalTurns} 轮`;
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
  const appliedStatusEventRate = data.statusEvents.length > 0
    ? Math.round((statusEventCounts.applied / data.statusEvents.length) * 100)
    : 0;

  return (
    <>
      <EditorSection
        icon={Activity}
        title="进度系统"
        description="检查状态栏定义、规则引擎、任务目标、结局条件和可重建快照。"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            onClick={() => editRef.current?.(data)}
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
        )}
        contentClassName="space-y-4 pb-4"
      >
        <EditorMetricStrip
          items={[
            {
              icon: ListChecks,
              label: "状态定义",
              value: formatCount(data.statusDefinitions.length, "项"),
            },
            {
              icon: GitBranch,
              label: "状态规则",
              value: formatCount(data.statusRules.length, "条"),
            },
            {
              icon: LayoutDashboard,
              label: "状态面板",
              value: formatCount(data.progressViews.length, "个"),
              description: progressPlacementText || "未配置展示位置",
            },
            {
              icon: Target,
              label: "任务定义",
              value: formatCount(data.taskDefinitions.length, "个"),
              description: formatCount(activeTaskCount, "进行中"),
            },
          ]}
        />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="rounded-lg border border-border/70 bg-background/72 px-3.5 py-3.5 shadow-xs">
            <div className="grid gap-4 lg:grid-cols-3 lg:divide-x lg:divide-border/60">
              <EditorSettingGroup title="状态结构" className="lg:pr-5">
                <EditorSettingRow icon={ListChecks} label="状态定义">
                  <EditorStatusPill tone={data.statusDefinitions.length > 0 ? "active" : "muted"}>
                    {formatCount(data.statusDefinitions.length, "项")}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={GitBranch} label="状态规则">
                  <EditorStatusPill tone={data.statusRules.length > 0 ? "active" : "muted"}>
                    {formatCount(data.statusRules.length, "条")}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={Activity} label="状态事件">
                  <EditorStatusPill tone={data.statusEvents.length > 0 ? "info" : "muted"}>
                    {formatCount(data.statusEvents.length, "条")}
                  </EditorStatusPill>
                </EditorSettingRow>
              </EditorSettingGroup>

              <EditorSettingGroup title="剧情目标" className="lg:px-5">
                <EditorSettingRow icon={Target} label="任务定义">
                  <EditorStatusPill tone={data.taskDefinitions.length > 0 ? "active" : "muted"}>
                    {formatCount(data.taskDefinitions.length, "个")}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={Trophy} label="结局条件">
                  <EditorStatusPill tone={data.sceneOutcomes.length > 0 ? "warning" : "muted"}>
                    {formatCount(data.sceneOutcomes.length, "个")}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={ClipboardCheck} label="已触发">
                  <EditorStatusPill tone={outcomeEventCount > 0 ? "active" : "muted"}>
                    {formatCount(outcomeEventCount, "个")}
                  </EditorStatusPill>
                </EditorSettingRow>
              </EditorSettingGroup>

              <EditorSettingGroup title="应用策略" className="lg:pl-5">
                <EditorSettingRow icon={CheckCircle2} label="应用方式">
                  <EditorStatusPill tone={data.progressTracker.applyMode === "review" ? "info" : "active"}>
                    {data.progressTracker.applyMode === "review" ? "确认后应用" : "自动应用"}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={Gauge} label="置信阈值">
                  <EditorStatusPill tone="active">
                    {data.progressTracker.factConfidenceThreshold}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={ArchiveRestore} label="检查点">
                  <EditorStatusPill tone={data.statusCheckpoints.length > 0 ? "info" : "muted"}>
                    {formatCount(data.statusCheckpoints.length, "个")}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={History} label="状态更新">
                  <EditorStatusPill tone={data.progressTracker.enabled ? "active" : "muted"}>
                    {data.progressTracker.enabled ? getProgressModeLabel(data) : "关闭"}
                  </EditorStatusPill>
                </EditorSettingRow>
              </EditorSettingGroup>
            </div>
          </div>

          <EditorProgressCard
            title="状态事件应用率"
            value={`${appliedStatusEventRate}%`}
            progress={appliedStatusEventRate}
            description={`${statusEventCounts.applied} 已应用 / ${statusEventCounts.pending} 待确认`}
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
