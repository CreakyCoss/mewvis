import { ApplicationForm } from "@/platform/form";
import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { MessageSquareText, Wine } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import { Dialog } from "design-system/components/ui/dialog";
import { Input } from "design-system/components/ui/input";
import { NativeSelect, NativeSelectOption } from "design-system/components/ui/native-select";
import { TAVERN_SCENE_PRESET_OPTIONS } from "@/stories/tavern/presets/visual-presets";
import type { TavernReplyMode, TavernRoomConfig } from "@/stories/tavern/manage/model";
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
import { editorControlClassName, emptyValueText, replyModeOptions } from "../../utils";
import type { ModuleEditProps } from "../types";

export type BasicEditHandle = (data?: TavernRoomConfig) => void;

type BasicDraft = {
  title: string;
  scenePresetId: TavernRoomConfig["scenePresetId"];
  replyMode: TavernReplyMode;
};

type BasicEditProps = ModuleEditProps & {
  bind: Ref<BasicEditHandle>;
};

export const BasicEdit = ({ bind, data, onSave }: BasicEditProps) => {
  const [draft, setDraft] = useState<BasicDraft | null>(null);
  const [error, setError] = useState("");

  const open = (nextData = data) => {
    setError("");
    setDraft({
      title: nextData.title,
      scenePresetId: nextData.scenePresetId,
      replyMode: nextData.replyMode ?? "director",
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
      scenePresetId: draft.scenePresetId,
      replyMode: draft.replyMode,
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
          <EditorFormHeader icon={Wine} title="编辑运行基础" description="修改酒馆房间名称、视觉场景和角色发言模式。" />
          <ApplicationForm
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
                    icon={Wine}
                    title={draft.title.trim() || emptyValueText}
                    meta={
                      <>
                        <EditorStatusPill tone="active">
                          {replyModeOptions.find((option) => option.value === draft.replyMode)?.label ?? "发言模式"}
                        </EditorStatusPill>
                        <EditorStatusPill>
                          {TAVERN_SCENE_PRESET_OPTIONS.find((preset) => preset.id === draft.scenePresetId)?.label ??
                            "场景"}
                        </EditorStatusPill>
                      </>
                    }
                  >
                    <p className="line-clamp-4 text-xs leading-5 text-muted-foreground">
                      故事、角色、世界书和剧情结构由独立故事页维护。
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="故事配置">
                    <div className="text-xs leading-5 text-muted-foreground">
                      需要修改故事设定、玩家称呼或角色设定时，请返回故事配置入口。
                    </div>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-basic-info-section", icon: Wine, label: "基础配置" },
                      { href: "#tavern-basic-mode-section", icon: MessageSquareText, label: "互动方式" },
                    ]}
                  />
                </>
              }
            >
              <EditorFormCard
                id="tavern-basic-info-section"
                icon={Wine}
                title="基础配置"
                description="定义酒馆呈现名称和默认视觉场景。"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="房间名称" htmlFor="tavern-basic-title">
                    <Input
                      id="tavern-basic-title"
                      value={draft.title}
                      className={editorControlClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          title: event.target.value,
                        })
                      }
                    />
                  </EditorField>

                  <EditorField label="场景设置" htmlFor="tavern-basic-scene-preset">
                    <NativeSelect
                      id="tavern-basic-scene-preset"
                      value={draft.scenePresetId}
                      className={editorControlClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          scenePresetId: event.target.value as TavernRoomConfig["scenePresetId"],
                        })
                      }
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
                description="选择房间里的角色响应方式；呈现方式与系统叙事请到呈现与叙事模块调整。"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField label="发言模式" htmlFor="tavern-basic-reply-mode">
                    <NativeSelect
                      id="tavern-basic-reply-mode"
                      value={draft.replyMode}
                      className={editorControlClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          replyMode: event.target.value as TavernReplyMode,
                        })
                      }
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

              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </EditorFormLayout>

            <EditorFormFooter
              status={
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquareText className="size-3.5" />
                  保存后立即更新酒馆运行配置
                </span>
              }
            >
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Wine className="size-4" />
                保存修改
              </Button>
            </EditorFormFooter>
          </ApplicationForm>
        </EditorFormDialogContent>
      )}
    </Dialog>
  );
};
