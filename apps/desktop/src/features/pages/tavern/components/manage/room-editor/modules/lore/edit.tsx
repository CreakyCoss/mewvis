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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createTavernLorebookEntry } from "../../../../../storage";
import type { TavernLorebookEntry } from "../../../../../types";
import { EditorField } from "../../primitives";
import {
  editorControlClassName,
  parseKeywords,
} from "../../utils";
import type { ModuleEditProps } from "../types";

export type LoreEditHandle = (entry?: TavernLorebookEntry | null) => void;

type LoreDraft = {
  entryId: string | null;
  title: string;
  keywords: string;
  content: string;
  enabled: boolean;
  alwaysOn: boolean;
};

type LoreEditProps = ModuleEditProps & {
  bind: Ref<LoreEditHandle>;
};

export const LoreEdit = ({
  bind,
  data,
  onSave,
  renderTextFieldAgentActions,
}: LoreEditProps) => {
  const [draft, setDraft] = useState<LoreDraft | null>(null);
  const [error, setError] = useState("");

  const open = (entry: TavernLorebookEntry | null = null) => {
    setError("");
    setDraft({
      entryId: entry?.id ?? null,
      title: entry?.title ?? "",
      keywords: entry?.keywords.join("，") ?? "",
      content: entry?.content ?? "",
      enabled: entry?.enabled ?? true,
      alwaysOn: entry?.alwaysOn ?? false,
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

    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title || !content) {
      setError("请填写世界书名称和内容。");
      return;
    }

    onSave({
      lorebookEntries: draft.entryId
        ? data.lorebookEntries.map((item) =>
            item.id === draft.entryId
              ? {
                  ...item,
                  title,
                  content,
                  keywords: parseKeywords(draft.keywords),
                  enabled: draft.enabled,
                  alwaysOn: draft.alwaysOn,
                  updatedAt: Date.now(),
                }
              : item
          )
        : [
            ...data.lorebookEntries,
            {
              ...createTavernLorebookEntry({
                title,
                content,
                keywords: parseKeywords(draft.keywords),
                alwaysOn: draft.alwaysOn,
              }),
              enabled: draft.enabled,
            },
          ],
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
            <DialogTitle>{draft.entryId ? "编辑世界书条目" : "新增世界书条目"}</DialogTitle>
            <DialogDescription>
              世界书条目会写入酒馆共享设定，点击保存修改后立即生效。
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
                <EditorField label="条目名称" htmlFor="tavern-lore-title">
                  <Input
                    id="tavern-lore-title"
                    value={draft.title}
                    className={editorControlClassName}
                    onChange={(event) => setDraft({
                      ...draft,
                      title: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField
                  label="关键词"
                  htmlFor="tavern-lore-keywords"
                  description="使用逗号、中文逗号或换行分隔。"
                >
                  <Input
                    id="tavern-lore-keywords"
                    value={draft.keywords}
                    className={editorControlClassName}
                    onChange={(event) => setDraft({
                      ...draft,
                      keywords: event.target.value,
                    })}
                  />
                </EditorField>

                <EditorField
                  label="设定内容"
                  htmlFor="tavern-lore-content"
                  action={renderTextFieldAgentActions({
                    fieldKey: "loreContent",
                    fieldLabel: "世界书设定内容",
                    currentText: draft.content,
                    applyText: (text) => setDraft({ ...draft, content: text }),
                    context: {
                      loreTitle: draft.title,
                      loreKeywords: draft.keywords,
                    },
                  })}
                >
                  <Textarea
                    id="tavern-lore-content"
                    value={draft.content}
                    className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                    onChange={(event) => setDraft({
                      ...draft,
                      content: event.target.value,
                    })}
                  />
                </EditorField>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        enabled: event.target.checked,
                      })}
                    />
                    启用
                  </label>
                  <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.alwaysOn}
                      className="accent-primary"
                      onChange={(event) => setDraft({
                        ...draft,
                        alwaysOn: event.target.checked,
                      })}
                    />
                    常驻
                  </label>
                </div>
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
