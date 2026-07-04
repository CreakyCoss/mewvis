import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import {
  BookOpenText,
  Brain,
  Check,
  ImagePlus,
  MessageCircle,
  Save,
  ShieldCheck,
  Target,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { normalizeTavernAvatarId, resolveAvatar, tavernAvatarGroups } from "@/assets/avatars";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { type StoryJson, type StoryCharacterJson } from "@/features/story/model/story-types";
import { cn } from "@/lib/utils";
import { createStoryCharacter, emptyCharacterMemory } from "../../../components/story-form-utils";
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
} from "../../../components/story-primitives";
import type { StoryModuleSave } from "../types";

export type StoryCharactersEditHandle = (character?: StoryCharacterJson | null) => void;

type StoryCharactersEditProps = {
  bind: Ref<StoryCharactersEditHandle>;
  story: StoryJson;
  onSave: StoryModuleSave;
};

type CharacterDraft = {
  id: string | null;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle: string;
  replyStylePrompt: string;
  goals: string;
  publicRelationshipSummary: string;
  relationshipSummary: string;
  memory: NonNullable<StoryCharacterJson["memory"]>;
};

const createDraft = (character: StoryCharacterJson | null, index: number): CharacterDraft => {
  const created = character ?? createStoryCharacter(index);

  return {
    id: character?.id ?? null,
    name: created.name,
    avatar: normalizeTavernAvatarId(created.avatar),
    description: created.description,
    speakingStyle: created.speakingStyle,
    writingStyle: created.writingStyle ?? "",
    replyStylePrompt: created.replyStylePrompt ?? "",
    goals: created.goals ?? "",
    publicRelationshipSummary: created.publicRelationshipSummary ?? "",
    relationshipSummary: created.relationshipSummary ?? "",
    memory: {
      ...emptyCharacterMemory(),
      ...created.memory,
    },
  };
};

export const StoryCharactersEdit = ({ bind, story, onSave }: StoryCharactersEditProps) => {
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [error, setError] = useState("");
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);

  const open = (character: StoryCharacterJson | null = null) => {
    setDraft(createDraft(character, story.characters.length));
    setError("");
    setIsAvatarPickerOpen(false);
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
    setError("");
    setIsAvatarPickerOpen(false);
  };

  const save = () => {
    if (!draft) {
      return;
    }

    const name = draft.name.trim();
    const description = draft.description.trim();
    const speakingStyle = draft.speakingStyle.trim();
    if (!name || !description || !speakingStyle) {
      setError("请补全角色名称、人设和说话方式。");
      return;
    }

    const now = Date.now();
    const nextCharacter: StoryCharacterJson = {
      id: draft.id ?? `story-character-${crypto.randomUUID()}`,
      name,
      avatar: normalizeTavernAvatarId(draft.avatar),
      description,
      speakingStyle,
      writingStyle: draft.writingStyle.trim() || undefined,
      replyStylePrompt: draft.replyStylePrompt.trim() || undefined,
      goals: draft.goals.trim() || undefined,
      publicRelationshipSummary: draft.publicRelationshipSummary.trim() || undefined,
      relationshipSummary: draft.relationshipSummary.trim() || undefined,
      memory: {
        required: draft.memory.required.trim(),
        public: draft.memory.public.trim(),
        known: draft.memory.known.trim(),
        privateSelf: draft.memory.privateSelf.trim(),
        directorSecret: draft.memory.directorSecret.trim(),
      },
    };

    onSave({
      ...story,
      characters: draft.id
        ? story.characters.map((character) => (character.id === draft.id ? nextCharacter : character))
        : [...story.characters, nextCharacter],
      updatedAt: now,
    });
    close();
  };

  const updateMemory = (field: keyof NonNullable<StoryCharacterJson["memory"]>, value: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            memory: {
              ...current.memory,
              [field]: value,
            },
          }
        : current,
    );
  };

  return (
    <>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(openState) => {
          if (!openState) {
            close();
          }
        }}
      >
        {draft ? (
          <StoryFormDialogContent className="sm:max-w-6xl">
            <StoryFormHeader
              icon={UserRoundCog}
              title={draft.id ? "编辑角色" : "新建角色"}
              description="编辑故事角色的基础定义、表达风格、关系摘要和角色记忆。"
            />
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <StoryFormLayout
                sidebar={
                  <>
                    <StoryFormSidebarCard
                      icon={UserRoundCog}
                      title={draft.name.trim() || "未命名角色"}
                      meta={
                        <>
                          <StoryStatusPill tone={draft.id ? "active" : "info"}>
                            {draft.id ? "当前角色" : "新建"}
                          </StoryStatusPill>
                          <StoryStatusPill>{story.characters.length} 角色</StoryStatusPill>
                        </>
                      }
                      image={
                        <Button
                          type="button"
                          variant="ghost"
                          className="group relative size-16 shrink-0 overflow-hidden rounded-xl border bg-background p-0 shadow-xs hover:bg-background"
                          title="选择头像"
                          aria-label="选择角色头像"
                          onClick={() => setIsAvatarPickerOpen(true)}
                        >
                          <img
                            src={resolveAvatar(draft.avatar).src}
                            alt={draft.name}
                            className="size-full object-cover"
                          />
                          <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center bg-background/85 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                            <ImagePlus className="size-3.5" />
                          </span>
                        </Button>
                      }
                    >
                      <p className="line-clamp-5 text-xs leading-5 text-muted-foreground">
                        {draft.description.trim() || "还没有填写角色设定。"}
                      </p>
                    </StoryFormSidebarCard>
                    <StoryFormSidebarPanel title="目标">
                      <p className="line-clamp-4 text-sm leading-5 text-muted-foreground">
                        {draft.goals.trim() || emptyValueText}
                      </p>
                    </StoryFormSidebarPanel>
                    <StoryFormNav
                      items={[
                        { href: "#story-character-basic-section", icon: UserRoundCog, label: "基础信息" },
                        { href: "#story-character-description-section", icon: BookOpenText, label: "角色设定" },
                        { href: "#story-character-speaking-section", icon: MessageCircle, label: "说话方式" },
                        { href: "#story-character-style-section", icon: ShieldCheck, label: "风格规则" },
                        { href: "#story-character-relationship-section", icon: UsersRound, label: "关系目标" },
                        { href: "#story-character-memory-section", icon: Brain, label: "角色记忆" },
                      ]}
                    />
                  </>
                }
              >
                {error ? (
                  <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <StoryFormCard
                  id="story-character-basic-section"
                  icon={UserRoundCog}
                  title="基础信息"
                  description="角色名称用于故事上下文、演绎调度和稿件归因。"
                >
                  <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">角色头像</div>
                      <Button
                        type="button"
                        variant="outline"
                        className="size-24 overflow-hidden rounded-lg p-0"
                        onClick={() => setIsAvatarPickerOpen(true)}
                      >
                        <img
                          src={resolveAvatar(draft.avatar).src}
                          alt={draft.name}
                          className="size-full object-cover"
                        />
                      </Button>
                    </div>
                    <EditorField label="角色名称" htmlFor="story-character-name">
                      <Input
                        id="story-character-name"
                        value={draft.name}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            name: event.target.value,
                          })
                        }
                      />
                    </EditorField>
                  </div>
                </StoryFormCard>

                <StoryFormCard id="story-character-description-section" icon={BookOpenText} title="角色设定">
                  <EditorField label="人设" htmlFor="story-character-description">
                    <Textarea
                      id="story-character-description"
                      className="min-h-[132px] resize-none text-sm leading-6"
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          description: event.target.value,
                        })
                      }
                    />
                  </EditorField>
                </StoryFormCard>

                <StoryFormCard id="story-character-speaking-section" icon={MessageCircle} title="说话方式">
                  <EditorField label="说话方式" htmlFor="story-character-speaking-style">
                    <Textarea
                      id="story-character-speaking-style"
                      className="min-h-[96px] resize-none text-sm leading-6"
                      value={draft.speakingStyle}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          speakingStyle: event.target.value,
                        })
                      }
                    />
                  </EditorField>
                </StoryFormCard>

                <div className="grid gap-3 lg:grid-cols-2">
                  <StoryFormCard id="story-character-style-section" icon={ShieldCheck} title="写作风格">
                    <EditorField label="写作风格" htmlFor="story-character-writing-style">
                      <Textarea
                        id="story-character-writing-style"
                        className="min-h-[86px] resize-none text-sm leading-6"
                        value={draft.writingStyle}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            writingStyle: event.target.value,
                          })
                        }
                      />
                    </EditorField>
                  </StoryFormCard>
                  <StoryFormCard icon={ShieldCheck} title="回复规则">
                    <EditorField label="回复规则" htmlFor="story-character-reply-style-prompt">
                      <Textarea
                        id="story-character-reply-style-prompt"
                        className="min-h-[86px] resize-none text-sm leading-6"
                        value={draft.replyStylePrompt}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            replyStylePrompt: event.target.value,
                          })
                        }
                      />
                    </EditorField>
                  </StoryFormCard>
                </div>

                <StoryFormCard
                  id="story-character-relationship-section"
                  icon={Target}
                  title="关系目标"
                  description="故事端只保存角色标准关系摘要，呈现端可以另行维护临时演绎关系。"
                >
                  <div className="space-y-3">
                    <EditorField label="目标" htmlFor="story-character-goals">
                      <Textarea
                        id="story-character-goals"
                        className="min-h-[86px] resize-none text-sm leading-6"
                        value={draft.goals}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            goals: event.target.value,
                          })
                        }
                      />
                    </EditorField>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <EditorField label="公开关系" htmlFor="story-character-public-relationship">
                        <Textarea
                          id="story-character-public-relationship"
                          className="min-h-[86px] resize-none text-sm leading-6"
                          value={draft.publicRelationshipSummary}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              publicRelationshipSummary: event.target.value,
                            })
                          }
                        />
                      </EditorField>
                      <EditorField label="完整关系" htmlFor="story-character-relationship">
                        <Textarea
                          id="story-character-relationship"
                          className="min-h-[86px] resize-none text-sm leading-6"
                          value={draft.relationshipSummary}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              relationshipSummary: event.target.value,
                            })
                          }
                        />
                      </EditorField>
                    </div>
                  </div>
                </StoryFormCard>

                <StoryFormCard
                  id="story-character-memory-section"
                  icon={Brain}
                  title="角色记忆"
                  description="写入故事标准数据，供不同呈现方式读取。"
                >
                  <div className="grid gap-3 lg:grid-cols-2">
                    <EditorField label="必要记忆" htmlFor="story-character-memory-required">
                      <Textarea
                        id="story-character-memory-required"
                        className="min-h-[76px] resize-none text-sm leading-6"
                        value={draft.memory.required}
                        onChange={(event) => updateMemory("required", event.target.value)}
                      />
                    </EditorField>
                    <EditorField label="公开记忆" htmlFor="story-character-memory-public">
                      <Textarea
                        id="story-character-memory-public"
                        className="min-h-[76px] resize-none text-sm leading-6"
                        value={draft.memory.public}
                        onChange={(event) => updateMemory("public", event.target.value)}
                      />
                    </EditorField>
                    <EditorField label="已知信息" htmlFor="story-character-memory-known">
                      <Textarea
                        id="story-character-memory-known"
                        className="min-h-[76px] resize-none text-sm leading-6"
                        value={draft.memory.known}
                        onChange={(event) => updateMemory("known", event.target.value)}
                      />
                    </EditorField>
                    <EditorField label="私密记忆" htmlFor="story-character-memory-private">
                      <Textarea
                        id="story-character-memory-private"
                        className="min-h-[76px] resize-none text-sm leading-6"
                        value={draft.memory.privateSelf}
                        onChange={(event) => updateMemory("privateSelf", event.target.value)}
                      />
                    </EditorField>
                    <EditorField label="导演秘密" htmlFor="story-character-memory-secret" className="lg:col-span-2">
                      <Textarea
                        id="story-character-memory-secret"
                        className="min-h-[76px] resize-none text-sm leading-6"
                        value={draft.memory.directorSecret}
                        onChange={(event) => updateMemory("directorSecret", event.target.value)}
                      />
                    </EditorField>
                  </div>
                </StoryFormCard>
              </StoryFormLayout>

              <StoryFormFooter status="保存后会立即更新故事角色标准数据。">
                <Button type="button" variant="outline" onClick={close}>
                  取消
                </Button>
                <Button type="submit">
                  <Save className="size-4" />
                  保存角色
                </Button>
              </StoryFormFooter>
            </form>
          </StoryFormDialogContent>
        ) : null}
      </Dialog>

      <Dialog open={Boolean(draft && isAvatarPickerOpen)} onOpenChange={setIsAvatarPickerOpen}>
        <DialogContent className="flex max-h-[86vh] max-w-[min(56rem,calc(100%-2rem))] flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle>选择角色头像</DialogTitle>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-5">
              {tavernAvatarGroups.map((group) => (
                <section key={group.id} className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold leading-5">{group.label}</h3>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{group.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {group.options.map((option) => {
                      const isSelected = option.id === draft?.avatar;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={cn(
                            "group relative overflow-hidden rounded-lg border bg-background text-left outline-none transition-colors hover:border-primary/45 focus-visible:ring-3 focus-visible:ring-ring/50",
                            isSelected && "border-primary ring-2 ring-primary/20",
                          )}
                          onClick={() => {
                            setDraft((current) => (current ? { ...current, avatar: option.id } : current));
                            setIsAvatarPickerOpen(false);
                          }}
                        >
                          <span className="block aspect-square overflow-hidden bg-muted">
                            <img
                              src={option.src}
                              alt={option.label}
                              className="size-full object-cover transition-transform group-hover:scale-[1.03]"
                            />
                          </span>
                          <span className="block truncate px-2 py-1.5 text-xs font-medium">{option.label}</span>
                          {isSelected ? (
                            <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                              <Check className="size-3.5" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="shrink-0 border-t bg-muted/10 px-5 py-3">
            <Button type="button" variant="outline" onClick={() => setIsAvatarPickerOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
