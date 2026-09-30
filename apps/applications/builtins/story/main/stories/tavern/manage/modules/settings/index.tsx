import { clamp } from "lodash-es";
import { Input } from "design-system/components/ui/input";
import { Switch } from "design-system/components/ui/switch";
import { SettingsField, SettingsGroup, SettingsSelect } from "../../fields";
import type { TavernRoomSettings } from "../../model";
import type { ModuleEditProps } from "../types";
const agencyModes = [
  { id: "player_protagonist", label: "主角行动" },
  { id: "story_directive", label: "剧情指令" },
  { id: "scene_drive", label: "场景自推" },
];
const scales = [
  { id: "focused", label: "聚焦" },
  { id: "balanced", label: "均衡" },
  { id: "ensemble", label: "群像" },
];
const pressures = [
  { id: "low", label: "低" },
  { id: "balanced", label: "均衡" },
  { id: "high", label: "高" },
];
const clampInteger = (
  value: number,
  fallback: number,
  min: number,
  max: number,
) => (Number.isFinite(value) ? clamp(Math.round(value), min, max) : fallback);
export const SettingsSection = ({ data, onChange }: ModuleEditProps) => {
  const changeSettings = (patch: Partial<TavernRoomSettings>) =>
    onChange({ settings: { ...data.settings, ...patch } });
  const changeNarrative = (
    patch: Partial<TavernRoomSettings["directorNarrativeControl"]>,
  ) =>
    changeSettings({
      directorNarrativeControl: {
        ...data.settings.directorNarrativeControl,
        ...patch,
      },
    });
  return (
    <div className="space-y-5 [&>section+section]:border-t [&>section+section]:border-border/80 [&>section+section]:pt-5">
      <SettingsGroup title="导演调度">
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField
            label="用户控制权"
            htmlFor="tavern-settings-agency-mode"
          >
            <SettingsSelect
              id="tavern-settings-agency-mode"
              value={data.settings.directorNarrativeControl.agencyMode}
              options={agencyModes}
              onChange={(value) =>
                changeNarrative({
                  agencyMode:
                    value as TavernRoomSettings["directorNarrativeControl"]["agencyMode"],
                })
              }
            />
          </SettingsField>
          <SettingsField
            label="调度规模"
            htmlFor="tavern-settings-response-scale"
          >
            <SettingsSelect
              id="tavern-settings-response-scale"
              value={data.settings.directorNarrativeControl.responseScale}
              options={scales}
              onChange={(value) =>
                changeNarrative({
                  responseScale:
                    value as TavernRoomSettings["directorNarrativeControl"]["responseScale"],
                })
              }
            />
          </SettingsField>
          <SettingsField
            label="导演人数"
            htmlFor="tavern-settings-max-speakers"
            description="每轮安排 1–6 名角色发言。"
          >
            <Input
              id="tavern-settings-max-speakers"
              type="number"
              min={1}
              max={6}
              step={1}
              value={data.settings.directorMaxSpeakers}
              className="h-10 bg-card"
              onChange={(event) =>
                changeSettings({
                  directorMaxSpeakers: clampInteger(
                    event.target.valueAsNumber,
                    data.settings.directorMaxSpeakers,
                    1,
                    6,
                  ),
                })
              }
            />
          </SettingsField>
          <SettingsField
            label="每回合回环轮次"
            htmlFor="tavern-settings-director-loop-rounds"
            description="每回合运行 1–5 轮导演调度。"
          >
            <Input
              id="tavern-settings-director-loop-rounds"
              type="number"
              min={1}
              max={5}
              step={1}
              value={data.settings.directorLoop.maxRounds}
              className="h-10 bg-card"
              onChange={(event) =>
                changeSettings({
                  directorLoop: {
                    ...data.settings.directorLoop,
                    maxRounds: clampInteger(
                      event.target.valueAsNumber,
                      data.settings.directorLoop.maxRounds,
                      1,
                      5,
                    ),
                  },
                })
              }
            />
          </SettingsField>
          <SettingsField
            label="旁白压力"
            htmlFor="tavern-settings-narrator-pressure"
          >
            <SettingsSelect
              id="tavern-settings-narrator-pressure"
              value={data.settings.directorNarrativeControl.narratorPressure}
              options={pressures}
              onChange={(value) =>
                changeNarrative({
                  narratorPressure:
                    value as TavernRoomSettings["directorNarrativeControl"]["narratorPressure"],
                })
              }
            />
          </SettingsField>
        </div>
      </SettingsGroup>
      <SettingsGroup title="沉浸描写">
        <div className="flex items-start justify-between gap-4">
          <label
            htmlFor="tavern-settings-immersive-description"
            className="space-y-1"
          >
            <span className="block text-sm font-medium">动作与内心描写</span>
            <span className="block text-xs leading-5 text-muted-foreground">
              在角色回复中呈现动作、内心和沉浸式排版。
            </span>
          </label>
          <Switch
            id="tavern-settings-immersive-description"
            checked={data.settings.immersiveDescriptionEnabled}
            onCheckedChange={(checked) =>
              changeSettings({ immersiveDescriptionEnabled: checked === true })
            }
          />
        </div>
      </SettingsGroup>
    </div>
  );
};
