import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Input } from "design-system/components/ui/input";
import { cn } from "design-system/lib/utils";
import {
  TAVERN_SCENE_PRESET_OPTIONS,
  getVisualPreset,
} from "../../../presets/visual-presets";
import {
  TAVERN_PRESENTATION_RULES,
  normalizeTavernPresentationProfileId,
} from "../../../presets/prompts/presentation-rules";
import {
  TAVERN_ROOM_STYLES,
  normalizeTavernRoomStyleId,
} from "../../../presets/prompts/room-styles";
import { SettingsGroup, SettingsSelect } from "../../fields";
import type { ModuleEditProps } from "../types";
export const BasicSection = ({ data, onChange }: ModuleEditProps) => {
  const [showAllScenes, setShowAllScenes] = useState(false);
  const firstScenes = TAVERN_SCENE_PRESET_OPTIONS.slice(0, 3);
  const selectedScene = getVisualPreset(data.scenePresetId);
  const compactScenes = firstScenes.some(
    (scene) => scene.id === selectedScene.id,
  )
    ? firstScenes
    : [firstScenes[0], firstScenes[1], selectedScene];
  const scenes = showAllScenes ? TAVERN_SCENE_PRESET_OPTIONS : compactScenes;
  return (
    <div className="space-y-5 [&>section+section]:border-t [&>section+section]:border-border/80 [&>section+section]:pt-5">
      <SettingsGroup title="房间信息">
        <div className="grid items-center gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
          <label
            htmlFor="tavern-basic-title"
            className="text-sm text-muted-foreground"
          >
            酒馆名称
          </label>
          <Input
            id="tavern-basic-title"
            value={data.title}
            className="h-10 bg-card"
            placeholder="为酒馆起一个名字"
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
      </SettingsGroup>
      <SettingsGroup
        title="视觉场景"
        action={
          <button
            type="button"
            aria-expanded={showAllScenes}
            aria-controls="tavern-scene-options"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => setShowAllScenes((current) => !current)}
          >
            {showAllScenes
              ? "收起场景"
              : `查看全部 ${TAVERN_SCENE_PRESET_OPTIONS.length} 个`}
            {showAllScenes ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        }
      >
        <div
          id="tavern-scene-options"
          role="radiogroup"
          aria-label="视觉场景"
          className="grid grid-cols-3 gap-3"
        >
          {scenes.map((scene) => (
            <label key={scene.id} className="relative min-w-0 cursor-pointer">
              <input
                type="radio"
                name="tavern-scene"
                value={scene.id}
                checked={data.scenePresetId === scene.id}
                onChange={() => onChange({ scenePresetId: scene.id })}
                className="peer sr-only"
                aria-label={scene.label}
              />
              <span
                className={cn(
                  "block h-full rounded-lg p-1.5 ring-1 ring-transparent transition-colors hover:bg-muted/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  data.scenePresetId === scene.id &&
                    "bg-primary/[0.03] ring-2 ring-primary",
                )}
              >
                <span className="relative block aspect-[1.55] overflow-hidden rounded-md">
                  <img
                    src={scene.tavern.backgroundImage}
                    alt=""
                    className="size-full object-cover"
                  />
                  {data.scenePresetId === scene.id && (
                    <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-sm font-medium">
                  {scene.label}
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {scene.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </SettingsGroup>
      <SettingsGroup title="互动与呈现">
        <div className="grid items-center gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
          <span className="text-sm text-muted-foreground">发言模式</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-10 min-w-32 flex-1 items-center rounded-lg bg-muted/60 px-3 text-sm text-muted-foreground">
              导演调度
            </span>
            <span className="text-xs leading-5 text-muted-foreground">
              由导演安排角色发言。
            </span>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid items-center gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-3">
            <label
              htmlFor="tavern-basic-presentation"
              className="text-sm text-muted-foreground"
            >
              呈现规则
            </label>
            <SettingsSelect
              id="tavern-basic-presentation"
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
          </div>
          <div className="grid items-center gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-3">
            <label
              htmlFor="tavern-basic-room-style"
              className="text-sm text-muted-foreground"
            >
              房间文风
            </label>
            <SettingsSelect
              id="tavern-basic-room-style"
              value={data.roomStyleId}
              options={TAVERN_ROOM_STYLES}
              onChange={(value) =>
                onChange({ roomStyleId: normalizeTavernRoomStyleId(value) })
              }
            />
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};
