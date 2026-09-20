import { Eye, MessageSquareText, Palette, Pencil, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import { useRef } from "react";
import { Button } from "design-system/components/ui/button";
import type { TavernRoomConfig } from "@/stories/tavern/manage/model";
import { getTavernPresentationProfile } from "../../../presets/prompts/presentation-rules";
import { getTavernSystemNarrativeStyle } from "../../../presets/prompts/system-narrative-styles";
import { getTavernRoomStyle } from "../../../presets/prompts/room-styles";
import {
  EditorMetricStrip,
  EditorSection,
  EditorStatusPill,
  editorHeaderActionButtonClassName,
} from "../../primitives";
import { PromptEdit, type PromptEditHandle } from "./edit";
import type { ModuleSave } from "../types";

type PromptSectionProps = {
  data: TavernRoomConfig;
  onSave: ModuleSave;
};

const getPresentationContractLabel = (room: TavernRoomConfig) =>
  getTavernPresentationProfile(room.presentation.profileId).generationContract === "character_narrative_beat"
    ? "小说段落"
    : "角色回复";

export const PromptSummaryContent = ({ data }: { data: TavernRoomConfig }) => {
  const presentation = getTavernPresentationProfile(data.presentation.profileId);
  const systemNarrative = getTavernSystemNarrativeStyle(data.systemNarrative.styleId);
  const roomStyle = getTavernRoomStyle(data.roomStyleId);
  const customInstructions = data.systemNarrative.customInstructions?.trim() ?? "";

  return (
    <div className="space-y-3">
      <EditorMetricStrip
        items={[
          {
            icon: MessageSquareText,
            label: "呈现规则",
            value: presentation.label,
          },
          {
            icon: Sparkles,
            label: "系统叙事",
            value: systemNarrative.label,
          },
          {
            icon: Palette,
            label: "房间文风",
            value: roomStyle.label,
          },
          {
            icon: ShieldCheck,
            label: "输出合同",
            value: getPresentationContractLabel(data),
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="app-panel overflow-hidden rounded-xl">
          <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-[2rem_8rem_minmax(0,1fr)_auto] sm:items-center">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/8 text-primary ring-1 ring-primary/10">
              <MessageSquareText className="size-4" />
            </span>
            <div className="text-sm font-semibold">呈现规则</div>
            <div className="text-xs leading-5 text-muted-foreground">{presentation.description}</div>
            <EditorStatusPill tone="info">{presentation.label}</EditorStatusPill>
          </div>
          <div className="grid gap-3 border-t border-border/60 px-3.5 py-3 sm:grid-cols-[2rem_8rem_minmax(0,1fr)_auto] sm:items-center">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/8 text-primary ring-1 ring-primary/10">
              <Palette className="size-4" />
            </span>
            <div className="text-sm font-semibold">房间文风</div>
            <div className="text-xs leading-5 text-muted-foreground">{roomStyle.description}</div>
            <EditorStatusPill tone="active">{roomStyle.label}</EditorStatusPill>
          </div>
          <div className="grid gap-3 border-t border-border/60 px-3.5 py-3 sm:grid-cols-[2rem_8rem_minmax(0,1fr)_auto] sm:items-center">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/8 text-primary ring-1 ring-primary/10">
              <Sparkles className="size-4" />
            </span>
            <div className="text-sm font-semibold">系统叙事</div>
            <div className="text-xs leading-5 text-muted-foreground">{systemNarrative.description}</div>
            <EditorStatusPill tone="active">{systemNarrative.label}</EditorStatusPill>
          </div>
          <div className="grid gap-3 border-t border-border/60 px-3.5 py-3 sm:grid-cols-[2rem_8rem_minmax(0,1fr)_auto] sm:items-center">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/8 text-primary ring-1 ring-primary/10">
              <ShieldCheck className="size-4" />
            </span>
            <div className="text-sm font-semibold">系统协议</div>
            <div className="text-xs leading-5 text-muted-foreground">
              输出标签、角色边界和上下文资料由系统自动维护。
            </div>
            <EditorStatusPill tone="muted">固定</EditorStatusPill>
          </div>
        </div>

        <aside className="app-panel rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold leading-5">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Eye className="size-3.5" />
            </span>
            当前效果
          </div>
          <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
            <p>{presentation.description}</p>
            <p>{systemNarrative.description}</p>
            <p>{roomStyle.description}</p>
            {customInstructions ? (
              <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-foreground/80">{customInstructions}</div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
};

export const PromptSection = ({ data, onSave }: PromptSectionProps) => {
  const editRef = useRef<PromptEditHandle>(null);
  const presentation = getTavernPresentationProfile(data.presentation.profileId);
  const systemNarrative = getTavernSystemNarrativeStyle(data.systemNarrative.styleId);
  const roomStyle = getTavernRoomStyle(data.roomStyleId);

  return (
    <>
      <EditorSection
        icon={ScrollText}
        title="呈现与叙事"
        description="管理房间的呈现规则、系统叙事和文风模式。"
        meta={`${presentation.label} / ${systemNarrative.label} / ${roomStyle.label}`}
        metaClassName="border border-primary/15 bg-primary/10 text-primary dark:border-primary/20 dark:bg-primary/15"
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
        contentClassName="p-4"
      >
        <PromptSummaryContent data={data} />
      </EditorSection>

      <PromptEdit bind={editRef} data={data} onSave={onSave} />
    </>
  );
};
