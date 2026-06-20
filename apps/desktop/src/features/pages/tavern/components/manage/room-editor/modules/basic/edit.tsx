import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import {
  BookOpenText,
  Goal,
  MessageSquareText,
  UserRound,
  Wine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TAVERN_SCENE_PRESET_OPTIONS } from "@/features/pages/tavern/visual-presets";
import { cn } from "@/lib/utils";
import {
  TAVERN_PROMPT_STYLE_PRESETS,
  normalizeTavernPromptStyleId,
} from "../../../../../prompt-styles";
import type {
  TavernReplyMode,
  TavernRoom,
} from "../../../../../types";
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
import {
  editorControlClassName,
  emptyValueText,
  replyModeOptions,
} from "../../utils";
import type { ModuleEditProps } from "../types";

export type BasicEditHandle = (data?: TavernRoom) => void;

type BasicDraft = {
  title: string;
  storyOutline: string;
  storyGoal: string;
  scenePresetId: TavernRoom["scenePresetId"];
  promptStyleId: TavernRoom["promptStyleId"];
  replyMode: TavernReplyMode;
  userPersonaName: string;
};

type BasicEditProps = ModuleEditProps & {
  bind: Ref<BasicEditHandle>;
};

export const BasicEdit = ({
  bind,
  data,
  onSave,
  renderTextFieldAgentActions,
}: BasicEditProps) => {
  const [draft, setDraft] = useState<BasicDraft | null>(null);
  const [error, setError] = useState("");

  const open = (nextData = data) => {
    setError("");
    setDraft({
      title: nextData.title,
      storyOutline: nextData.storyOutline,
      storyGoal: nextData.storyGoal,
      scenePresetId: nextData.scenePresetId,
      promptStyleId: normalizeTavernPromptStyleId(nextData.promptStyleId),
      replyMode: nextData.replyMode ?? "active",
      userPersonaName: nextData.userPersonaName,
    });
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
    setError("");
  };

  const save = () => {
    if (!draft) {
      return;
    }

    onSave({
      title: draft.title,
      storyOutline: draft.storyOutline,
      storyGoal: draft.storyGoal,
      scenePresetId: draft.scenePresetId,
      scenes: data.scenes?.map((scene) =>
        scene.scenePresetId === draft.scenePresetId
          ? scene
          : {
              ...scene,
              scenePresetId: draft.scenePresetId,
            }
      ),
      promptStyleId: normalizeTavernPromptStyleId(draft.promptStyleId),
      replyMode: draft.replyMode,
      userPersonaName: draft.userPersonaName,
    });
    close();
  };

  return (
    <Dialog
      open={Boolean(draft)}
      onOpenChange={(openState) => {
        if (!openState) {
          close();
        }
      }}
    >
      {draft && (
        <EditorFormDialogContent className="sm:max-w-5xl">
          <EditorFormHeader
            icon={Wine}
            title="编辑基础信息"
            description="修改房间名称、大故事总纲、发言模式和你的称呼。"
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <EditorFormLayout
              sidebar={(
                <>
                  <EditorFormSidebarCard
                    icon={Wine}
                    title={draft.title.trim() || emptyValueText}
                    meta={(
                      <>
                        <EditorStatusPill tone="active">
                          {TAVERN_PROMPT_STYLE_PRESETS.find((preset) =>
                            preset.id === normalizeTavernPromptStyleId(draft.promptStyleId)
                          )?.label ?? "默认风格"}
                        </EditorStatusPill>
                        <EditorStatusPill>
                          {replyModeOptions.find((option) => option.value === draft.replyMode)?.label ?? "发言模式"}
                        </EditorStatusPill>
                        <EditorStatusPill tone="info">
                          {TAVERN_SCENE_PRESET_OPTIONS.find((preset) => preset.id === draft.scenePresetId)?.label ?? "场景"}
                        </EditorStatusPill>
                      </>
                    )}
                  >
                    <p className="line-clamp-4 text-xs leading-5 text-muted-foreground">
                      {draft.storyOutline.trim() || "还没有填写大故事总纲。"}
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="当前称呼">
                    <div className="truncate text-sm font-medium leading-5">
                      {draft.userPersonaName.trim() || emptyValueText}
                    </div>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-basic-info-section", icon: Wine, label: "基础配置" },
                      { href: "#tavern-basic-mode-section", icon: MessageSquareText, label: "互动方式" },
                      { href: "#tavern-basic-story-section", icon: BookOpenText, label: "故事设定" },
                    ]}
                  />
                </>
              )}
            >
              <EditorFormCard
                id="tavern-basic-info-section"
                icon={Wine}
                title="基础配置"
                description="定义酒馆名称、场景主题和用户在故事中的称呼。"
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <EditorField label="房间名称" htmlFor="tavern-basic-title">
                    <Input
                      id="tavern-basic-title"
                      value={draft.title}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        title: event.target.value,
                      })}
                    />
                  </EditorField>

                  <EditorField label="你的称呼" htmlFor="tavern-basic-user-persona">
                    <Input
                      id="tavern-basic-user-persona"
                      value={draft.userPersonaName}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        userPersonaName: event.target.value,
                      })}
                    />
                  </EditorField>

                  <EditorField label="场景设置" htmlFor="tavern-basic-scene-preset">
                    <NativeSelect
                      id="tavern-basic-scene-preset"
                      value={draft.scenePresetId}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        scenePresetId: event.target.value as TavernRoom["scenePresetId"],
                      })}
                    >
                      {TAVERN_SCENE_PRESET_OPTIONS.map((preset) => (
                        <NativeSelectOption key={preset.id} value={preset.id}>
                          {preset.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                </div>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-basic-mode-section"
                icon={MessageSquareText}
                title="互动方式"
                description="选择酒馆提示词风格、角色发言模式和玩家称呼。"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="提示词风格" htmlFor="tavern-basic-prompt-style">
                    <NativeSelect
                      id="tavern-basic-prompt-style"
                      value={draft.promptStyleId}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        promptStyleId: normalizeTavernPromptStyleId(event.target.value),
                      })}
                    >
                      {TAVERN_PROMPT_STYLE_PRESETS.map((preset) => (
                        <NativeSelectOption key={preset.id} value={preset.id}>
                          {preset.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>

                  <EditorField label="发言模式" htmlFor="tavern-basic-reply-mode">
                    <NativeSelect
                      id="tavern-basic-reply-mode"
                      value={draft.replyMode}
                      className={editorControlClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        replyMode: event.target.value as TavernReplyMode,
                      })}
                    >
                      {replyModeOptions.map((option) => (
                        <NativeSelectOption key={option.value} value={option.value}>
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>

                </div>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-basic-story-section"
                icon={BookOpenText}
                title="故事设定"
                description="总纲决定酒馆长期叙事方向，终局目标用于约束故事收束。"
              >
                <div className="space-y-3">
                  <EditorField
                    label="大故事总纲"
                    htmlFor="tavern-basic-story-outline"
                    action={renderTextFieldAgentActions({
                      fieldKey: "storyOutline",
                      fieldLabel: "大故事总纲",
                      currentText: draft.storyOutline,
                      applyText: (text) => setDraft({ ...draft, storyOutline: text }),
                    })}
                  >
                    <Textarea
                      id="tavern-basic-story-outline"
                      value={draft.storyOutline}
                      className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                      onChange={(event) => setDraft({
                        ...draft,
                        storyOutline: event.target.value,
                      })}
                    />
                  </EditorField>

                  <EditorField
                    label="大故事终局目标"
                    htmlFor="tavern-basic-story-goal"
                    action={renderTextFieldAgentActions({
                      fieldKey: "storyGoal",
                      fieldLabel: "大故事终局目标",
                      currentText: draft.storyGoal,
                      applyText: (text) => setDraft({ ...draft, storyGoal: text }),
                    })}
                  >
                    <Textarea
                      id="tavern-basic-story-goal"
                      value={draft.storyGoal}
                      className={cn("min-h-[104px] resize-none text-sm leading-6", editorControlClassName)}
                      onChange={(event) => setDraft({
                        ...draft,
                        storyGoal: event.target.value,
                      })}
                    />
                  </EditorField>
                </div>
              </EditorFormCard>

              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </EditorFormLayout>

            <EditorFormFooter
              status={(
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="size-3.5" />
                  保存后立即更新酒馆基础信息
                </span>
              )}
            >
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Goal className="size-4" />
                保存修改
              </Button>
            </EditorFormFooter>
          </form>
        </EditorFormDialogContent>
      )}
    </Dialog>
  );
};
