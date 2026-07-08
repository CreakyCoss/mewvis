import {
  Braces,
  FilePlus2,
  Goal,
  MessageSquareText,
  Plus,
  Save,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { cloneDeep } from "lodash-es";
import type { Ref } from "react";
import { useImperativeHandle, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getTavernCharacterStylePreset } from "../../../tavern/prompt-registry/character-style-presets";
import {
  TAVERN_PRESENTATION_PROFILE_OPTIONS,
  getTavernPresentationProfile,
  normalizeTavernPresentation,
  normalizeTavernPresentationProfileId,
} from "../../../tavern/prompt-registry/presentation-rules";
import {
  TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS,
  getTavernSystemNarrativePreset,
  normalizeTavernSystemNarrativePresetId,
} from "../../../tavern/prompt-registry/system-narrative-styles";
import {
  DEFAULT_TAVERN_PROMPT_STYLE_PACKAGE_ID,
  TAVERN_PROMPT_STYLE_PACKAGE_OPTIONS,
  TAVERN_PROMPT_STYLE_PACKAGES,
  createTavernPromptSettingsFromStylePackage,
  getTavernPromptStylePackage,
  normalizeTavernPromptStylePackageId,
  type TavernPromptStylePackageId,
} from "../../../tavern/prompt-registry/style-packages";
import {
  createDefaultTavernPromptSettings,
  createRoomStylePromptBlocks,
  createSystemNarrativePromptBlocks,
  normalizeTavernPromptSettings,
} from "../../../tavern/prompt-registry/text-blocks";
import {
  TAVERN_PROMPT_STYLE_PRESETS,
  getTavernPromptStylePreset,
  normalizeTavernPromptStyleId,
} from "../../../tavern/presentation/prompt-styles";
import type {
  TavernPresentationProfileId,
  TavernPromptBlock,
  TavernPromptBlockSourceType,
  TavernPromptBlockTarget,
  TavernPromptStyleId,
  TavernRoom,
  TavernRoomPromptSettings,
  TavernSystemNarrativePresetId,
} from "@/features/pages/taverns/manage/model";
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
import { editorControlClassName, emptyValueText } from "../../utils";
import type { ModuleSave } from "../types";

export type PromptEditHandle = (data?: TavernRoom) => void;

type PromptPresetDraft = {
  stylePackageId: TavernPromptStylePackageId;
  systemNarrativePresetId: TavernSystemNarrativePresetId;
  roomStyleId: TavernPromptStyleId;
};

type PromptDraft = {
  presentationProfileId: TavernPresentationProfileId;
  prompt: TavernRoomPromptSettings;
  presets: PromptPresetDraft;
};

type PromptEditProps = {
  bind: Ref<PromptEditHandle>;
  data: TavernRoom;
  onSave: ModuleSave;
};

const selectClassName = cn(editorControlClassName, "min-h-9");

const promptBlockTargets: Array<{
  id: TavernPromptBlockTarget;
  label: string;
  description: string;
}> = [
  {
    id: "bridge",
    label: "整理员",
    description: "负责整理历史、资料和请求上下文，不能改变输出协议。",
  },
  {
    id: "director",
    label: "导演",
    description: "负责调度发言、节奏和场景推进，不能写最终角色正文。",
  },
  {
    id: "character",
    label: "角色",
    description: "负责最终可见内容、角色口吻和局部描写。",
  },
];

const sourceTypeLabels: Record<TavernPromptBlockSourceType, string> = {
  system_narrative: "系统叙事",
  room_style: "酒馆风格",
  platform_style: "平台偏好",
  quality_rule: "质量规则",
  narrative_style: "叙事套路",
  genre_rule: "题材规则",
  hook_rule: "钩子规则",
  taboo_rule: "雷点边界",
  custom: "自定义",
};

const getGenerationContractLabel = (profileId: TavernPresentationProfileId) => {
  const profile = getTavernPresentationProfile(profileId);

  if (profile.generationContract === "character_narrative_beat") {
    return "小说段落合同";
  }

  return "角色回复合同";
};

const sortPromptBlocks = (blocks: TavernPromptBlock[]) =>
  [...blocks].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));

const clonePromptBlock = (block: TavernPromptBlock): TavernPromptBlock => cloneDeep(block);

const clonePromptSettings = (prompt: TavernRoomPromptSettings): TavernRoomPromptSettings => ({
  version: 1,
  blocks: sortPromptBlocks(prompt.blocks.map(clonePromptBlock)),
});

const getFirstSourceId = (prompt: TavernRoomPromptSettings, sourceType: TavernPromptBlockSourceType) =>
  prompt.blocks.find((block) => block.source?.type === sourceType)?.source?.id;

const getPromptPresetDraft = (
  prompt: TavernRoomPromptSettings,
  presentationProfileId: TavernPresentationProfileId,
): PromptPresetDraft => {
  const systemNarrativePresetId = normalizeTavernSystemNarrativePresetId(getFirstSourceId(prompt, "system_narrative"));
  const roomStyleId = normalizeTavernPromptStyleId(getFirstSourceId(prompt, "room_style"));
  const matchedStylePackage = TAVERN_PROMPT_STYLE_PACKAGES.find(
    (stylePackage) =>
      stylePackage.presentationProfileId === presentationProfileId &&
      stylePackage.systemNarrativePresetId === systemNarrativePresetId &&
      stylePackage.promptStyleId === roomStyleId,
  );

  return {
    stylePackageId: matchedStylePackage?.id ?? DEFAULT_TAVERN_PROMPT_STYLE_PACKAGE_ID,
    systemNarrativePresetId,
    roomStyleId,
  };
};

const replaceBlocksBySourceTypes = ({
  prompt,
  sourceTypes,
  nextBlocks,
}: {
  prompt: TavernRoomPromptSettings;
  sourceTypes: TavernPromptBlockSourceType[];
  nextBlocks: TavernPromptBlock[];
}): TavernRoomPromptSettings => ({
  version: 1,
  blocks: sortPromptBlocks([
    ...prompt.blocks.filter((block) => !block.source || !sourceTypes.includes(block.source.type)),
    ...nextBlocks.map(clonePromptBlock),
  ]),
});

const updatePromptBlock = (
  prompt: TavernRoomPromptSettings,
  blockId: string,
  updater: (block: TavernPromptBlock) => TavernPromptBlock,
): TavernRoomPromptSettings => ({
  version: 1,
  blocks: sortPromptBlocks(
    prompt.blocks.map((block) => (block.id === blockId ? updater(clonePromptBlock(block)) : clonePromptBlock(block))),
  ),
});

const removePromptBlock = (prompt: TavernRoomPromptSettings, blockId: string): TavernRoomPromptSettings => ({
  version: 1,
  blocks: prompt.blocks.filter((block) => block.id !== blockId).map(clonePromptBlock),
});

const createCustomPromptBlock = (
  prompt: TavernRoomPromptSettings,
  target: TavernPromptBlockTarget,
): TavernPromptBlock => {
  const nextIndex = prompt.blocks.length + 1;
  const nextOrder = Math.max(0, ...prompt.blocks.map((block) => block.order)) + 10;
  const id = `custom:${target}:${Date.now().toString(36)}:${nextIndex}`;

  return {
    id,
    target,
    label: "自定义提示词",
    text: "",
    enabled: true,
    order: nextOrder,
    source: {
      type: "custom",
      id,
      label: "自定义",
    },
  };
};

const isImmersiveDescriptionEnabled = (room: TavernRoom) => room.settings.immersiveDescriptionEnabled !== false;

const createPromptFallback = (room: TavernRoom, presentationProfileId: TavernPresentationProfileId) =>
  createDefaultTavernPromptSettings({
    presentationProfileId,
    immersiveDescriptionEnabled: isImmersiveDescriptionEnabled(room),
  });

export const PromptEdit = ({ bind, data, onSave }: PromptEditProps) => {
  const [draft, setDraft] = useState<PromptDraft | null>(null);

  const open = (nextData = data) => {
    const presentationProfileId = normalizeTavernPresentationProfileId(nextData.presentation?.profileId);
    const prompt = normalizeTavernPromptSettings(
      nextData.prompt,
      createPromptFallback(nextData, presentationProfileId),
    );

    setDraft({
      presentationProfileId,
      prompt: clonePromptSettings(prompt),
      presets: getPromptPresetDraft(prompt, presentationProfileId),
    });
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
  };

  const patchDraftPrompt = (
    updater: (prompt: TavernRoomPromptSettings, current: PromptDraft) => TavernRoomPromptSettings,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            prompt: updater(current.prompt, current),
          }
        : current,
    );
  };

  const applySystemNarrativePreset = () => {
    patchDraftPrompt((prompt, current) =>
      replaceBlocksBySourceTypes({
        prompt,
        sourceTypes: ["system_narrative"],
        nextBlocks: createSystemNarrativePromptBlocks({
          presetId: current.presets.systemNarrativePresetId,
          presentationProfileId: current.presentationProfileId,
          immersiveDescriptionEnabled: isImmersiveDescriptionEnabled(data),
        }),
      }),
    );
  };

  const applyStylePackagePreset = () => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const stylePackage = getTavernPromptStylePackage(current.presets.stylePackageId);
      const nextPresentationProfileId = stylePackage.presentationProfileId;

      return {
        ...current,
        presentationProfileId: nextPresentationProfileId,
        presets: {
          stylePackageId: stylePackage.id,
          systemNarrativePresetId: stylePackage.systemNarrativePresetId,
          roomStyleId: stylePackage.promptStyleId,
        },
        prompt: createTavernPromptSettingsFromStylePackage({
          stylePackageId: stylePackage.id,
          presentationProfileId: nextPresentationProfileId,
          immersiveDescriptionEnabled: isImmersiveDescriptionEnabled(data),
        }),
      };
    });
  };

  const applyRoomStylePreset = () => {
    patchDraftPrompt((prompt, current) =>
      replaceBlocksBySourceTypes({
        prompt,
        sourceTypes: ["room_style"],
        nextBlocks: createRoomStylePromptBlocks({
          promptStyleId: current.presets.roomStyleId,
        }),
      }),
    );
  };

  const addCustomBlock = (target: TavernPromptBlockTarget) => {
    patchDraftPrompt((prompt) => ({
      version: 1,
      blocks: sortPromptBlocks([...prompt.blocks.map(clonePromptBlock), createCustomPromptBlock(prompt, target)]),
    }));
  };

  const save = () => {
    if (!draft) {
      return;
    }

    const basePresentation = normalizeTavernPresentation(data.presentation);
    const nextPresentation = {
      ...basePresentation,
      profileId: normalizeTavernPresentationProfileId(draft.presentationProfileId),
      profileVersion: 1 as const,
    };

    onSave({
      presentation: nextPresentation,
      prompt: normalizeTavernPromptSettings(
        {
          version: 1,
          blocks: sortPromptBlocks(draft.prompt.blocks).map(clonePromptBlock),
        },
        createPromptFallback(data, nextPresentation.profileId),
      ),
    });
    close();
  };

  const selectedPresentationProfile = draft ? getTavernPresentationProfile(draft.presentationProfileId) : null;
  const selectedStylePackage = draft ? getTavernPromptStylePackage(draft.presets.stylePackageId) : null;
  const selectedPackageCharacterStyle = selectedStylePackage
    ? getTavernCharacterStylePreset(selectedStylePackage.characterStylePresetId)
    : null;
  const selectedSystemNarrativePreset = draft
    ? getTavernSystemNarrativePreset(draft.presets.systemNarrativePresetId)
    : null;
  const selectedRoomStyle = draft ? getTavernPromptStylePreset(draft.presets.roomStyleId) : null;
  const enabledBlockCount = draft
    ? draft.prompt.blocks.filter((block) => block.enabled && block.text.trim()).length
    : 0;
  const totalBlockCount = draft?.prompt.blocks.length ?? 0;
  const blocksByTarget = useMemo(() => {
    if (!draft) {
      return new Map<TavernPromptBlockTarget, TavernPromptBlock[]>();
    }

    return new Map(
      promptBlockTargets.map((target) => [
        target.id,
        draft.prompt.blocks.filter((block) => block.target === target.id),
      ]),
    );
  }, [draft]);

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
        <EditorFormDialogContent className="sm:max-w-6xl">
          <EditorFormHeader
            icon={ScrollText}
            title="编辑提示词"
            description="输出协议由系统底层控制；其他提示词以文本块保存，可引用预设后自由调整。"
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <EditorFormLayout
              sidebar={
                <>
                  <EditorFormSidebarCard
                    icon={ScrollText}
                    title={data.title.trim() || emptyValueText}
                    meta={
                      <>
                        <EditorStatusPill tone="info">
                          {selectedPresentationProfile?.label ?? emptyValueText}
                        </EditorStatusPill>
                        <EditorStatusPill tone={enabledBlockCount > 0 ? "active" : "muted"}>
                          {enabledBlockCount}/{totalBlockCount} 块启用
                        </EditorStatusPill>
                      </>
                    }
                  >
                    <p className="text-xs leading-5 text-muted-foreground">
                      {selectedPresentationProfile?.description ?? "选择一个呈现结构。"}
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="系统控制层">
                    <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                      <div className="flex items-center gap-2 text-sm font-medium leading-5 text-foreground">
                        <ShieldCheck className="size-4 text-primary" />
                        <span className="min-w-0 truncate">
                          {getGenerationContractLabel(draft.presentationProfileId)}
                        </span>
                      </div>
                      <p>输出协议、XML 标签和可见性边界不会保存为可编辑文本。</p>
                    </div>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-prompt-structure-section", icon: MessageSquareText, label: "系统层" },
                      { href: "#tavern-prompt-presets-section", icon: FilePlus2, label: "引用预设" },
                      { href: "#tavern-prompt-blocks-section", icon: Braces, label: "文本块" },
                    ]}
                  />
                </>
              }
            >
              <EditorFormCard
                id="tavern-prompt-structure-section"
                icon={MessageSquareText}
                title="系统层"
                description="呈现规则仍由底层协议控制，决定可见标签、输出形态和解析合同。"
              >
                <div className="grid gap-3">
                  <EditorField
                    label="呈现规则"
                    htmlFor="tavern-prompt-presentation-profile"
                    description={selectedPresentationProfile?.description}
                  >
                    <NativeSelect
                      id="tavern-prompt-presentation-profile"
                      value={draft.presentationProfileId}
                      className={selectClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          presentationProfileId: normalizeTavernPresentationProfileId(event.target.value),
                        })
                      }
                    >
                      {TAVERN_PRESENTATION_PROFILE_OPTIONS.map((profile) => (
                        <NativeSelectOption key={profile.id} value={profile.id}>
                          {profile.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                </div>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-prompt-presets-section"
                icon={FilePlus2}
                title="引用预设"
                description="引用会替换同类来源文本块；保存后只保留文本，之后预设更新不会影响当前房间。"
              >
                <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <EditorField
                    label="风格套餐"
                    htmlFor="tavern-prompt-style-package-preset"
                    description={selectedStylePackage?.description}
                    action={
                      <Button type="button" size="sm" variant="outline" onClick={applyStylePackagePreset}>
                        <Sparkles className="size-3.5" />
                        引用套餐
                      </Button>
                    }
                  >
                    <NativeSelect
                      id="tavern-prompt-style-package-preset"
                      value={draft.presets.stylePackageId}
                      className={selectClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          presets: {
                            ...draft.presets,
                            stylePackageId: normalizeTavernPromptStylePackageId(event.target.value),
                          },
                        })
                      }
                    >
                      {TAVERN_PROMPT_STYLE_PACKAGE_OPTIONS.map((stylePackage) => (
                        <NativeSelectOption key={stylePackage.id} value={stylePackage.id}>
                          {stylePackage.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>

                  <div className="rounded-lg border border-border/70 bg-background/72 p-3 text-xs leading-5 text-muted-foreground shadow-xs">
                    <div className="font-medium text-foreground">
                      {selectedStylePackage?.evaluationSummary ?? "选择一套推荐组合。"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedStylePackage && (
                        <EditorStatusPill tone="active">Codex {selectedStylePackage.codexReviewScore}</EditorStatusPill>
                      )}
                      {selectedStylePackage?.strengths.map((strength) => (
                        <EditorStatusPill key={strength} tone="info">
                          {strength}
                        </EditorStatusPill>
                      ))}
                      {selectedStylePackage && (
                        <EditorStatusPill tone="muted">
                          角色风格：
                          {selectedPackageCharacterStyle?.label ?? selectedStylePackage.characterStylePresetId}
                        </EditorStatusPill>
                      )}
                    </div>
                    {selectedStylePackage && <div className="mt-2">{selectedStylePackage.codexReviewNote}</div>}
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  <EditorField
                    label="系统叙事"
                    htmlFor="tavern-prompt-system-narrative-preset"
                    description={selectedSystemNarrativePreset?.description}
                    action={
                      <Button type="button" size="sm" variant="outline" onClick={applySystemNarrativePreset}>
                        <Sparkles className="size-3.5" />
                        引用
                      </Button>
                    }
                  >
                    <NativeSelect
                      id="tavern-prompt-system-narrative-preset"
                      value={draft.presets.systemNarrativePresetId}
                      className={selectClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          presets: {
                            ...draft.presets,
                            systemNarrativePresetId: normalizeTavernSystemNarrativePresetId(event.target.value),
                          },
                        })
                      }
                    >
                      {TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS.map((preset) => (
                        <NativeSelectOption key={preset.id} value={preset.id}>
                          {preset.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>

                  <EditorField
                    label="酒馆风格"
                    htmlFor="tavern-prompt-room-style-preset"
                    description={selectedRoomStyle?.description}
                    action={
                      <Button type="button" size="sm" variant="outline" onClick={applyRoomStylePreset}>
                        <Wand2 className="size-3.5" />
                        引用
                      </Button>
                    }
                  >
                    <NativeSelect
                      id="tavern-prompt-room-style-preset"
                      value={draft.presets.roomStyleId}
                      className={selectClassName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          presets: {
                            ...draft.presets,
                            roomStyleId: normalizeTavernPromptStyleId(event.target.value),
                          },
                        })
                      }
                    >
                      {TAVERN_PROMPT_STYLE_PRESETS.map((preset) => (
                        <NativeSelectOption key={preset.id} value={preset.id}>
                          {preset.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>
                </div>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-prompt-blocks-section"
                icon={Braces}
                title="文本块"
                description="运行时按 target 注入对应 Agent；可关闭、删除或直接改写任意文本块。"
              >
                <div className="space-y-4">
                  {promptBlockTargets.map((target) => {
                    const blocks = blocksByTarget.get(target.id) ?? [];

                    return (
                      <section key={target.id} className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold leading-5">
                              <EditorStatusPill tone={blocks.length > 0 ? "info" : "muted"}>
                                {target.label}
                              </EditorStatusPill>
                              <span className="text-xs font-normal text-muted-foreground">
                                {blocks.filter((block) => block.enabled).length}/{blocks.length} 块启用
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{target.description}</p>
                          </div>
                          <Button type="button" size="sm" variant="outline" onClick={() => addCustomBlock(target.id)}>
                            <Plus className="size-3.5" />
                            添加
                          </Button>
                        </div>

                        {blocks.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border/80 px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
                            暂无文本块。
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {blocks.map((block) => {
                              const textAreaId = `tavern-prompt-block-${block.id}`;
                              const sourceLabel = block.source
                                ? `${sourceTypeLabels[block.source.type]} / ${block.source.label}`
                                : "自定义";

                              return (
                                <div
                                  key={block.id}
                                  id={`tavern-prompt-block-card-${block.id}`}
                                  tabIndex={-1}
                                  className={cn(
                                    "rounded-lg border border-border/70 bg-background/72 p-3 shadow-xs transition-[border-color,box-shadow]",
                                    !block.enabled && "opacity-70",
                                  )}
                                >
                                  <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                                    <div className="min-w-0 space-y-2">
                                      <input
                                        id={`tavern-prompt-block-label-${block.id}`}
                                        value={block.label}
                                        className={cn(editorControlClassName, "h-9 w-full px-3 text-sm font-semibold")}
                                        aria-label={`${target.label}文本块标题`}
                                        onChange={(event) => {
                                          patchDraftPrompt((prompt) =>
                                            updatePromptBlock(prompt, block.id, (nextBlock) => ({
                                              ...nextBlock,
                                              label: event.target.value,
                                            })),
                                          );
                                        }}
                                      />
                                      <div className="flex flex-wrap items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                                        <EditorStatusPill tone={block.enabled ? "active" : "muted"}>
                                          {block.enabled ? "启用" : "关闭"}
                                        </EditorStatusPill>
                                        <span>{sourceLabel}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={block.enabled}
                                        onCheckedChange={(checked) => {
                                          patchDraftPrompt((prompt) =>
                                            updatePromptBlock(prompt, block.id, (nextBlock) => ({
                                              ...nextBlock,
                                              enabled: checked === true,
                                            })),
                                          );
                                        }}
                                        aria-label={`切换${block.label}`}
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          patchDraftPrompt((prompt) => removePromptBlock(prompt, block.id));
                                        }}
                                        aria-label={`删除${block.label}`}
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <label
                                    htmlFor={textAreaId}
                                    className="mt-2 flex min-h-6 items-center justify-between gap-2 text-xs font-medium text-muted-foreground"
                                  >
                                    <span>文本</span>
                                  </label>
                                  <Textarea
                                    id={textAreaId}
                                    value={block.text}
                                    placeholder="写入要注入到该 Agent 的提示词文本。"
                                    className={cn("mt-1 min-h-32 resize-y text-sm leading-6", editorControlClassName)}
                                    onChange={(event) => {
                                      patchDraftPrompt((prompt) =>
                                        updatePromptBlock(prompt, block.id, (nextBlock) => ({
                                          ...nextBlock,
                                          text: event.target.value,
                                        })),
                                      );
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </EditorFormCard>
            </EditorFormLayout>

            <EditorFormFooter
              status={
                <span className="inline-flex items-center gap-1.5">
                  <Goal className="size-3.5" />
                  保存后会影响后续整理员、导演与角色请求
                </span>
              }
            >
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <Save className="size-4" />
                保存提示词
              </Button>
            </EditorFormFooter>
          </form>
        </EditorFormDialogContent>
      )}
    </Dialog>
  );
};
