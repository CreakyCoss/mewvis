import { Sparkles } from "lucide-react";
import { useTavernPageContext } from "@/features/pages/taverns/components/context";
import { EmptyPanelCard } from "./shared";

export const IllustrationHintsPreviewSection = () => {
  const { activeRoom } = useTavernPageContext();

  if (!activeRoom) {
    return null;
  }

  const recentIllustrationHints = activeRoom.illustrationHints.slice(-4).reverse();
  const shouldShowIllustrationHints =
    activeRoom.settings.illustrationHints.enabled || recentIllustrationHints.length > 0;

  if (!shouldShowIllustrationHints) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="size-4 text-primary" />
          插图提示
        </div>
        <span className="rounded-md border border-current/10 bg-current/5 px-2 py-0.5 text-[11px] text-current opacity-70">
          {activeRoom.settings.illustrationHints.enabled ? "开启" : "已关闭"}
        </span>
      </div>
      <div className="space-y-2">
        {recentIllustrationHints.length > 0 ? (
          recentIllustrationHints.map((hint) => (
            <div
              key={hint.id}
              className="rounded-lg border border-current/10 bg-current/[0.045] dark:bg-current/[0.065] px-3 py-2.5 text-[11px] leading-4 text-current shadow-sm"
            >
              {hint.prompt}
            </div>
          ))
        ) : (
          <EmptyPanelCard>本场景还没有生成插图提示。</EmptyPanelCard>
        )}
      </div>
    </section>
  );
};
