import { Switch } from "design-system/components/ui/switch";
import { Textarea } from "design-system/components/ui/textarea";
import {
  TAVERN_PRESENTATION_RULES,
  getTavernPresentationProfile,
  normalizeTavernPresentationProfileId,
} from "../../../presets/prompts/presentation-rules";
import {
  TAVERN_SYSTEM_NARRATIVE_STYLES,
  getTavernSystemNarrativeStyle,
  normalizeTavernSystemNarrativeStyleId,
} from "../../../presets/prompts/system-narrative-styles";
import {
  TAVERN_ROOM_STYLES,
  getTavernRoomStyle,
  normalizeTavernRoomStyleId,
} from "../../../presets/prompts/room-styles";
import { SettingsField, SettingsGroup, SettingsSelect } from "../../fields";
import type { ModuleEditProps } from "../types";
export const PromptSection = ({ data, onChange }: ModuleEditProps) => (
  <div className="space-y-[var(--tavern-section-gap,1.25rem)] [&>section+section]:border-t [&>section+section]:border-border/80 [&>section+section]:pt-[var(--tavern-section-padding,1.25rem)]">
    <SettingsGroup title="内容呈现">
      <div className="grid items-end gap-[var(--tavern-group-gap,1rem)] sm:grid-cols-2">
        <SettingsField
          label="呈现方式"
          htmlFor="tavern-presentation-profile"
          description={
            getTavernPresentationProfile(data.presentation.profileId).description
          }
        >
          <SettingsSelect
            id="tavern-presentation-profile"
            value={data.presentation.profileId}
            options={TAVERN_PRESENTATION_RULES}
            onChange={(value) =>
              onChange({
                presentation: {
                  ...data.presentation,
                  profileId: normalizeTavernPresentationProfileId(value),
                },
              })
            }
          />
        </SettingsField>
        <SettingsField
          label="动作与内心描写"
          htmlFor="tavern-presentation-immersive-description"
          description="在对话演绎中显示动作、内心与沉浸式排版。"
        >
          <div className="flex h-[var(--tavern-control-height,2.5rem)] items-center">
            <Switch
              id="tavern-presentation-immersive-description"
              checked={data.settings.immersiveDescriptionEnabled}
              onCheckedChange={(checked) =>
                onChange({
                  settings: {
                    ...data.settings,
                    immersiveDescriptionEnabled: checked === true,
                  },
                })
              }
            />
          </div>
        </SettingsField>
      </div>
    </SettingsGroup>
    <SettingsGroup title="叙事与文风">
      <div className="grid items-end gap-[var(--tavern-group-gap,1rem)] sm:grid-cols-2">
        <SettingsField
          label="叙事策略"
          htmlFor="tavern-system-narrative"
          description={
            getTavernSystemNarrativeStyle(data.systemNarrative.styleId)
              .description
          }
        >
          <SettingsSelect
            id="tavern-system-narrative"
            value={data.systemNarrative.styleId}
            options={TAVERN_SYSTEM_NARRATIVE_STYLES}
            onChange={(value) =>
              onChange({
                systemNarrative: {
                  ...data.systemNarrative,
                  styleId: normalizeTavernSystemNarrativeStyleId(value),
                },
              })
            }
          />
        </SettingsField>
        <SettingsField
          label="房间文风"
          htmlFor="tavern-room-style"
          description={getTavernRoomStyle(data.roomStyleId).description}
        >
          <SettingsSelect
            id="tavern-room-style"
            value={data.roomStyleId}
            options={TAVERN_ROOM_STYLES}
            onChange={(value) =>
              onChange({ roomStyleId: normalizeTavernRoomStyleId(value) })
            }
          />
        </SettingsField>
      </div>
      <SettingsField
        label="补充叙事要求（可选）"
        htmlFor="tavern-system-narrative-custom"
      >
        <Textarea
          id="tavern-system-narrative-custom"
          value={data.systemNarrative.customInstructions ?? ""}
          className="min-h-[var(--tavern-textarea-height,7rem)] resize-y bg-card"
          placeholder="例如：减少旁白，保留角色的行动与选择空间。"
          onChange={(event) =>
            onChange({
              systemNarrative: {
                ...data.systemNarrative,
                customInstructions: event.target.value,
              },
            })
          }
        />
      </SettingsField>
    </SettingsGroup>
  </div>
);
