import { Wine } from "lucide-react";
import previewAvatar from "@/assets/avatars/portraits/wuxia/wuxia-03.jpg";
import { cn } from "design-system/lib/utils";
import { getVisualPreset } from "../presets/visual-presets";
import { getTavernPresentationProfile } from "../presets/prompts/presentation-rules";
import { getTavernRoomStyle } from "../presets/prompts/room-styles";
import { getTavernSystemNarrativeStyle } from "../presets/prompts/system-narrative-styles";
import type { TavernRoomConfig } from "./model";
import { getTavernPreviewContent } from "./preview-content";
export const TavernSettingsPreview = ({ data }: { data: TavernRoomConfig }) => {
  const scene = getVisualPreset(data.scenePresetId);
  const presentation = getTavernPresentationProfile(
    data.presentation.profileId,
  );
  const roomStyle = getTavernRoomStyle(data.roomStyleId);
  const narrativeStyle = getTavernSystemNarrativeStyle(
    data.systemNarrative.styleId,
  );
  const content = getTavernPreviewContent({
    roomStyleId: roomStyle.id,
    narrativeStyleId: narrativeStyle.id,
    presentationProfileId: presentation.id,
  });
  const hasCustomInstructions = Boolean(
    data.systemNarrative.customInstructions?.trim(),
  );
  return (
    <aside
      aria-label="酒馆示例预览"
      className="flex min-h-[420px] flex-col gap-[var(--tavern-group-gap,1rem)] border-t pt-6 lg:sticky lg:top-[var(--tavern-content-padding-y,1.5rem)] lg:h-[var(--tavern-preview-height,510px)] lg:min-h-0 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-[var(--tavern-content-padding,1.5rem)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold leading-6">示例预览</h3>
        <p className="text-xs leading-5 text-muted-foreground">
          {hasCustomInstructions
            ? "预设示例；补充要求在实际演绎中生效。"
            : "示例内容，随叙事策略与文风切换。"}
        </p>
      </div>
      <div
        className={cn(
          "relative flex min-h-72 flex-1 flex-col overflow-hidden rounded-lg",
          scene.tavern.page,
        )}
      >
        <img
          src={scene.tavern.backgroundImage}
          alt={`${scene.label}场景示例`}
          className="absolute inset-0 size-full object-cover object-left"
        />
        <span className="relative m-4 self-start rounded-lg bg-slate-800/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
          {data.title.trim() || "未命名酒馆"}
        </span>
        <div className="relative flex flex-1 flex-col justify-center gap-5 px-5 pb-12">
          {presentation.renderStyle === "chat" ? (
            <>
              <p className="self-center rounded-md bg-white/65 px-3 py-1.5 text-sm text-slate-700 backdrop-blur-sm">
                {content.narrator}
              </p>
              <div className="flex items-start gap-3">
                <img
                  src={previewAvatar}
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover ring-2 ring-white/70"
                />
                <div className="min-w-0 space-y-2">
                  <p className="w-fit rounded bg-white/70 px-1.5 text-xs font-medium text-slate-800">
                    沈砚
                  </p>
                  <div
                    className={cn(
                      "border px-4 py-3 text-sm leading-6",
                      scene.tavern.characterBubble,
                    )}
                  >
                    {data.settings.immersiveDescriptionEnabled && (
                      <p className="mb-1 text-xs italic opacity-70">
                        {content.action}
                      </p>
                    )}
                    <p>“{content.dialogue}”</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-white/85 p-5 font-serif text-sm leading-7 text-slate-800 backdrop-blur-sm">
              {content.paragraphs.map((paragraph, index) => (
                <p key={index} className={index > 0 ? "mt-3" : undefined}>
                  {paragraph}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="flex items-center gap-2 rounded-full bg-primary/[0.06] px-4 py-2.5 text-xs leading-5 text-muted-foreground">
        <Wine className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {presentation.label} · {narrativeStyle.label} / {roomStyle.label}
        </span>
      </p>
    </aside>
  );
};
