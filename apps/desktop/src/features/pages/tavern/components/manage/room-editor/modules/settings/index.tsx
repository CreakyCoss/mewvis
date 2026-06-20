import {
  Activity,
  Box,
  Clock3,
  Eye,
  FileText,
  Image,
  LayoutDashboard,
  PackageCheck,
  Pencil,
  Settings2,
  Sparkles,
  Target,
  UserRoundCog,
  UserRoundMinus,
  UsersRound,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type {
  TavernRoom,
  TavernRoomSettings,
} from "../../../../../types";
import {
  EditorMetricStrip,
  EditorProgressCard,
  EditorSection,
  EditorSettingGroup,
  EditorSettingRow,
  EditorStatusPill,
  editorHeaderActionButtonClassName,
} from "../../primitives";
import { getErrorMessage } from "../../utils";
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

const booleanTone = (value: boolean) => value ? "active" : "muted";
const enabledText = (value: boolean) => value ? "开启" : "关闭";

const getProgressModeLabel = (data: TavernRoom) => {
  if (data.progressTracker.mode === "manual") {
    return "手动";
  }

  if (data.progressTracker.mode === "afterTurn") {
    return "每轮";
  }

  return `${data.progressTracker.intervalTurns} 轮`;
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
  const directorProfileCharacterCount = data.settings.directorScheduling.profile
    ? Object.keys(data.settings.directorScheduling.profile.characterProfiles).length
    : 0;
  const randomEventPercentage = Math.round(data.settings.randomEvents.probability * 100);
  const randomEventProgress = data.settings.randomEvents.enabled ? randomEventPercentage : 0;

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
              size="sm"
              variant="outline"
              className={editorHeaderActionButtonClassName}
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
              size="sm"
              variant="outline"
              className={editorHeaderActionButtonClassName}
              onClick={() => editRef.current?.(data)}
            >
              <Pencil className="size-3.5" />
              编辑
            </Button>
          </div>
        )}
        contentClassName="space-y-4 pb-4"
      >
        <EditorMetricStrip
          items={[
            {
              icon: Box,
              label: "酒馆模型",
              value: modelLabel,
              className: "sm:col-span-2 xl:col-span-1",
            },
            {
              icon: UsersRound,
              label: "导演人数",
              value: `${data.settings.directorMaxSpeakers} 人`,
            },
            {
              icon: Clock3,
              label: "整理间隔",
              value: `${data.settings.assetExtractionIntervalTurns} 轮`,
            },
            {
              icon: UserRoundCog,
              label: "调度画像",
              value: `${directorProfileCharacterCount} 角色`,
              description: directorProfileCharacterCount > 0 ? undefined : "未生成",
            },
          ]}
        />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="rounded-lg border border-border/70 bg-background/72 px-3.5 py-3.5 shadow-xs">
            <div className="grid gap-4 lg:grid-cols-3 lg:divide-x lg:divide-border/60">
              <EditorSettingGroup title="叙事体验" className="lg:pr-5">
                <EditorSettingRow icon={Eye} label="沉浸描写">
                  <EditorStatusPill tone={booleanTone(data.settings.immersiveDescriptionEnabled)}>
                    {enabledText(data.settings.immersiveDescriptionEnabled)}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={FileText} label="显示执行过程">
                  <EditorStatusPill tone={booleanTone(data.settings.showExecutionTrace)}>
                    {enabledText(data.settings.showExecutionTrace)}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={Image} label="插图提示">
                  <EditorStatusPill tone={booleanTone(data.settings.illustrationHints.enabled)}>
                    {enabledText(data.settings.illustrationHints.enabled)}
                  </EditorStatusPill>
                </EditorSettingRow>
              </EditorSettingGroup>

              <EditorSettingGroup title="自动化" className="lg:px-5">
                <EditorSettingRow icon={PackageCheck} label="自动整理剧情资产">
                  <EditorStatusPill tone={booleanTone(data.settings.autoAssetExtractionEnabled)}>
                    {enabledText(data.settings.autoAssetExtractionEnabled)}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={Target} label="自动追踪状态">
                  <EditorStatusPill tone={booleanTone(data.progressTracker.enabled)}>
                    {enabledText(data.progressTracker.enabled)}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={Activity} label="状态追踪">
                  <EditorStatusPill tone="active">
                    {getProgressModeLabel(data)}
                  </EditorStatusPill>
                </EditorSettingRow>
              </EditorSettingGroup>

              <EditorSettingGroup title="界面反馈" className="lg:pl-5">
                <EditorSettingRow icon={LayoutDashboard} label="状态栏">
                  <EditorStatusPill tone={data.settings.statusTracking.enabled ? "active" : "muted"}>
                    {data.settings.statusTracking.enabled ? "显示" : "隐藏"}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={UserRoundMinus} label="角色压缩">
                  <EditorStatusPill
                    tone={data.settings.agentKnowledgeCompactIntervalTurns > 0 ? "info" : "muted"}
                  >
                    {data.settings.agentKnowledgeCompactIntervalTurns > 0
                      ? `${data.settings.agentKnowledgeCompactIntervalTurns} 轮`
                      : "关闭"}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={LayoutDashboard} label="状态配置">
                  <EditorStatusPill tone={data.progressViews.length > 0 ? "active" : "muted"}>
                    {data.progressViews.length} 面板
                  </EditorStatusPill>
                </EditorSettingRow>
              </EditorSettingGroup>
            </div>
          </div>

          <EditorProgressCard
            title="导演随机事件"
            value={data.settings.randomEvents.enabled ? `${randomEventPercentage}%` : "关闭"}
            progress={randomEventProgress}
            description={data.settings.randomEvents.enabled ? "按回合触发" : "当前不触发"}
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
