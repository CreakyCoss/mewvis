import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  TAVERN_PROMPT_STYLE_PRESETS,
  normalizeTavernPromptStyleId,
} from "../../../../../prompt-styles";
import type {
  TavernReplyMode,
  TavernRoom,
} from "../../../../../types";
import { EditorField } from "../../primitives";
import {
  editorControlClassName,
  replyModeOptions,
} from "../../utils";
import type { ModuleEditProps } from "../types";

export type BasicEditHandle = (data?: TavernRoom) => void;

type BasicDraft = {
  title: string;
  storyOutline: string;
  storyGoal: string;
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
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>编辑基础信息</DialogTitle>
            <DialogDescription>
              修改房间名称、大故事总纲、发言模式和你的称呼。
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-3">
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
                    className={cn("min-h-[112px] resize-none text-sm leading-6", editorControlClassName)}
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
                    className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      storyGoal: event.target.value,
                    })}
                  />
                </EditorField>

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
              </div>

              {error && (
                <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="mt-4 shrink-0 border-t pt-4">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">保存修改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
};
