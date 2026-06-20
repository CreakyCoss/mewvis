import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Save, Sparkles } from "lucide-react";
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

  const renderModelControls = () => (
    <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
      当前使用默认模型：{roomModelLabel}
    </div>
  );

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
      return <span className="text-xs font-medium text-muted-foreground">{label}</span>;
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
      <span className="flex min-h-5 items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
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
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{character ? "编辑角色" : "新建角色"}</DialogTitle>
          <DialogDescription>
            编辑角色基础定义。角色回复统一使用当前默认模型。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-5 py-4">
            {formError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
              <button
                type="button"
                className="flex aspect-square w-full items-center justify-center rounded-md border bg-background p-1.5 shadow-xs transition-all hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`更换头像：${selectedAvatar.label}`}
                aria-haspopup="dialog"
                aria-expanded={isAvatarPickerOpen}
                onClick={() => setIsAvatarPickerOpen(true)}
              >
                <img
                  src={selectedAvatar.src}
                  alt=""
                  className="size-full rounded-[5px] object-cover"
                />
              </button>

              <div className="min-w-0 space-y-3">
                <label className="block space-y-1.5" htmlFor="tavern-character-name">
                  <span className="text-xs font-medium text-muted-foreground">角色名称</span>
                  <Input
                    id="tavern-character-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                {renderModelControls()}
              </div>
            </div>

            <label className="block space-y-1.5" htmlFor="tavern-character-description">
              {renderTextFieldHeader({
                label: "角色设定",
                fieldKey: "characterDescription",
                fieldLabel: "角色设定",
                currentText: description,
                applyText: setDescription,
              })}
              <Textarea
                id="tavern-character-description"
                value={description}
                className="min-h-[112px] resize-none text-sm leading-6"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="block space-y-1.5" htmlFor="tavern-character-style">
              {renderTextFieldHeader({
                label: "说话方式",
                fieldKey: "characterSpeakingStyle",
                fieldLabel: "角色说话方式",
                currentText: speakingStyle,
                applyText: setSpeakingStyle,
              })}
              <Textarea
                id="tavern-character-style"
                value={speakingStyle}
                className="min-h-[88px] resize-none text-sm leading-6"
                onChange={(event) => setSpeakingStyle(event.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5" htmlFor="tavern-character-writing-style">
                {renderTextFieldHeader({
                  label: "写作风格",
                  fieldKey: "characterWritingStyle",
                  fieldLabel: "角色写作风格",
                  currentText: writingStyle,
                  applyText: setWritingStyle,
                })}
                <Textarea
                  id="tavern-character-writing-style"
                  value={writingStyle}
                  className="min-h-[76px] resize-none text-sm leading-6"
                  onChange={(event) => setWritingStyle(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5" htmlFor="tavern-character-reply-style-prompt">
                {renderTextFieldHeader({
                  label: "回复规则",
                  fieldKey: "characterReplyStylePrompt",
                  fieldLabel: "角色回复规则",
                  currentText: replyStylePrompt,
                  applyText: setReplyStylePrompt,
                })}
                <Textarea
                  id="tavern-character-reply-style-prompt"
                  value={replyStylePrompt}
                  className="min-h-[76px] resize-none text-sm leading-6"
                  onChange={(event) => setReplyStylePrompt(event.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5" htmlFor="tavern-character-goals">
                {renderTextFieldHeader({
                  label: "目标",
                  fieldKey: "characterGoals",
                  fieldLabel: "角色目标",
                  currentText: goals,
                  applyText: setGoals,
                })}
                <Textarea
                  id="tavern-character-goals"
                  value={goals}
                  className="min-h-[76px] resize-none text-sm leading-6"
                  onChange={(event) => setGoals(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5" htmlFor="tavern-character-relationships">
                {renderTextFieldHeader({
                  label: "关系",
                  fieldKey: "characterRelationships",
                  fieldLabel: "角色关系",
                  currentText: relationships,
                  applyText: setRelationships,
                })}
                <Textarea
                  id="tavern-character-relationships"
                  value={relationships}
                  className="min-h-[76px] resize-none text-sm leading-6"
                  onChange={(event) => setRelationships(event.target.value)}
                />
              </label>
            </div>

          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSubmit}>
            <Save className="size-4" />
            保存角色
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={isAvatarPickerOpen} onOpenChange={setIsAvatarPickerOpen}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
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

          <DialogFooter className="border-t px-5 py-4">
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
