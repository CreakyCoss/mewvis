import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import {
  BookOpen,
  FileText,
  KeyRound,
  Save,
  ToggleLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createTavernLorebookEntry } from "../../../../../storage";
import type { TavernLorebookEntry } from "../../../../../types";
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
        <EditorFormDialogContent className="sm:max-w-5xl">
          <EditorFormHeader
            icon={BookOpen}
            title={draft.entryId ? "编辑世界书条目" : "新增世界书条目"}
            description="世界书条目会写入酒馆共享设定，点击保存修改后立即生效。"
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
                    icon={BookOpen}
                    title={draft.title.trim() || emptyValueText}
                    meta={(
                      <>
                        <EditorStatusPill tone={draft.enabled ? "active" : "muted"}>
                          {draft.enabled ? "启用" : "停用"}
                        </EditorStatusPill>
                        {draft.alwaysOn && (
                          <EditorStatusPill tone="info">常驻</EditorStatusPill>
                        )}
                      </>
                    )}
                  >
                    <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                      {draft.content.trim() || "还没有填写设定内容。"}
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="关键词">
                    <div className="flex flex-wrap gap-1.5">
                      {parseKeywords(draft.keywords).slice(0, 8).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {keyword}
                        </span>
                      ))}
                      {parseKeywords(draft.keywords).length === 0 && (
                        <span className="text-sm text-muted-foreground">{emptyValueText}</span>
                      )}
                    </div>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-lore-basic-section", icon: BookOpen, label: "条目信息" },
                      { href: "#tavern-lore-content-section", icon: FileText, label: "设定内容" },
                      { href: "#tavern-lore-policy-section", icon: ToggleLeft, label: "触发策略" },
                    ]}
                  />
                </>
              )}
            >
              <EditorFormCard
                id="tavern-lore-basic-section"
                icon={BookOpen}
                title="条目信息"
                description="名称和关键词决定世界书条目的识别与触发。"
              >
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
                </div>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-lore-content-section"
                icon={FileText}
                title="设定内容"
                description="写入可被剧情引用的地点、规则、物品或背景事实。"
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
                <EditorField
                  label="设定内容"
                  htmlFor="tavern-lore-content"
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
              </EditorFormCard>

              <EditorFormCard
                id="tavern-lore-policy-section"
                icon={KeyRound}
                title="触发策略"
                description="控制条目是否参与检索，以及是否常驻进入上下文。"
              >
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
              </EditorFormCard>

              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </EditorFormLayout>

            <EditorFormFooter status="保存后会立即更新酒馆共享设定。">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                保存修改
              </Button>
            </EditorFormFooter>
          </form>
        </EditorFormDialogContent>
      )}
    </Dialog>
  );
};
