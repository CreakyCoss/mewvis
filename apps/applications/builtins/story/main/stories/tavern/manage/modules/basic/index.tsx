import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Input } from "design-system/components/ui/input";
import { cn } from "design-system/lib/utils";
import {
  TAVERN_SCENE_PRESET_OPTIONS,
  getVisualPreset,
} from "../../../presets/visual-presets";
import { SettingsGroup } from "../../fields";
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
    <div className="space-y-[var(--tavern-section-gap,1.25rem)] [&>section+section]:border-t [&>section+section]:border-border/80 [&>section+section]:pt-[var(--tavern-section-padding,1.25rem)]">
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
            className="h-[var(--tavern-control-height,2.5rem)] bg-card"
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
                <span className="relative block aspect-[var(--tavern-scene-aspect,1.55)] overflow-hidden rounded-md">
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
                <span className="mt-[var(--tavern-scene-title-gap,0.5rem)] block text-sm font-medium">
                  {scene.label}
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-[var(--tavern-scene-description-leading,1.25rem)] text-muted-foreground">
                  {scene.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </SettingsGroup>
    </div>
  );
};
