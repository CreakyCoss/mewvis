import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  Bot,
  Check,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  TavernCharacter,
  TavernCharacterRelationship,
  TavernRelationshipTarget,
} from "../../../../../types";
import {
  tavernRelationshipTargetLabel,
} from "../../../../../core/relationships";
import type { TavernTextFieldAgentRequest } from "../../../../../runtime/assistants";
import {
  TAVERN_CHARACTER_STYLE_PRESETS,
  getTavernCharacterStylePreset,
  normalizeTavernCharacterStylePresetId,
} from "../../../../../prompt-registry/character-style-presets";
import {
  EditorField,
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
  relationships: TavernCharacterRelationship[];
};

type CharacterFormDialogProps = {
  open: boolean;
  character: TavernCharacter | null;
  availableCharacters: TavernCharacter[];
  roomModelLabel?: string;
  onRunTextFieldAgent?: (request: TavernTextFieldAgentRequest) => Promise<string>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: CharacterFormValue) => void;
};

type CharacterStyleFieldKey = "speakingStyle" | "writingStyle" | "replyStylePrompt";

const characterStyleSectionLabels: Array<{
  key: CharacterStyleFieldKey;
  labels: string[];
}> = [
  {
    key: "speakingStyle",
    labels: ["说话方式", "角色说话方式"],
  },
  {
    key: "writingStyle",
    labels: ["写作风格", "角色写作风格"],
  },
  {
    key: "replyStylePrompt",
    labels: ["回复规则", "角色回复规则"],
  },
];

const formatCharacterStyleText = ({
  speakingStyle,
  writingStyle,
  replyStylePrompt,
}: {
  speakingStyle: string;
  writingStyle: string;
  replyStylePrompt: string;
}) => [
  ["说话方式", speakingStyle],
  ["写作风格", writingStyle],
  ["回复规则", replyStylePrompt],
].map(([label, value]) => `${label}：\n${value.trim()}`).join("\n\n");

const parseCharacterStyleText = (text: string): Partial<Record<CharacterStyleFieldKey, string>> | null => {
  const result: Partial<Record<CharacterStyleFieldKey, string>> = {};
  let activeKey: CharacterStyleFieldKey | null = null;

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const normalizedHeader = trimmed
      .replace(/^#{1,6}\s*/, "")
      .replace(/^(?:[-*+]|\d+[.、])\s*/, "");
    const matchedSection = characterStyleSectionLabels.find((section) =>
      section.labels.some((label) =>
        normalizedHeader === label ||
        normalizedHeader === `${label}:` ||
        normalizedHeader === `${label}：` ||
        normalizedHeader.startsWith(`${label}:`) ||
        normalizedHeader.startsWith(`${label}：`)
      )
    );

    if (matchedSection) {
      activeKey = matchedSection.key;
      const matchedLabel = matchedSection.labels.find((label) =>
        normalizedHeader.startsWith(`${label}:`) || normalizedHeader.startsWith(`${label}：`)
      );
      const inlineText = matchedLabel
        ? normalizedHeader.slice(matchedLabel.length + 1).trim()
        : "";
      if (inlineText) {
        result[activeKey] = [result[activeKey], inlineText].filter(Boolean).join("\n");
      }
      return;
    }

    if (activeKey && trimmed) {
      result[activeKey] = [result[activeKey], line].filter(Boolean).join("\n");
    }
  });

  return Object.values(result).some((value) => value?.trim()) ? result : null;
};

export const CharacterFormDialog = ({
  open,
  character,
  availableCharacters,
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
  const [characterStylePresetId, setCharacterStylePresetId] = useState(
    TAVERN_CHARACTER_STYLE_PRESETS[0]?.id ?? "natural-roleplay",
  );
  const [relationships, setRelationships] = useState<TavernCharacterRelationship[]>([]);
  const [avatar, setAvatar] = useState(normalizeTavernAvatarId(tavernAvatarOptions[0]?.id));
  const [formError, setFormError] = useState("");
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [activeTextFieldAgentKey, setActiveTextFieldAgentKey] = useState("");

  const selectedAvatar = useMemo(
    () => tavernAvatarOptions.find((option) => option.id === avatar) ?? defaultTavernAvatar,
    [avatar],
  );
  const selectedCharacterStylePreset = useMemo(
    () => getTavernCharacterStylePreset(characterStylePresetId),
    [characterStylePresetId],
  );
  const relationshipTargetOptions = useMemo(() => [
    {
      value: "user",
      label: "用户",
      target: { type: "user" } as TavernRelationshipTarget,
    },
    ...availableCharacters
      .filter((item) => item.id !== character?.id)
      .map((item) => ({
        value: `character:${item.id}`,
        label: item.name,
        target: { type: "character", characterId: item.id } as TavernRelationshipTarget,
      })),
  ], [availableCharacters, character?.id]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(character?.name ?? "");
    setDescription(character?.description ?? "");
    setSpeakingStyle(character?.speakingStyle ?? "");
    setWritingStyle(character?.writingStyle ?? "");
    setReplyStylePrompt(character?.replyStylePrompt ?? "");
    setCharacterStylePresetId(TAVERN_CHARACTER_STYLE_PRESETS[0]?.id ?? "natural-roleplay");
    setGoals(character?.goals ?? "");
    setRelationships((character?.relationships ?? []).map((relationship) => ({
      ...relationship,
      tags: [...relationship.tags],
    })));
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

    const nextRelationships = relationships.flatMap((relationship) => {
      const label = relationship.label?.trim() || undefined;
      const attitude = relationship.attitude?.trim() || undefined;
      const publicNote = relationship.publicNote?.trim() || undefined;
      const privateNote = relationship.privateNote?.trim() || undefined;
      const tags = relationship.tags
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8);
      if (!label && !attitude && !publicNote && !privateNote && tags.length === 0) {
        return [];
      }
      return [{
        ...relationship,
        label,
        attitude,
        publicNote,
        privateNote,
        tags,
        updatedAt: Date.now(),
      }];
    });

    onSubmit({
      name: nextName,
      avatar,
      description: nextDescription,
      speakingStyle: nextSpeakingStyle,
      writingStyle: writingStyle.trim() || undefined,
      replyStylePrompt: replyStylePrompt.trim() || undefined,
      goals: goals.trim() || undefined,
      relationships: nextRelationships,
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
      relationships: relationships.map((relationship) => ({
        ...relationship,
        targetLabel: tavernRelationshipTargetLabel(
          relationship.target,
          availableCharacters,
          "用户",
        ),
      })),
    },
  });

  const targetToValue = (target: TavernRelationshipTarget) =>
    target.type === "user" ? "user" : `character:${target.characterId}`;

  const targetFromValue = (value: string): TavernRelationshipTarget => {
    if (value.startsWith("character:")) {
      return {
        type: "character",
        characterId: value.replace(/^character:/, ""),
      };
    }
    return { type: "user" };
  };

  const createRelationshipDraft = (): TavernCharacterRelationship => {
    const usedTargets = new Set(relationships.map((relationship) => targetToValue(relationship.target)));
    const target = relationshipTargetOptions.find((option) => !usedTargets.has(option.value))?.target
      ?? relationshipTargetOptions[0]?.target
      ?? { type: "user" };

    return {
      id: `relationship-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      target,
      label: "",
      attitude: "",
      publicNote: "",
      privateNote: "",
      tags: [],
      updatedAt: Date.now(),
    };
  };

  const updateRelationship = (
    relationshipId: string,
    patch: Partial<TavernCharacterRelationship>,
  ) => {
    setRelationships((current) => current.map((relationship) =>
      relationship.id === relationshipId
        ? {
            ...relationship,
            ...patch,
            updatedAt: Date.now(),
          }
        : relationship
    ));
  };

  const applyCharacterStylePreset = () => {
    const preset = getTavernCharacterStylePreset(characterStylePresetId);
    setSpeakingStyle(preset.speakingStyle);
    setWritingStyle(preset.writingStyle);
    setReplyStylePrompt(preset.replyStylePrompt);
  };

  const runTextFieldAgent = async ({
    mode,
    fieldKey,
    fieldLabel,
    currentText,
    applyText,
    context,
  }: {
    mode: "polish" | "inspire";
    fieldKey: string;
    fieldLabel: string;
    currentText: string;
    applyText: (text: string) => void;
    context?: Record<string, unknown>;
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
        context: {
          ...buildCharacterTextFieldContext(),
          ...(context ?? {}),
        },
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

  const applyCharacterStyleText = (text: string) => {
    const parsed = parseCharacterStyleText(text);
    if (!parsed) {
      setFormError("AI 返回格式无法识别，请保留“说话方式 / 写作风格 / 回复规则”三段标题后重试。");
      return;
    }

    if (parsed.speakingStyle?.trim()) {
      setSpeakingStyle(parsed.speakingStyle.trim());
    }
    if (parsed.writingStyle?.trim()) {
      setWritingStyle(parsed.writingStyle.trim());
    }
    if (parsed.replyStylePrompt?.trim()) {
      setReplyStylePrompt(parsed.replyStylePrompt.trim());
    }
  };

  const renderCharacterStylePresetActions = (): ReactNode => {
    if (!onRunTextFieldAgent) {
      return null;
    }

    const fieldKey = "characterStylePreset";
    const isPolishing = activeTextFieldAgentKey === `${fieldKey}:polish`;
    const isInspiring = activeTextFieldAgentKey === `${fieldKey}:inspire`;
    const isBusy = Boolean(activeTextFieldAgentKey);
    const currentText = formatCharacterStyleText({
      speakingStyle: speakingStyle.trim() || selectedCharacterStylePreset.speakingStyle,
      writingStyle: writingStyle.trim() || selectedCharacterStylePreset.writingStyle,
      replyStylePrompt: replyStylePrompt.trim() || selectedCharacterStylePreset.replyStylePrompt,
    });
    const run = (mode: "polish" | "inspire") => (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      void runTextFieldAgent({
        mode,
        fieldKey,
        fieldLabel: "角色风格预设三段",
        currentText,
        applyText: applyCharacterStyleText,
        context: {
          styleEditingMode: "character_style_preset",
          selectedCharacterStylePreset,
          constraints: [
            "必须输出三段，并保留标题：说话方式、写作风格、回复规则。",
            "只优化角色表达风格，不新增隐藏事实、剧情结论或用户行动。",
            "回复规则只约束当前角色表达，不能覆盖酒馆输出协议或系统标签。",
          ],
        },
      });
    };

    return (
      <span className="flex shrink-0 items-center gap-1" aria-label="角色风格预设 AI 辅助">
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
                title="角色风格预设"
                description="引用后会直接填入说话方式、写作风格和回复规则；保存后与预设脱钩。"
                action={renderCharacterStylePresetActions()}
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <EditorField
                    label="引用预设"
                    htmlFor="tavern-character-style-preset"
                    description={selectedCharacterStylePreset.description}
                  >
                    <NativeSelect
                      id="tavern-character-style-preset"
                      value={characterStylePresetId}
                      className="w-full"
                      onChange={(event) => setCharacterStylePresetId(
                        normalizeTavernCharacterStylePresetId(event.target.value),
                      )}
                    >
                      {TAVERN_CHARACTER_STYLE_PRESETS.map((preset) => (
                        <NativeSelectOption key={preset.id} value={preset.id}>
                          {preset.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                  <Button type="button" variant="outline" onClick={applyCharacterStylePreset}>
                    <Sparkles className="size-4" />
                    引用
                  </Button>
                </div>
              </EditorFormCard>

              <EditorFormCard
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

            <div className="space-y-3">
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
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs leading-5 text-muted-foreground">
                      维护该角色对用户或其他角色的长期基础关系；场景内变化在对应场景中单独覆盖。
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setRelationships((current) => [
                        ...current,
                        createRelationshipDraft(),
                      ])}
                    >
                      <Plus className="size-3.5" />
                      添加
                    </Button>
                  </div>

                  {relationships.length > 0 ? (
                    <div className="space-y-2">
                      {relationships.map((relationship) => (
                        <div
                          key={relationship.id}
                          className="space-y-3 rounded-md border border-border/70 bg-background/80 p-3"
                        >
                          <div className="grid gap-2 md:grid-cols-[minmax(13rem,1fr)_minmax(0,1.15fr)_2rem]">
                            <EditorField
                              label="对象"
                              htmlFor={`tavern-character-relationship-target-${relationship.id}`}
                              className="min-w-0"
                            >
                              <NativeSelect
                                id={`tavern-character-relationship-target-${relationship.id}`}
                                className="w-full"
                                value={targetToValue(relationship.target)}
                                onChange={(event) => updateRelationship(relationship.id, {
                                  target: targetFromValue(event.target.value),
                                })}
                              >
                                {relationshipTargetOptions.map((option) => (
                                  <NativeSelectOption key={option.value} value={option.value}>
                                    {option.label}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </EditorField>
                            <EditorField
                              label="关系标签"
                              htmlFor={`tavern-character-relationship-label-${relationship.id}`}
                            >
                              <Input
                                id={`tavern-character-relationship-label-${relationship.id}`}
                                value={relationship.label ?? ""}
                                placeholder="盟友、旧怨、半信任"
                                onChange={(event) => updateRelationship(relationship.id, {
                                  label: event.target.value,
                                })}
                              />
                            </EditorField>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              className="self-end justify-self-end"
                              title="删除关系"
                              aria-label="删除关系"
                              onClick={() => setRelationships((current) =>
                                current.filter((item) => item.id !== relationship.id)
                              )}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <EditorField
                              label="稳定态度"
                              htmlFor={`tavern-character-relationship-attitude-${relationship.id}`}
                            >
                              <Input
                                id={`tavern-character-relationship-attitude-${relationship.id}`}
                                value={relationship.attitude ?? ""}
                                placeholder="冷淡克制、话里带锋"
                                onChange={(event) => updateRelationship(relationship.id, {
                                  attitude: event.target.value,
                                })}
                              />
                            </EditorField>
                            <EditorField
                              label="标签"
                              htmlFor={`tavern-character-relationship-tags-${relationship.id}`}
                            >
                              <Input
                                id={`tavern-character-relationship-tags-${relationship.id}`}
                                value={relationship.tags.join("、")}
                                placeholder="逗号或顿号分隔"
                                onChange={(event) => updateRelationship(relationship.id, {
                                  tags: event.target.value
                                    .split(/[，,、]/u)
                                    .map((tag) => tag.trim())
                                    .filter(Boolean),
                                })}
                              />
                            </EditorField>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <EditorField
                              label="明面关系"
                              htmlFor={`tavern-character-relationship-public-${relationship.id}`}
                            >
                              <Textarea
                                id={`tavern-character-relationship-public-${relationship.id}`}
                                value={relationship.publicNote ?? ""}
                                className="min-h-[72px] resize-none text-sm leading-6"
                                onChange={(event) => updateRelationship(relationship.id, {
                                  publicNote: event.target.value,
                                })}
                              />
                            </EditorField>
                            <EditorField
                              label="私下判断"
                              htmlFor={`tavern-character-relationship-private-${relationship.id}`}
                            >
                              <Textarea
                                id={`tavern-character-relationship-private-${relationship.id}`}
                                value={relationship.privateNote ?? ""}
                                className="min-h-[72px] resize-none text-sm leading-6"
                                onChange={(event) => updateRelationship(relationship.id, {
                                  privateNote: event.target.value,
                                })}
                              />
                            </EditorField>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed bg-background/70 px-3 py-4 text-center text-sm text-muted-foreground">
                      暂无关系设定。
                    </div>
                  )}
                </div>
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
