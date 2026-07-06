import {
  Box,
  Clapperboard,
  Clock3,
  FileText,
  Image,
  PackageCheck,
  Pencil,
  Settings2,
  ShieldCheck,
  Target,
  UserRoundCog,
  UserRoundSearch,
  UserRoundMinus,
  UsersRound,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernRoom, TavernRoomSettings } from "@/features/pages/taverns/manage/model";
import {
  EditorMetricStrip,
  EditorProgressCard,
  EditorSection,
  EditorSettingGroup,
  EditorSettingRow,
  EditorStatusPill,
  editorHeaderActionButtonClassName,
} from "../../primitives";
import { SettingsEdit, type SettingsEditHandle } from "./edit";
import type { ModuleSave } from "../types";

type SettingsSectionProps = {
  data: TavernRoom;
  globalRuntimeModel: RuntimeModelOption | null;
  onSave: ModuleSave;
};

const booleanTone = (value: boolean) => (value ? "active" : "muted");
const enabledText = (value: boolean) => (value ? "开启" : "关闭");
const directorScaleLabel = {
  focused: "聚焦",
  balanced: "均衡",
  ensemble: "群像",
} satisfies Record<TavernRoomSettings["directorNarrativeControl"]["responseScale"], string>;
const agencyModeLabel = {
  player_protagonist: "主角",
  story_directive: "指令",
  scene_drive: "自推",
} satisfies Record<TavernRoomSettings["directorNarrativeControl"]["agencyMode"], string>;
const qnaBreakLabel = {
  off: "问答不断",
  auto: "自动打断",
  aggressive: "积极打断",
} satisfies Record<TavernRoomSettings["directorNarrativeControl"]["qnaBreak"], string>;

export const SettingsSection = ({ data, globalRuntimeModel, onSave }: SettingsSectionProps) => {
  const editRef = useRef<SettingsEditHandle>(null);
  const modelLabel = globalRuntimeModel
    ? `${globalRuntimeModel.provider.name} / ${globalRuntimeModel.modelName || globalRuntimeModel.modelId}`
    : "未选择";
  const directorProfileCharacterCount = data.settings.directorScheduling.profile
    ? Object.keys(data.settings.directorScheduling.profile.characterProfiles).length
    : 0;
  const randomEventPercentage = Math.round(data.settings.randomEvents.probability * 100);
  const randomEventProgress = data.settings.randomEvents.enabled ? randomEventPercentage : 0;

  return (
    <>
      <EditorSection
        icon={Settings2}
        title="运行设置"
        description="控制模型执行、自动化、导演调度和信息揭示。"
        action={
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
        }
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
              <EditorSettingGroup title="执行反馈" className="lg:pr-5">
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
                <EditorSettingRow icon={PackageCheck} label="草稿上限">
                  <EditorStatusPill tone="info">{data.settings.maxAssetDrafts} 份</EditorStatusPill>
                </EditorSettingRow>
              </EditorSettingGroup>

              <EditorSettingGroup title="导演与信息" className="lg:pl-5">
                <EditorSettingRow icon={Target} label="随机事件">
                  <EditorStatusPill tone={data.settings.randomEvents.enabled ? "warning" : "muted"}>
                    {data.settings.randomEvents.enabled ? `${randomEventPercentage}%` : "关闭"}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={Clapperboard} label="推进策略">
                  <EditorStatusPill tone="info">
                    {agencyModeLabel[data.settings.directorNarrativeControl.agencyMode]} /{" "}
                    {directorScaleLabel[data.settings.directorNarrativeControl.responseScale]} /{" "}
                    {qnaBreakLabel[data.settings.directorNarrativeControl.qnaBreak]}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={UsersRound} label="导演回环">
                  <EditorStatusPill tone={data.settings.directorLoop.enabled ? "active" : "muted"}>
                    {data.settings.directorLoop.enabled ? `${data.settings.directorLoop.maxRounds} 轮` : "关闭"}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={ShieldCheck} label="质量护栏">
                  <EditorStatusPill tone={data.settings.interactionQualityRuleIds.length > 0 ? "active" : "muted"}>
                    {data.settings.interactionQualityRuleIds.length > 0
                      ? `${data.settings.interactionQualityRuleIds.length} 项`
                      : "关闭"}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={UserRoundSearch} label="信息模式">
                  <EditorStatusPill tone={data.settings.informationPolicy.mode === "open" ? "muted" : "warning"}>
                    {data.settings.informationPolicy.mode === "open"
                      ? "开放"
                      : data.settings.informationPolicy.mode === "mystery"
                        ? "悬疑"
                        : data.settings.informationPolicy.mode === "social_deduction"
                          ? "阵营"
                          : "自定义"}
                  </EditorStatusPill>
                </EditorSettingRow>
                <EditorSettingRow icon={UserRoundMinus} label="角色压缩">
                  <EditorStatusPill tone={data.settings.agentKnowledgeCompactIntervalTurns > 0 ? "info" : "muted"}>
                    {data.settings.agentKnowledgeCompactIntervalTurns > 0
                      ? `${data.settings.agentKnowledgeCompactIntervalTurns} 轮`
                      : "关闭"}
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
      </EditorSection>

      <SettingsEdit bind={editRef} data={data} modelLabel={modelLabel} onSave={onSave} />
    </>
  );
};
