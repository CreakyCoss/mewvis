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
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryJson, StoryLorebookEntryJson } from "@/features/story/model/story-types";
import {
  createStoryLorebookEntry,
  splitKeywords,
} from "../../story-form-utils";
import {
  EditorField,
  StoryFormCard,
  StoryFormDialogContent,
  StoryFormFooter,
  StoryFormHeader,
  StoryFormLayout,
  StoryFormNav,
  StoryFormSidebarCard,
  StoryFormSidebarPanel,
  StoryStatusPill,
  emptyValueText,
} from "../../story-primitives";
import type { StoryModuleSave } from "../types";

export type StoryWorldEditHandle = (
  entry?: StoryLorebookEntryJson | null,
) => void;

type StoryWorldEditProps = {
  bind: Ref<StoryWorldEditHandle>;
  story: StoryJson;
  onSave: StoryModuleSave;
};

type LoreDraft = {
  id: string | null;
  title: string;
  keywords: string;
  content: string;
  enabled: boolean;
  alwaysOn: boolean;
};

const createDraft = (
  entry: StoryLorebookEntryJson | null,
  index: number,
): LoreDraft => {
  const created = entry ?? createStoryLorebookEntry(index);

  return {
    id: entry?.id ?? null,
    title: created.title,
    keywords: created.keywords.join("，"),
    content: created.content,
    enabled: created.enabled,
    alwaysOn: created.alwaysOn,
  };
};

export const StoryWorldEdit = ({
  bind,
  story,
  onSave,
}: StoryWorldEditProps) => {
  const [draft, setDraft] = useState<LoreDraft | null>(null);
  const [error, setError] = useState("");

  const open = (entry: StoryLorebookEntryJson | null = null) => {
    setDraft(createDraft(entry, story.lorebookEntries.length));
    setError("");
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

    const now = Date.now();
    const nextEntry: StoryLorebookEntryJson = {
      id: draft.id ?? `story-lore-${crypto.randomUUID()}`,
      title,
      content,
      keywords: splitKeywords(draft.keywords),
      enabled: draft.enabled,
      alwaysOn: draft.alwaysOn,
    };

    onSave({
      ...story,
      lorebookEntries: draft.id
        ? story.lorebookEntries.map((entry) =>
            entry.id === draft.id ? nextEntry : entry
          )
        : [...story.lorebookEntries, nextEntry],
      updatedAt: now,
    });
    close();
  };

  const keywords = draft ? splitKeywords(draft.keywords) : [];

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
        <StoryFormDialogContent className="sm:max-w-5xl">
          <StoryFormHeader
            icon={BookOpen}
            title={draft.id ? "编辑世界书条目" : "新增世界书条目"}
            description="世界书条目会写入故事标准设定，可被不同呈现方式读取。"
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <StoryFormLayout
              sidebar={(
                <>
                  <StoryFormSidebarCard
                    icon={BookOpen}
                    title={draft.title.trim() || emptyValueText}
                    meta={(
                      <>
                        <StoryStatusPill tone={draft.enabled ? "active" : "muted"}>
                          {draft.enabled ? "启用" : "停用"}
                        </StoryStatusPill>
                        {draft.alwaysOn ? (
                          <StoryStatusPill tone="info">常驻</StoryStatusPill>
                        ) : null}
                      </>
                    )}
                  >
                    <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                      {draft.content.trim() || "还没有填写设定内容。"}
                    </p>
                  </StoryFormSidebarCard>
                  <StoryFormSidebarPanel title="关键词">
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.slice(0, 8).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {keyword}
                        </span>
                      ))}
                      {keywords.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {emptyValueText}
                        </span>
                      ) : null}
                    </div>
                  </StoryFormSidebarPanel>
                  <StoryFormNav
                    items={[
                      { href: "#story-world-basic-section", icon: BookOpen, label: "条目信息" },
                      { href: "#story-world-content-section", icon: FileText, label: "设定内容" },
                      { href: "#story-world-policy-section", icon: ToggleLeft, label: "触发策略" },
                    ]}
                  />
                </>
              )}
            >
              {error ? (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <StoryFormCard
                id="story-world-basic-section"
                icon={BookOpen}
                title="条目信息"
                description="名称和关键词决定世界书条目的识别与触发。"
              >
                <div className="space-y-3">
                  <EditorField label="条目名称" htmlFor="story-world-title">
                    <Input
                      id="story-world-title"
                      value={draft.title}
                      onChange={(event) => setDraft({
                        ...draft,
                        title: event.target.value,
                      })}
                    />
                  </EditorField>
                  <EditorField
                    label="关键词"
                    htmlFor="story-world-keywords"
                    description="使用逗号、中文逗号、顿号或换行分隔。"
                  >
                    <Input
                      id="story-world-keywords"
                      value={draft.keywords}
                      onChange={(event) => setDraft({
                        ...draft,
                        keywords: event.target.value,
                      })}
                    />
                  </EditorField>
                </div>
              </StoryFormCard>

              <StoryFormCard
                id="story-world-content-section"
                icon={FileText}
                title="设定内容"
                description="写入可被剧情引用的地点、规则、物品或背景事实。"
              >
                <EditorField label="设定内容" htmlFor="story-world-content">
                  <Textarea
                    id="story-world-content"
                    className="min-h-[132px] resize-none text-sm leading-6"
                    value={draft.content}
                    onChange={(event) => setDraft({
                      ...draft,
                      content: event.target.value,
                    })}
                  />
                </EditorField>
              </StoryFormCard>

              <StoryFormCard
                id="story-world-policy-section"
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
              </StoryFormCard>
            </StoryFormLayout>

            <StoryFormFooter status="保存后会立即更新故事世界书标准数据。">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                保存修改
              </Button>
            </StoryFormFooter>
          </form>
        </StoryFormDialogContent>
      ) : null}
    </Dialog>
  );
};
