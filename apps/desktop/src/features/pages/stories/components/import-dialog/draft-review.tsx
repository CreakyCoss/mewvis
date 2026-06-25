import { BookOpen, FileText, Trash2, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { StoryImportDraft } from "@/features/story";
import {
  formatCount,
  splitKeywords,
  storyImportSourceLabels,
} from "../story-form-utils";
import {
  EditorField,
  EmptyBlock,
  StorySection,
} from "../story-primitives";
import {
  updateImportCharacter,
  updateImportLore,
  updateImportScene,
} from "./draft-utils";

type StoryImportDraftReviewProps = {
  importDraft: StoryImportDraft | null;
  setImportDraft: (draft: StoryImportDraft | null) => void;
};

export const StoryImportDraftReview = ({
  importDraft,
  setImportDraft,
}: StoryImportDraftReviewProps) => (
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
);
