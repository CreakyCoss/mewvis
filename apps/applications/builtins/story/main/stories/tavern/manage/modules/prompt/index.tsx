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
    <SettingsGroup title="呈现规则">
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
    </SettingsGroup>
    <SettingsGroup title="叙事与文风">
      <div className="grid gap-[var(--tavern-group-gap,1rem)] sm:grid-cols-2">
        <SettingsField
          label="系统叙事"
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
    </SettingsGroup>
    <SettingsGroup
      title="补充叙事要求"
      description="可选；补充这个酒馆的叙事偏好与边界。"
    >
      <Textarea
        id="tavern-system-narrative-custom"
        aria-label="补充叙事要求"
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
    </SettingsGroup>
  </div>
);
