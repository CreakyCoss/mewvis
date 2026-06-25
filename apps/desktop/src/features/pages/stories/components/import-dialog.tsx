import { BookOpen, FileText, FileUp, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  createStoryImportDraftFromText,
  type StoryAsset,
  type StoryImportDraft,
  type StoryImportSourceKind,
} from "@/features/story";
import {
  EditorField,
  EmptyBlock,
  formatCount,
  selectClassName,
  splitKeywords,
  storyImportSourceLabels,
  StorySection,
} from "./shared";

const updateImportCharacter = (
  draft: StoryImportDraft,
  characterId: string,
  patch: Partial<StoryImportDraft["characters"][number]>,
): StoryImportDraft => ({
  ...draft,
  characters: draft.characters.map((character) =>
    character.id === characterId ? { ...character, ...patch } : character
  ),
});

const updateImportScene = (
  draft: StoryImportDraft,
  sceneId: string,
  patch: Partial<StoryImportDraft["scenes"][number]>,
): StoryImportDraft => ({
  ...draft,
  scenes: draft.scenes.map((scene) =>
    scene.id === sceneId ? { ...scene, ...patch } : scene
  ),
});

const updateImportLore = (
  draft: StoryImportDraft,
  entryId: string,
  patch: Partial<StoryImportDraft["lorebookEntries"][number]>,
): StoryImportDraft => ({
  ...draft,
  lorebookEntries: draft.lorebookEntries.map((entry) =>
    entry.id === entryId ? { ...entry, ...patch } : entry
  ),
});

type StoryImportDialogProps = {
  open: boolean;
  activeStory: StoryAsset | null;
  importSourceKind: StoryImportSourceKind;
  importRaw: string;
  importDraft: StoryImportDraft | null;
  setImportSourceKind: (kind: StoryImportSourceKind) => void;
  setImportRaw: (raw: string) => void;
  setImportDraft: (draft: StoryImportDraft | null) => void;
  onOpenChange: (open: boolean) => void;
  onConvert: () => void;
  onImportNewStory: () => void;
  onMergeIntoActiveStory: () => void;
};

export const StoryImportDialog = ({
  open,
  activeStory,
  importSourceKind,
  importRaw,
  importDraft,
  setImportSourceKind,
  setImportRaw,
  setImportDraft,
  onOpenChange,
  onConvert,
  onImportNewStory,
  onMergeIntoActiveStory,
}: StoryImportDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[min(90vh,52rem)] overflow-hidden sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>导入故事</DialogTitle>
        <DialogDescription>
          JSON、纯文本、角色卡和世界书会先转换为标准故事草稿，确认后再写入故事资产。
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-h-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <EditorField label="来源类型">
              <select
                className={selectClassName}
                value={importSourceKind}
                onChange={(event) => setImportSourceKind(event.target.value as StoryImportSourceKind)}
              >
                {(["unknown", "json", "plainText", "aiGenerated"] satisfies StoryImportSourceKind[]).map((kind) => (
                  <option key={kind} value={kind}>{storyImportSourceLabels[kind]}</option>
                ))}
              </select>
            </EditorField>
            <EditorField label="文件">
              <Input
                type="file"
                accept="application/json,text/plain,.json,.txt,.md"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  file.text()
                    .then((content) => {
                      setImportRaw(content);
                      try {
                        setImportDraft(createStoryImportDraftFromText(content, {
                          sourceKind: importSourceKind,
                        }));
                      } catch {
                        setImportDraft(null);
                      }
                    })
                    .catch((error) => {
                      console.error("Failed to read story import file", error);
                      toast.error("无法读取导入文件。");
                    })
                    .finally(() => {
                      event.target.value = "";
                    });
                }}
              />
            </EditorField>
          </div>
          <EditorField label="原始内容">
            <Textarea
              className="min-h-72 resize-y font-mono text-xs"
              value={importRaw}
              onChange={(event) => setImportRaw(event.target.value)}
            />
          </EditorField>
          <Button type="button" className="w-full gap-2" onClick={onConvert}>
            <FileUp className="size-4" />
            转换为标准草稿
          </Button>
        </div>

        <ScrollArea className="min-h-0 rounded-md border bg-background">
          <div className="space-y-4 p-4">
            {!importDraft ? (
              <EmptyBlock text="转换后会在这里预览标准草稿" />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {importDraft.mode === "lorebookPatch" ? "世界书补丁" : "完整故事"}
                  </Badge>
                  <Badge variant="outline">{storyImportSourceLabels[importDraft.sourceKind]}</Badge>
                  <Badge variant="outline">{formatCount(importDraft.characters.length, "角色")}</Badge>
                  <Badge variant="outline">{formatCount(importDraft.scenes.length, "场景")}</Badge>
                  <Badge variant="outline">{formatCount(importDraft.lorebookEntries.length, "世界书")}</Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <EditorField label="标题">
                    <Input
                      value={importDraft.story.title}
                      onChange={(event) =>
                        setImportDraft({
                          ...importDraft,
                          story: { ...importDraft.story, title: event.target.value },
                        })
                      }
                    />
                  </EditorField>
                  <EditorField label="用户称呼">
                    <Input
                      value={importDraft.story.userPersonaName}
                      onChange={(event) =>
                        setImportDraft({
                          ...importDraft,
                          story: { ...importDraft.story, userPersonaName: event.target.value },
                        })
                      }
                    />
                  </EditorField>
                  <EditorField label="故事定位">
                    <Textarea
                      className="min-h-24 resize-y"
                      value={importDraft.story.outline}
                      onChange={(event) =>
                        setImportDraft({
                          ...importDraft,
                          story: { ...importDraft.story, outline: event.target.value },
                        })
                      }
                    />
                  </EditorField>
                  <EditorField label="目标">
                    <Textarea
                      className="min-h-24 resize-y"
                      value={importDraft.story.goal}
                      onChange={(event) =>
                        setImportDraft({
                          ...importDraft,
                          story: { ...importDraft.story, goal: event.target.value },
                        })
                      }
                    />
                  </EditorField>
                </div>

                <StorySection icon={UsersRound} title="角色">
                  {importDraft.characters.length === 0 ? (
                    <EmptyBlock text="暂无角色" />
                  ) : (
                    <div className="space-y-3">
                      {importDraft.characters.map((character) => (
                        <div key={character.id} className="rounded-md border p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium">{character.name}</div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setImportDraft({
                                  ...importDraft,
                                  characters: importDraft.characters.filter((item) => item.id !== character.id),
                                })
                              }
                              title="移除角色"
                              aria-label="移除角色"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <EditorField label="名称">
                              <Input
                                value={character.name}
                                onChange={(event) =>
                                  setImportDraft(updateImportCharacter(importDraft, character.id, {
                                    name: event.target.value,
                                  }))
                                }
                              />
                            </EditorField>
                            <EditorField label="说话风格">
                              <Input
                                value={character.speakingStyle}
                                onChange={(event) =>
                                  setImportDraft(updateImportCharacter(importDraft, character.id, {
                                    speakingStyle: event.target.value,
                                  }))
                                }
                              />
                            </EditorField>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </StorySection>

                <StorySection icon={BookOpen} title="场景">
                  {importDraft.scenes.length === 0 ? (
                    <EmptyBlock text="暂无场景" />
                  ) : (
                    <div className="space-y-3">
                      {importDraft.scenes.map((scene) => (
                        <div key={scene.id} className="rounded-md border p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium">{scene.title}</div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setImportDraft({
                                  ...importDraft,
                                  scenes: importDraft.scenes.filter((item) => item.id !== scene.id),
                                })
                              }
                              title="移除场景"
                              aria-label="移除场景"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <EditorField label="标题">
                              <Input
                                value={scene.title}
                                onChange={(event) =>
                                  setImportDraft(updateImportScene(importDraft, scene.id, {
                                    title: event.target.value,
                                  }))
                                }
                              />
                            </EditorField>
                            <EditorField label="目标">
                              <Input
                                value={scene.goal}
                                onChange={(event) =>
                                  setImportDraft(updateImportScene(importDraft, scene.id, {
                                    goal: event.target.value,
                                  }))
                                }
                              />
                            </EditorField>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </StorySection>

                <StorySection icon={FileText} title="世界书">
                  {importDraft.lorebookEntries.length === 0 ? (
                    <EmptyBlock text="暂无世界书条目" />
                  ) : (
                    <div className="space-y-3">
                      {importDraft.lorebookEntries.map((entry) => (
                        <div key={entry.id} className="rounded-md border p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium">{entry.title}</div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setImportDraft({
                                  ...importDraft,
                                  lorebookEntries: importDraft.lorebookEntries.filter((item) =>
                                    item.id !== entry.id
                                  ),
                                })
                              }
                              title="移除世界书"
                              aria-label="移除世界书"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
                            <EditorField label="标题">
                              <Input
                                value={entry.title}
                                onChange={(event) =>
                                  setImportDraft(updateImportLore(importDraft, entry.id, {
                                    title: event.target.value,
                                  }))
                                }
                              />
                            </EditorField>
                            <EditorField label="关键词">
                              <Input
                                value={entry.keywords.join("、")}
                                onChange={(event) =>
                                  setImportDraft(updateImportLore(importDraft, entry.id, {
                                    keywords: splitKeywords(event.target.value),
                                  }))
                                }
                              />
                            </EditorField>
                            <div className="md:col-span-2">
                              <EditorField label="内容">
                                <Textarea
                                  className="min-h-20 resize-y"
                                  value={entry.content}
                                  onChange={(event) =>
                                    setImportDraft(updateImportLore(importDraft, entry.id, {
                                      content: event.target.value,
                                    }))
                                  }
                                />
                              </EditorField>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </StorySection>
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onMergeIntoActiveStory}
          disabled={!importDraft || !activeStory}
        >
          合并到当前故事
        </Button>
        <Button
          type="button"
          onClick={onImportNewStory}
          disabled={!importDraft || importDraft.mode === "lorebookPatch"}
        >
          导入为新故事
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
