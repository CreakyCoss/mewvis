import { Wine } from "lucide-react";
import previewAvatar from "@/assets/avatars/portraits/wuxia/wuxia-03.jpg";
import { cn } from "design-system/lib/utils";
import { getVisualPreset } from "../presets/visual-presets";
import { getTavernPresentationProfile } from "../presets/prompts/presentation-rules";
import { getTavernRoomStyle } from "../presets/prompts/room-styles";
import type { TavernRoomConfig } from "./model";
export const TavernSettingsPreview = ({ data }: { data: TavernRoomConfig }) => {
  const scene = getVisualPreset(data.scenePresetId);
  const presentation = getTavernPresentationProfile(
    data.presentation.profileId,
  );
  const roomStyle = getTavernRoomStyle(data.roomStyleId);
  return (
    <aside
      aria-label="酒馆示例预览"
      className="flex min-h-[420px] flex-col gap-4 border-t pt-6 lg:sticky lg:top-6 lg:h-[510px] lg:min-h-0 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold leading-6">示例预览</h3>
        <p className="text-xs leading-5 text-muted-foreground">
          示例内容，用于查看视觉与呈现效果。
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
                雨声落在窗沿。
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
                        他放下手中的书，抬眼望来。
                      </p>
                    )}
                    <p>“进来吧，外面雨大。”</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-white/85 p-5 font-serif text-sm leading-7 text-slate-800 backdrop-blur-sm">
              <p>雨声落在窗沿。沈砚放下手中的书，抬眼望向门口。</p>
              {data.presentation.profileId === "third-person-prose" ? (
                <p className="mt-3">
                  他示意来人进屋避雨，把靠近炉火的位置留了出来。
                </p>
              ) : (
                <p className="mt-3">
                  “进来吧，外面雨大。”他把靠近炉火的位置留了出来。
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="flex items-center gap-2 rounded-full bg-primary/[0.06] px-4 py-2.5 text-xs leading-5 text-muted-foreground">
        <Wine className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          导演调度 · {presentation.label} / {roomStyle.label}
        </span>
      </p>
    </aside>
  );
};
