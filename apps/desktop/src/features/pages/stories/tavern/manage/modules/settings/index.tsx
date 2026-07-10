import { clamp } from "lodash-es";
import { Box, Clapperboard, Eye, Gauge, Settings2, UsersRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernRoomConfig, TavernRoomSettings } from "@/features/pages/stories/tavern/manage/model";
import { EditorField, EditorMetricStrip, EditorSection, EditorSettingGroup } from "../../primitives";
import type { ModuleSave } from "../types";

type SettingsSectionProps = {
  data: TavernRoomConfig;
  globalRuntimeModel: RuntimeModelOption | null;
  onSave: ModuleSave;
};

const directorScaleLabel = {
  focused: "聚焦",
  balanced: "均衡",
  ensemble: "群像",
} satisfies Record<TavernRoomSettings["directorNarrativeControl"]["responseScale"], string>;

const narratorPressureLabel = {
  low: "低",
  balanced: "均衡",
  high: "高",
} satisfies Record<TavernRoomSettings["directorNarrativeControl"]["narratorPressure"], string>;

const agencyModeLabel = {
  player_protagonist: "主角行动",
  story_directive: "剧情指令",
  scene_drive: "场景自推",
} satisfies Record<TavernRoomSettings["directorNarrativeControl"]["agencyMode"], string>;

const editorControlClassName = "w-full bg-background/80";

const clampInteger = (value: number, fallback: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return clamp(Math.round(value), min, max);
};

export const SettingsSection = ({ data, globalRuntimeModel, onSave }: SettingsSectionProps) => {
  const modelLabel = globalRuntimeModel
    ? `${globalRuntimeModel.provider.name} / ${globalRuntimeModel.modelName || globalRuntimeModel.modelId}`
    : "未选择";
  const saveSettings = (patch: Partial<TavernRoomSettings>) =>
    onSave({
      settings: {
        ...data.settings,
        ...patch,
      },
    });
  const saveNarrativeControl = (patch: Partial<TavernRoomSettings["directorNarrativeControl"]>) =>
    saveSettings({
      directorNarrativeControl: {
        ...data.settings.directorNarrativeControl,
        ...patch,
      },
    });
  const saveDirectorLoop = (patch: Partial<TavernRoomSettings["directorLoop"]>) =>
    saveSettings({
      directorLoop: {
        ...data.settings.directorLoop,
        ...patch,
      },
    });

  return (
    <EditorSection
      icon={Settings2}
      title="运行设置"
      description="调整用户控制权、导演调度规模和每回合回环轮次。候选回复作为通用辅助能力始终可用。"
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
            icon: Clapperboard,
            label: "导演回环",
            value: `${data.settings.directorLoop.maxRounds} 轮`,
          },
          {
            icon: Gauge,
            label: "控制权",
            value: agencyModeLabel[data.settings.directorNarrativeControl.agencyMode],
          },
          {
            icon: Eye,
            label: "沉浸描写",
            value: data.settings.immersiveDescriptionEnabled ? "开启" : "关闭",
          },
        ]}
      />

      <div className="rounded-lg border border-border/70 bg-background/72 px-3.5 py-3.5 shadow-xs">
        <EditorSettingGroup title="核心策略" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorField label="用户控制权" htmlFor="tavern-settings-agency-mode">
              <NativeSelect
                id="tavern-settings-agency-mode"
                value={data.settings.directorNarrativeControl.agencyMode}
                className={editorControlClassName}
                onChange={(event) =>
                  saveNarrativeControl({
                    agencyMode: event.target.value as TavernRoomSettings["directorNarrativeControl"]["agencyMode"],
                  })
                }
              >
                {Object.entries(agencyModeLabel).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </EditorField>

            <EditorField label="调度规模" htmlFor="tavern-settings-response-scale">
              <NativeSelect
                id="tavern-settings-response-scale"
                value={data.settings.directorNarrativeControl.responseScale}
                className={editorControlClassName}
                onChange={(event) =>
                  saveNarrativeControl({
                    responseScale: event.target
                      .value as TavernRoomSettings["directorNarrativeControl"]["responseScale"],
                  })
                }
              >
                {Object.entries(directorScaleLabel).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </EditorField>

            <EditorField label="导演人数" htmlFor="tavern-settings-max-speakers">
              <Input
                id="tavern-settings-max-speakers"
                type="number"
                min={1}
                max={6}
                value={data.settings.directorMaxSpeakers}
                className={editorControlClassName}
                onChange={(event) =>
                  saveSettings({
                    directorMaxSpeakers: clampInteger(
                      event.target.valueAsNumber,
                      data.settings.directorMaxSpeakers,
                      1,
                      6,
                    ),
                  })
                }
              />
            </EditorField>

            <EditorField label="每回合回环轮次" htmlFor="tavern-settings-director-loop-rounds">
              <Input
                id="tavern-settings-director-loop-rounds"
                type="number"
                min={1}
                max={5}
                value={data.settings.directorLoop.maxRounds}
                className={editorControlClassName}
                onChange={(event) =>
                  saveDirectorLoop({
                    maxRounds: clampInteger(event.target.valueAsNumber, data.settings.directorLoop.maxRounds, 1, 5),
                  })
                }
              />
            </EditorField>

            <EditorField label="旁白压力" htmlFor="tavern-settings-narrator-pressure">
              <NativeSelect
                id="tavern-settings-narrator-pressure"
                value={data.settings.directorNarrativeControl.narratorPressure}
                className={editorControlClassName}
                onChange={(event) =>
                  saveNarrativeControl({
                    narratorPressure: event.target
                      .value as TavernRoomSettings["directorNarrativeControl"]["narratorPressure"],
                  })
                }
              >
                {Object.entries(narratorPressureLabel).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </EditorField>

            <EditorField
              label="沉浸描写"
              htmlFor="tavern-settings-immersive-description"
              description="控制角色回复中的动作标注、内心和沉浸式排版。"
            >
              <div className="flex h-10 items-center rounded-md border border-input bg-background/80 px-3">
                <Switch
                  id="tavern-settings-immersive-description"
                  checked={data.settings.immersiveDescriptionEnabled}
                  onCheckedChange={(checked) =>
                    saveSettings({
                      immersiveDescriptionEnabled: checked === true,
                    })
                  }
                  aria-label="切换沉浸描写"
                />
              </div>
            </EditorField>
          </div>
        </EditorSettingGroup>
      </div>
    </EditorSection>
  );
};
