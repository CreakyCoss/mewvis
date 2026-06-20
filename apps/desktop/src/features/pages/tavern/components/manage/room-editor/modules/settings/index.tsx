import { Pencil, Settings2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type {
  TavernRoom,
  TavernRoomSettings,
} from "../../../../../types";
import {
  CompactSummaryItem,
  EditorSection,
} from "../../primitives";
import { formatCount, getErrorMessage } from "../../utils";
import { SettingsEdit, type SettingsEditHandle } from "./edit";
import type { ModuleSave } from "../types";

type SettingsSectionProps = {
  data: TavernRoom;
  globalRuntimeModel: RuntimeModelOption | null;
  onRegenerateDirectorProfile: (
    room: TavernRoom,
  ) => Promise<NonNullable<TavernRoomSettings["directorScheduling"]["profile"]>>;
  onSave: ModuleSave;
};

export const SettingsSection = ({
  data,
  globalRuntimeModel,
  onRegenerateDirectorProfile,
  onSave,
}: SettingsSectionProps) => {
  const editRef = useRef<SettingsEditHandle>(null);
  const [isRegeneratingDirectorProfile, setIsRegeneratingDirectorProfile] = useState(false);
  const [directorProfileError, setDirectorProfileError] = useState("");
  const modelLabel = globalRuntimeModel
    ? `${globalRuntimeModel.provider.name} / ${
        globalRuntimeModel.modelName || globalRuntimeModel.modelId
      }`
    : "未选择";

  const regenerateDirectorProfile = async () => {
    if (isRegeneratingDirectorProfile) {
      return;
    }

    setIsRegeneratingDirectorProfile(true);
    setDirectorProfileError("");
    try {
      const profile = await onRegenerateDirectorProfile(data);
      onSave({
        settings: {
          ...data.settings,
          directorScheduling: {
            ...data.settings.directorScheduling,
            profile,
          },
        },
      });
    } catch (profileError) {
      setDirectorProfileError(`生成调度画像失败：${getErrorMessage(profileError)}`);
    } finally {
      setIsRegeneratingDirectorProfile(false);
    }
  };

  return (
    <>
      <EditorSection
        icon={Settings2}
        title="运行设置"
        description="控制执行过程、剧情资产整理频率和导演调度人数。"
        action={(
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={
                data.locked ||
                isRegeneratingDirectorProfile ||
                !globalRuntimeModel ||
                data.characterIds.length === 0
              }
              onClick={() => void regenerateDirectorProfile()}
            >
              <Sparkles className="size-3.5" />
              {isRegeneratingDirectorProfile ? "生成中" : "生成调度画像"}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => editRef.current?.(data)}
            >
              <Pencil className="size-3.5" />
              编辑
            </Button>
          </div>
        )}
        contentClassName="space-y-0 pb-4"
      >
        <div className="grid gap-2 rounded-md border border-border/70 bg-muted/15 p-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(6.25rem,1fr))]">
          <CompactSummaryItem
            label="酒馆模型"
            value={modelLabel}
            className="sm:col-span-2 lg:col-span-1"
          />
          <CompactSummaryItem
            label="沉浸描写"
            value={(
              <Badge variant={data.settings.immersiveDescriptionEnabled ? "secondary" : "outline"}>
                {data.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}
              </Badge>
            )}
            valueClassName="flex"
          />
          <CompactSummaryItem
            label="显示执行过程"
            value={(
              <Badge variant={data.settings.showExecutionTrace ? "secondary" : "outline"}>
                {data.settings.showExecutionTrace ? "开启" : "关闭"}
              </Badge>
            )}
            valueClassName="flex"
          />
          <CompactSummaryItem
            label="自动整理剧情资产"
            value={(
              <Badge variant={data.settings.autoAssetExtractionEnabled ? "secondary" : "outline"}>
                {data.settings.autoAssetExtractionEnabled ? "开启" : "关闭"}
              </Badge>
            )}
            valueClassName="flex"
          />
          <CompactSummaryItem
            label="状态栏"
            value={(
              <Badge variant={data.settings.statusTracking.enabled ? "secondary" : "outline"}>
                {data.settings.statusTracking.enabled ? "显示" : "隐藏"}
              </Badge>
            )}
            valueClassName="flex"
          />
          <CompactSummaryItem
            label="自动追踪状态"
            value={(
              <Badge variant={data.progressTracker.enabled ? "secondary" : "outline"}>
                {data.progressTracker.enabled ? "开启" : "关闭"}
              </Badge>
            )}
            valueClassName="flex"
          />
          <CompactSummaryItem
            label="导演随机事件"
            value={data.settings.randomEvents.enabled
              ? `${Math.round(data.settings.randomEvents.probability * 100)}%`
              : "关闭"}
          />
          <CompactSummaryItem
            label="整理间隔"
            value={`${data.settings.assetExtractionIntervalTurns} 轮`}
          />
          <CompactSummaryItem
            label="草稿上限"
            value={`${data.settings.maxAssetDrafts} 条`}
          />
          <CompactSummaryItem
            label="导演人数"
            value={`${data.settings.directorMaxSpeakers} 人`}
          />
          <CompactSummaryItem
            label="调度画像"
            value={data.settings.directorScheduling.profile
              ? `${Object.keys(data.settings.directorScheduling.profile.characterProfiles).length} 角色`
              : "未生成"}
          />
          <CompactSummaryItem
            label="角色压缩"
            value={data.settings.agentKnowledgeCompactIntervalTurns > 0
              ? `${data.settings.agentKnowledgeCompactIntervalTurns} 轮`
              : "关闭"}
          />
          <CompactSummaryItem
            label="状态追踪"
            value={data.progressTracker.mode === "manual"
              ? "手动"
              : data.progressTracker.mode === "afterTurn"
              ? "每轮"
              : `${data.progressTracker.intervalTurns} 轮`}
          />
          <CompactSummaryItem
            label="插图提示"
            value={data.settings.illustrationHints.enabled ? "开启" : "关闭"}
          />
          <CompactSummaryItem
            label="状态配置"
            value={formatCount(data.progressViews.length, "面板")}
          />
        </div>
        {directorProfileError && (
          <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {directorProfileError}
          </div>
        )}
      </EditorSection>

      <SettingsEdit
        bind={editRef}
        data={data}
        modelLabel={modelLabel}
        onSave={onSave}
      />
    </>
  );
};
