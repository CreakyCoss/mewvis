import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import {
  BookOpenText,
  Brain,
  MessageCircle,
  Save,
  ShieldCheck,
  Target,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StoryAsset, StoryContextCharacter } from "@/features/story";
import {
  createStoryCharacter,
  emptyCharacterMemory,
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

export type StoryCharactersEditHandle = (
  character?: StoryContextCharacter | null,
) => void;

type StoryCharactersEditProps = {
  bind: Ref<StoryCharactersEditHandle>;
  story: StoryAsset;
  onSave: StoryModuleSave;
};

type CharacterDraft = {
  id: string | null;
  name: string;
  description: string;
  speakingStyle: string;
  writingStyle: string;
  replyStylePrompt: string;
  goals: string;
  publicRelationshipSummary: string;
  relationshipSummary: string;
  memory: NonNullable<StoryContextCharacter["memory"]>;
};

const createDraft = (
  character: StoryContextCharacter | null,
  index: number,
): CharacterDraft => {
  const created = character ?? createStoryCharacter(index);

  return {
    id: character?.id ?? null,
    name: created.name,
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

export const StoryCharactersEdit = ({
  bind,
  story,
  onSave,
}: StoryCharactersEditProps) => {
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [error, setError] = useState("");

  const open = (character: StoryContextCharacter | null = null) => {
    setDraft(createDraft(character, story.characters.length));
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

    const name = draft.name.trim();
    const description = draft.description.trim();
    const speakingStyle = draft.speakingStyle.trim();
    if (!name || !description || !speakingStyle) {
      setError("请补全角色名称、人设和说话方式。");
      return;
    }

    const now = Date.now();
    const nextCharacter: StoryContextCharacter = {
      id: draft.id ?? `story-character-${crypto.randomUUID()}`,
      name,
      description,
      speakingStyle,
      writingStyle: draft.writingStyle.trim() || undefined,
      replyStylePrompt: draft.replyStylePrompt.trim() || undefined,
      goals: draft.goals.trim() || undefined,
      publicRelationshipSummary:
        draft.publicRelationshipSummary.trim() || undefined,
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
        ? story.characters.map((character) =>
            character.id === draft.id ? nextCharacter : character
          )
        : [...story.characters, nextCharacter],
      updatedAt: now,
    });
    close();
  };

  const updateMemory = (
    field: keyof NonNullable<StoryContextCharacter["memory"]>,
    value: string,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            memory: {
              ...current.memory,
              [field]: value,
            },
          }
        : current
    );
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
              sidebar={(
                <>
                  <StoryFormSidebarCard
                    icon={UserRoundCog}
                    title={draft.name.trim() || "未命名角色"}
                    meta={(
                      <>
                        <StoryStatusPill tone={draft.id ? "active" : "info"}>
                          {draft.id ? "当前角色" : "新建"}
                        </StoryStatusPill>
                        <StoryStatusPill>{story.characters.length} 角色</StoryStatusPill>
                      </>
                    )}
                    image={(
                      <span className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-2xl font-semibold text-primary shadow-xs">
                        {(draft.name.trim() || "?").slice(0, 1)}
                      </span>
                    )}
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
              )}
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
                <EditorField label="角色名称" htmlFor="story-character-name">
                  <Input
                    id="story-character-name"
                    value={draft.name}
                    onChange={(event) => setDraft({
                      ...draft,
                      name: event.target.value,
                    })}
                  />
                </EditorField>
              </StoryFormCard>

              <StoryFormCard
                id="story-character-description-section"
                icon={BookOpenText}
                title="角色设定"
              >
                <EditorField label="人设" htmlFor="story-character-description">
                  <Textarea
                    id="story-character-description"
                    className="min-h-[132px] resize-none text-sm leading-6"
                    value={draft.description}
                    onChange={(event) => setDraft({
                      ...draft,
                      description: event.target.value,
                    })}
                  />
                </EditorField>
              </StoryFormCard>

              <StoryFormCard
                id="story-character-speaking-section"
                icon={MessageCircle}
                title="说话方式"
              >
                <EditorField label="说话方式" htmlFor="story-character-speaking-style">
                  <Textarea
                    id="story-character-speaking-style"
                    className="min-h-[96px] resize-none text-sm leading-6"
                    value={draft.speakingStyle}
                    onChange={(event) => setDraft({
                      ...draft,
                      speakingStyle: event.target.value,
                    })}
                  />
                </EditorField>
              </StoryFormCard>

              <div className="grid gap-3 lg:grid-cols-2">
                <StoryFormCard
                  id="story-character-style-section"
                  icon={ShieldCheck}
                  title="写作风格"
                >
                  <EditorField label="写作风格" htmlFor="story-character-writing-style">
                    <Textarea
                      id="story-character-writing-style"
                      className="min-h-[86px] resize-none text-sm leading-6"
                      value={draft.writingStyle}
                      onChange={(event) => setDraft({
                        ...draft,
                        writingStyle: event.target.value,
                      })}
                    />
                  </EditorField>
                </StoryFormCard>
                <StoryFormCard
                  icon={ShieldCheck}
                  title="回复规则"
                >
                  <EditorField label="回复规则" htmlFor="story-character-reply-style-prompt">
                    <Textarea
                      id="story-character-reply-style-prompt"
                      className="min-h-[86px] resize-none text-sm leading-6"
                      value={draft.replyStylePrompt}
                      onChange={(event) => setDraft({
                        ...draft,
                        replyStylePrompt: event.target.value,
                      })}
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
                      onChange={(event) => setDraft({
                        ...draft,
                        goals: event.target.value,
                      })}
                    />
                  </EditorField>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <EditorField
                      label="公开关系"
                      htmlFor="story-character-public-relationship"
                    >
                      <Textarea
                        id="story-character-public-relationship"
                        className="min-h-[86px] resize-none text-sm leading-6"
                        value={draft.publicRelationshipSummary}
                        onChange={(event) => setDraft({
                          ...draft,
                          publicRelationshipSummary: event.target.value,
                        })}
                      />
                    </EditorField>
                    <EditorField
                      label="完整关系"
                      htmlFor="story-character-relationship"
                    >
                      <Textarea
                        id="story-character-relationship"
                        className="min-h-[86px] resize-none text-sm leading-6"
                        value={draft.relationshipSummary}
                        onChange={(event) => setDraft({
                          ...draft,
                          relationshipSummary: event.target.value,
                        })}
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
                  <EditorField
                    label="导演秘密"
                    htmlFor="story-character-memory-secret"
                    className="lg:col-span-2"
                  >
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
  );
};
