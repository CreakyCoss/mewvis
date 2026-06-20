import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  Bot,
  Check,
  MessageCircle,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import {
  defaultTavernAvatar,
  normalizeTavernAvatarId,
  tavernAvatarGroups,
  tavernAvatarOptions,
} from "@/assets/agent-avatars";
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
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "../../../../../types";
import type { TavernTextFieldAgentRequest } from "../../../../../runtime/field-polish-agent";
import {
  EditorFormCard,
  EditorFormDialogContent,
  EditorFormFooter,
  EditorFormHeader,
  EditorFormLayout,
  EditorFormNav,
  EditorFormSidebarCard,
  EditorStatusPill,
} from "../../primitives";

export type CharacterFormValue = {
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: string;
};

type CharacterFormDialogProps = {
  open: boolean;
  character: TavernCharacter | null;
  roomModelLabel?: string;
  onRunTextFieldAgent?: (request: TavernTextFieldAgentRequest) => Promise<string>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: CharacterFormValue) => void;
};

export const CharacterFormDialog = ({
  open,
  character,
  roomModelLabel = "未选择",
  onRunTextFieldAgent,
  onOpenChange,
  onSubmit,
}: CharacterFormDialogProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [speakingStyle, setSpeakingStyle] = useState("");
  const [writingStyle, setWritingStyle] = useState("");
  const [replyStylePrompt, setReplyStylePrompt] = useState("");
  const [goals, setGoals] = useState("");
  const [relationships, setRelationships] = useState("");
  const [avatar, setAvatar] = useState(normalizeTavernAvatarId(tavernAvatarOptions[0]?.id));
  const [formError, setFormError] = useState("");
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [activeTextFieldAgentKey, setActiveTextFieldAgentKey] = useState("");

  const selectedAvatar = useMemo(
    () => tavernAvatarOptions.find((option) => option.id === avatar) ?? defaultTavernAvatar,
    [avatar],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(character?.name ?? "");
    setDescription(character?.description ?? "");
    setSpeakingStyle(character?.speakingStyle ?? "");
    setWritingStyle(character?.writingStyle ?? "");
    setReplyStylePrompt(character?.replyStylePrompt ?? "");
    setGoals(character?.goals ?? "");
    setRelationships(character?.relationships ?? "");
    setAvatar(normalizeTavernAvatarId(character?.avatar ?? tavernAvatarOptions[0]?.id));
    setFormError("");
  }, [character, open]);

  useEffect(() => {
    if (!open) {
      setIsAvatarPickerOpen(false);
    }
  }, [open]);

  const handleSubmit = () => {
    const nextName = name.trim();
    const nextDescription = description.trim();
    const nextSpeakingStyle = speakingStyle.trim();

    if (!nextName || !nextDescription || !nextSpeakingStyle) {
      setFormError("请补全角色名称、设定和说话方式。");
      return;
    }

    onSubmit({
      name: nextName,
      avatar,
      description: nextDescription,
      speakingStyle: nextSpeakingStyle,
      writingStyle: writingStyle.trim() || undefined,
      replyStylePrompt: replyStylePrompt.trim() || undefined,
      goals: goals.trim() || undefined,
      relationships: relationships.trim() || undefined,
    });
    onOpenChange(false);
  };

  const buildCharacterTextFieldContext = () => ({
    character: {
      name,
      description,
      speakingStyle,
      writingStyle,
      replyStylePrompt,
      goals,
      relationships,
    },
  });

  const runTextFieldAgent = async ({
    mode,
    fieldKey,
    fieldLabel,
    currentText,
    applyText,
  }: {
    mode: "polish" | "inspire";
    fieldKey: string;
    fieldLabel: string;
    currentText: string;
    applyText: (text: string) => void;
  }) => {
    if (!onRunTextFieldAgent) {
      return;
    }

    setActiveTextFieldAgentKey(`${fieldKey}:${mode}`);
    setFormError("");
    try {
      const text = await onRunTextFieldAgent({
        mode,
        fieldLabel,
        currentText,
        context: buildCharacterTextFieldContext(),
      });
      if (text.trim()) {
        applyText(text);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "操作失败，请稍后重试。");
    } finally {
      setActiveTextFieldAgentKey("");
    }
  };

  const renderTextFieldHeader = ({
    label,
    fieldKey,
    fieldLabel,
    currentText,
    applyText,
  }: {
    label: string;
    fieldKey: string;
    fieldLabel: string;
    currentText: string;
    applyText: (text: string) => void;
  }): ReactNode => {
    if (!onRunTextFieldAgent) {
      return null;
    }

    const isPolishing = activeTextFieldAgentKey === `${fieldKey}:polish`;
    const isInspiring = activeTextFieldAgentKey === `${fieldKey}:inspire`;
    const isBusy = Boolean(activeTextFieldAgentKey);
    const run = (mode: "polish" | "inspire") => (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      void runTextFieldAgent({
        mode,
        fieldKey,
        fieldLabel,
        currentText,
        applyText,
      });
    };

    return (
      <span className="flex shrink-0 items-center gap-1" aria-label={label}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={isBusy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={run("polish")}
          >
            <Pencil className="size-3" />
            {isPolishing ? "处理中" : "润色"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={isBusy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={run("inspire")}
          >
            <Sparkles className="size-3" />
            {isInspiring ? "处理中" : "灵感"}
          </Button>
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <EditorFormDialogContent className="sm:max-w-6xl">
        <EditorFormHeader
          icon={UserRoundCog}
          title={character ? "编辑角色" : "新建角色"}
          description="编辑角色基础定义。角色回复统一使用当前默认模型。"
        />

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <EditorFormLayout
            sidebar={(
              <>
                <EditorFormSidebarCard
                  icon={UserRoundCog}
                  title={name.trim() || "未命名角色"}
                  image={(
                    <button
                      type="button"
                      className="flex size-24 shrink-0 items-center justify-center rounded-xl border bg-background p-1.5 shadow-xs transition-all hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-label={`更换头像：${selectedAvatar.label}`}
                      aria-haspopup="dialog"
                      aria-expanded={isAvatarPickerOpen}
                      onClick={() => setIsAvatarPickerOpen(true)}
                    >
                      <img
                        src={selectedAvatar.src}
                        alt=""
                        className="size-full rounded-lg object-cover"
                      />
                    </button>
                  )}
                  meta={<EditorStatusPill tone="active">当前角色</EditorStatusPill>}
                >
                  <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                    <div className="rounded-md bg-background/65 px-3 py-2 ring-1 ring-border/60">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <Bot className="size-3.5 text-primary" />
                        默认模型
                      </div>
                      <div className="mt-1 line-clamp-2">{roomModelLabel}</div>
                    </div>
                    <p className="line-clamp-4">
                      {description.trim() || "还没有填写角色设定。"}
                    </p>
                  </div>
                </EditorFormSidebarCard>

                <EditorFormNav
                  items={[
                    { href: "#tavern-character-basic-section", icon: UserRoundCog, label: "基础信息" },
                    { href: "#tavern-character-description-section", icon: BookOpenText, label: "角色设定" },
                    { href: "#tavern-character-speaking-section", icon: MessageCircle, label: "说话方式" },
                    { href: "#tavern-character-style-section", icon: ShieldCheck, label: "风格规则" },
                    { href: "#tavern-character-goal-section", icon: Target, label: "目标关系" },
                  ]}
                />
              </>
            )}
          >
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <EditorFormCard
              id="tavern-character-basic-section"
              icon={UserRoundCog}
              title="基础信息"
              description="角色名称用于聊天展示与调度识别。"
            >
              <label className="block space-y-1.5" htmlFor="tavern-character-name">
                <span className="text-xs font-medium text-muted-foreground">角色名称</span>
                <Input
                  id="tavern-character-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </EditorFormCard>

            <EditorFormCard
              id="tavern-character-description-section"
              icon={BookOpenText}
              title="角色设定"
              action={renderTextFieldHeader({
                label: "角色设定",
                fieldKey: "characterDescription",
                fieldLabel: "角色设定",
                currentText: description,
                applyText: setDescription,
              })}
            >
              <Textarea
                id="tavern-character-description"
                value={description}
                className="min-h-[132px] resize-none text-sm leading-6"
                onChange={(event) => setDescription(event.target.value)}
              />
            </EditorFormCard>

            <EditorFormCard
              id="tavern-character-speaking-section"
              icon={MessageCircle}
              title="说话方式"
              action={renderTextFieldHeader({
                label: "说话方式",
                fieldKey: "characterSpeakingStyle",
                fieldLabel: "角色说话方式",
                currentText: speakingStyle,
                applyText: setSpeakingStyle,
              })}
            >
              <Textarea
                id="tavern-character-style"
                value={speakingStyle}
                className="min-h-[96px] resize-none text-sm leading-6"
                onChange={(event) => setSpeakingStyle(event.target.value)}
              />
            </EditorFormCard>

            <div className="grid gap-3 lg:grid-cols-2">
              <EditorFormCard
                id="tavern-character-style-section"
                icon={ShieldCheck}
                title="写作风格"
                action={renderTextFieldHeader({
                  label: "写作风格",
                  fieldKey: "characterWritingStyle",
                  fieldLabel: "角色写作风格",
                  currentText: writingStyle,
                  applyText: setWritingStyle,
                })}
              >
                <Textarea
                  id="tavern-character-writing-style"
                  value={writingStyle}
                  className="min-h-[86px] resize-none text-sm leading-6"
                  onChange={(event) => setWritingStyle(event.target.value)}
                />
              </EditorFormCard>
              <EditorFormCard
                icon={ShieldCheck}
                title="回复规则"
                action={renderTextFieldHeader({
                  label: "回复规则",
                  fieldKey: "characterReplyStylePrompt",
                  fieldLabel: "角色回复规则",
                  currentText: replyStylePrompt,
                  applyText: setReplyStylePrompt,
                })}
              >
                <Textarea
                  id="tavern-character-reply-style-prompt"
                  value={replyStylePrompt}
                  className="min-h-[86px] resize-none text-sm leading-6"
                  onChange={(event) => setReplyStylePrompt(event.target.value)}
                />
              </EditorFormCard>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <EditorFormCard
                id="tavern-character-goal-section"
                icon={Target}
                title="目标"
                action={renderTextFieldHeader({
                  label: "目标",
                  fieldKey: "characterGoals",
                  fieldLabel: "角色目标",
                  currentText: goals,
                  applyText: setGoals,
                })}
              >
                <Textarea
                  id="tavern-character-goals"
                  value={goals}
                  className="min-h-[86px] resize-none text-sm leading-6"
                  onChange={(event) => setGoals(event.target.value)}
                />
              </EditorFormCard>
              <EditorFormCard
                icon={UsersRound}
                title="关系"
                action={renderTextFieldHeader({
                  label: "关系",
                  fieldKey: "characterRelationships",
                  fieldLabel: "角色关系",
                  currentText: relationships,
                  applyText: setRelationships,
                })}
              >
                <Textarea
                  id="tavern-character-relationships"
                  value={relationships}
                  className="min-h-[86px] resize-none text-sm leading-6"
                  onChange={(event) => setRelationships(event.target.value)}
                />
              </EditorFormCard>
            </div>
          </EditorFormLayout>

          <EditorFormFooter
            status="保存后角色定义会立即更新。"
          >
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">
              <Save className="size-4" />
              保存角色
            </Button>
          </EditorFormFooter>
        </form>
      </EditorFormDialogContent>

      <Dialog open={isAvatarPickerOpen} onOpenChange={setIsAvatarPickerOpen}>
        <DialogContent className="!flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>选择头像</DialogTitle>
            <DialogDescription>
              {name.trim() ? `为「${name.trim()}」选择角色头像。` : "为角色选择头像。"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="max-h-[min(70vh,640px)] space-y-5 px-5 py-4">
              {tavernAvatarGroups.map((group) => (
                <section key={group.id} className="space-y-2">
                  <div>
                    <div className="text-xs font-medium text-foreground">{group.label}</div>
                    <div className="text-[11px] leading-4 text-muted-foreground">
                      {group.description}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
                    {group.options.map((avatarOption) => {
                      const isSelected = avatar === avatarOption.id;

                      return (
                        <button
                          key={avatarOption.id}
                          type="button"
                          className={cn(
                            "group relative rounded-md border bg-card p-1.5 text-left shadow-xs transition-all hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            isSelected
                              ? "border-primary/50 ring-1 ring-primary/20"
                              : "border-transparent",
                          )}
                          title={avatarOption.label}
                          aria-label={`选择头像：${avatarOption.label}`}
                          aria-pressed={isSelected}
                          onClick={() => {
                            setAvatar(avatarOption.id);
                            setIsAvatarPickerOpen(false);
                          }}
                        >
                          <img
                            src={avatarOption.src}
                            alt=""
                            className="aspect-square w-full rounded-md object-cover"
                          />
                          <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                            {avatarOption.label}
                          </span>
                          {isSelected && (
                            <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                              <Check className="size-3.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="relative z-10 shrink-0 border-t bg-popover px-5 py-4 shadow-[0_-12px_24px_-24px_rgb(15_23_42_/_0.45)]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAvatarPickerOpen(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
