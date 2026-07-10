import { MessageSquareText, Palette, Save, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  TavernPresentationProfileId,
  TavernRoomStyleId,
  TavernRoomConfig,
  TavernSystemNarrativeStyleId,
} from "@/features/pages/stories/tavern/manage/model";
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
import {
  EditorField,
  EditorFormCard,
  EditorFormDialogContent,
  EditorFormFooter,
  EditorFormHeader,
  EditorFormLayout,
  EditorFormNav,
  EditorFormSidebarCard,
  EditorFormSidebarPanel,
  EditorStatusPill,
} from "../../primitives";
import { editorControlClassName, emptyValueText } from "../../utils";
import type { ModuleSave } from "../types";

export type PromptEditHandle = (data?: TavernRoomConfig) => void;

type PromptDraft = {
  presentationProfileId: TavernPresentationProfileId;
  systemNarrativeStyleId: TavernSystemNarrativeStyleId;
  roomStyleId: TavernRoomStyleId;
  customInstructions: string;
};

type PromptEditProps = {
  bind: Ref<PromptEditHandle>;
  data: TavernRoomConfig;
  onSave: ModuleSave;
};

const selectClassName = cn(editorControlClassName, "min-h-9");

const getGenerationContractLabel = (profileId: TavernPresentationProfileId) =>
  getTavernPresentationProfile(profileId).generationContract === "character_narrative_beat"
    ? "小说段落合同"
    : "角色回复合同";

export const PromptEdit = ({ bind, data, onSave }: PromptEditProps) => {
  const [draft, setDraft] = useState<PromptDraft | null>(null);

  const open = (nextData = data) => {
    setDraft({
      presentationProfileId: normalizeTavernPresentationProfileId(nextData.presentation.profileId),
      systemNarrativeStyleId: normalizeTavernSystemNarrativeStyleId(nextData.systemNarrative.styleId),
      roomStyleId: normalizeTavernRoomStyleId(nextData.roomStyleId),
      customInstructions: nextData.systemNarrative.customInstructions ?? "",
    });
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
  };

  const save = () => {
    if (!draft) {
      return;
    }

    onSave({
      presentation: {
        profileId: draft.presentationProfileId,
      },
      systemNarrative: {
        styleId: draft.systemNarrativeStyleId,
        customInstructions: draft.customInstructions.trim(),
      },
      roomStyleId: draft.roomStyleId,
    });
    close();
  };

  const presentation = draft ? getTavernPresentationProfile(draft.presentationProfileId) : null;
  const systemNarrative = draft ? getTavernSystemNarrativeStyle(draft.systemNarrativeStyleId) : null;
  const roomStyle = draft ? getTavernRoomStyle(draft.roomStyleId) : null;

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {draft ? (
        <EditorFormDialogContent className="sm:max-w-5xl">
          <EditorFormHeader
            icon={ScrollText}
            title="编辑呈现与叙事"
            description="选择房间的呈现规则、系统叙事和文风模式。"
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <EditorFormLayout
              sidebar={
                <>
                  <EditorFormSidebarCard
                    icon={ScrollText}
                    title={data.title.trim() || emptyValueText}
                    meta={
                      <>
                        <EditorStatusPill tone="info">{presentation?.label ?? emptyValueText}</EditorStatusPill>
                        <EditorStatusPill tone="active">{systemNarrative?.label ?? emptyValueText}</EditorStatusPill>
                        <EditorStatusPill tone="active">{roomStyle?.label ?? emptyValueText}</EditorStatusPill>
                      </>
                    }
                  >
                    <p className="text-xs leading-5 text-muted-foreground">
                      {presentation?.description ?? "选择一个呈现规则。"}
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="系统控制层">
                    <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                      <div className="flex items-center gap-2 text-sm font-medium leading-5 text-foreground">
                        <ShieldCheck className="size-4 text-primary" />
                        <span>{getGenerationContractLabel(draft.presentationProfileId)}</span>
                      </div>
                      <p>输出协议、可见性边界和解析标签由系统固定维护。</p>
                    </div>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-presentation-section", icon: MessageSquareText, label: "呈现规则" },
                      { href: "#tavern-narrative-section", icon: Sparkles, label: "系统叙事" },
                      { href: "#tavern-room-style-section", icon: Palette, label: "房间文风" },
                    ]}
                  />
                </>
              }
            >
              <EditorFormCard
                id="tavern-presentation-section"
                icon={MessageSquareText}
                title="呈现规则"
                description="决定用户输入语义、公开输出形态和页面渲染方式。"
              >
                <EditorField
                  label="呈现方式"
                  htmlFor="tavern-presentation-profile"
                  description={presentation?.description}
                >
                  <NativeSelect
                    id="tavern-presentation-profile"
                    value={draft.presentationProfileId}
                    className={selectClassName}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        presentationProfileId: normalizeTavernPresentationProfileId(event.target.value),
                      })
                    }
                  >
                    {TAVERN_PRESENTATION_RULES.map((rule) => (
                      <NativeSelectOption key={rule.id} value={rule.id}>
                        {rule.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </EditorField>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-narrative-section"
                icon={Sparkles}
                title="系统叙事"
                description="控制导演推进和角色正文的基础叙事约束。"
              >
                <div className="grid gap-4">
                  <EditorField
                    label="叙事风格"
                    htmlFor="tavern-system-narrative"
                    description={systemNarrative?.description}
                  >
                    <NativeSelect
                      id="tavern-system-narrative"
                      value={draft.systemNarrativeStyleId}
                      className={selectClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          systemNarrativeStyleId: normalizeTavernSystemNarrativeStyleId(event.target.value),
                        })
                      }
                    >
                      {TAVERN_SYSTEM_NARRATIVE_STYLES.map((style) => (
                        <NativeSelectOption key={style.id} value={style.id}>
                          {style.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                  <EditorField
                    label="自定义叙事要求"
                    htmlFor="tavern-system-narrative-custom"
                    description="可选；补充当前房间特有的叙事边界。"
                  >
                    <Textarea
                      id="tavern-system-narrative-custom"
                      value={draft.customInstructions}
                      className="min-h-28 resize-y"
                      placeholder="例如：保持克制，不替玩家角色做关键决定。"
                      onChange={(event) => setDraft({ ...draft, customInstructions: event.target.value })}
                    />
                  </EditorField>
                </div>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-room-style-section"
                icon={Palette}
                title="房间文风"
                description="为导演调度和角色输出补充题材与语言质感。"
              >
                <EditorField label="文风模式" htmlFor="tavern-room-style" description={roomStyle?.description}>
                  <NativeSelect
                    id="tavern-room-style"
                    value={draft.roomStyleId}
                    className={selectClassName}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        roomStyleId: normalizeTavernRoomStyleId(event.target.value),
                      })
                    }
                  >
                    {TAVERN_ROOM_STYLES.map((style) => (
                      <NativeSelectOption key={style.id} value={style.id}>
                        {style.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </EditorField>
              </EditorFormCard>
            </EditorFormLayout>

            <EditorFormFooter>
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                保存
              </Button>
            </EditorFormFooter>
          </form>
        </EditorFormDialogContent>
      ) : null}
    </Dialog>
  );
};
