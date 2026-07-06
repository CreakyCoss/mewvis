import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Eye,
  FilePlus2,
  Goal,
  ListChecks,
  LocateFixed,
  MessageSquareText,
  Plus,
  Save,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TextSearch,
  Trash2,
  Wand2,
} from "lucide-react";
import type { Ref } from "react";
import { useImperativeHandle, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildTavernPromptPreview,
  type TavernPromptPreviewWarning,
  type TavernPromptPreviewWarningSeverity,
} from "../../../tavern/runtime/prompt/preview";
import { getTavernRuntimeStoryProjection } from "../../../tavern/adapters/story";
import { getTavernCharacterStylePreset } from "../../../tavern/prompt-registry/character-style-presets";
import {
  TAVERN_PRESENTATION_PROFILE_OPTIONS,
  getTavernPresentationProfile,
  isTavernPresentationLocked,
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
import { createTavernRuntimeRoomFromConfig } from "../../../room/model/runtime-room";
import type { TavernRuntimeRoom } from "../../../room/model";
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
  EditorMetricStrip,
  EditorFormNav,
  EditorFormSidebarCard,
  EditorFormSidebarPanel,
  EditorStatusPill,
} from "../../primitives";
import { editorControlClassName, emptyValueText } from "../../utils";
import { resolveTavernPromptWarningNavigation, type TavernPromptWarningNavigationRequest } from "./warning-navigation";
import type { ModuleSave, TextFieldAgentActionRenderer } from "../types";

export type PromptEditHandle = (data?: TavernRoom) => void;

type PromptPresetDraft = {
  stylePackageId: TavernPromptStylePackageId;
  systemNarrativePresetId: TavernSystemNarrativePresetId;
  roomStyleId: TavernPromptStyleId;
};

type PromptDraft = {
  presentationProfileId: TavernPresentationProfileId;
  prompt: TavernRoomPromptSettings;
  immersiveDescriptionEnabled: boolean;
  presets: PromptPresetDraft;
};

type PromptEditProps = {
  bind: Ref<PromptEditHandle>;
  data: TavernRoom;
  onSave: ModuleSave;
  onOpenWarningNavigation?: (request: TavernPromptWarningNavigationRequest) => void;
  renderTextFieldAgentActions: TextFieldAgentActionRenderer;
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

const formatPromptCharCount = (value: number) => {
  if (value >= 10_000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return String(value);
};

const getPromptWarningTone = (severity: TavernPromptPreviewWarningSeverity): "active" | "muted" | "info" | "warning" =>
  severity === "danger" || severity === "warning" ? "warning" : "info";

const getPromptWarningLabel = (severity: TavernPromptPreviewWarningSeverity) => {
  if (severity === "danger") {
    return "阻断";
  }

  if (severity === "warning") {
    return "风险";
  }

  return "提示";
};

const getPromptBlockWarningLocation = (warning: TavernPromptPreviewWarning) =>
  warning.locations?.find((location) => location.type === "prompt_block");

const focusElementById = (id: string) => {
  if (typeof document === "undefined") {
    return false;
  }

  const element = document.getElementById(id) as HTMLElement | null;
  if (!element) {
    return false;
  }

  element.scrollIntoView({ block: "center", behavior: "smooth" });
  const focus = () => {
    element.focus({ preventScroll: true });
  };
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(focus);
  } else {
    focus();
  }
  return true;
};

const focusPromptWarningLocation = (warning: TavernPromptPreviewWarning) => {
  const promptBlockLocation = getPromptBlockWarningLocation(warning);
  if (!promptBlockLocation) {
    return false;
  }

  const fieldElementId =
    promptBlockLocation.field === "label"
      ? `tavern-prompt-block-label-${promptBlockLocation.blockId}`
      : `tavern-prompt-block-${promptBlockLocation.blockId}`;

  return (
    focusElementById(fieldElementId) || focusElementById(`tavern-prompt-block-card-${promptBlockLocation.blockId}`)
  );
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

const clonePromptBlock = (block: TavernPromptBlock): TavernPromptBlock => ({
  ...block,
  source: block.source ? { ...block.source } : undefined,
});

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

const createPromptFallback = (room: TavernRoom, presentationProfileId: TavernPresentationProfileId) =>
  createDefaultTavernPromptSettings({
    presentationProfileId,
    immersiveDescriptionEnabled: room.settings.immersiveDescriptionEnabled !== false,
  });

const buildPromptPreviewRoom = (room: TavernRoom, draft: PromptDraft): TavernRuntimeRoom =>
  createTavernRuntimeRoomFromConfig({
    ...room,
    presentation: {
      ...normalizeTavernPresentation(room.presentation),
      profileId: normalizeTavernPresentationProfileId(draft.presentationProfileId),
      profileVersion: 1,
    },
    prompt: clonePromptSettings(draft.prompt),
    settings: {
      ...room.settings,
      immersiveDescriptionEnabled: draft.immersiveDescriptionEnabled,
    },
  });

const buildPromptBlockAgentContext = ({
  room,
  draft,
  block,
}: {
  room: TavernRoom;
  draft: PromptDraft;
  block: TavernPromptBlock;
}) => {
  const previewRoom = buildPromptPreviewRoom(room, draft);
  const storyProjection = getTavernRuntimeStoryProjection(previewRoom);
  const activeNode = storyProjection.graph.nodes.find((node) => node.id === storyProjection.graph.activeNodeId);

  return {
    promptEditingMode: "saved_prompt_block",
    constraints: [
      "只优化当前提示词文本块，不要输出 JSON、标题或解释。",
      "不要新增、改名或要求 XML 标签；输出协议由 system_contract 和 presentation_profile 控制。",
      "不要把文本写成系统底层不可改规则；保持为用户可编辑的风格、节奏、偏好或边界说明。",
      "保留 target 对应职责：bridge 负责整理，director 负责调度，character 负责角色正文表达。",
    ],
    presentationProfile: getTavernPresentationProfile(draft.presentationProfileId),
    promptBlock: {
      id: block.id,
      target: block.target,
      label: block.label,
      source: block.source,
      enabled: block.enabled,
    },
    relatedPromptBlocks: draft.prompt.blocks
      .filter((item) => item.id !== block.id && item.enabled && item.text.trim())
      .slice(0, 8)
      .map((item) => ({
        target: item.target,
        label: item.label,
        source: item.source,
        text: item.text.slice(0, 800),
      })),
    runtimeStoryProjection: {
      story: storyProjection.story,
      activeNode,
      activeScene: storyProjection.activeScene,
      branch: storyProjection.branch,
    },
  };
};

export const PromptEdit = ({
  bind,
  data,
  onSave,
  onOpenWarningNavigation,
  renderTextFieldAgentActions,
}: PromptEditProps) => {
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  const [error, setError] = useState("");
  const [focusedBlockId, setFocusedBlockId] = useState("");

  const open = (nextData = data) => {
    const presentationProfileId = normalizeTavernPresentationProfileId(nextData.presentation?.profileId);
    const prompt = normalizeTavernPromptSettings(
      nextData.prompt,
      createPromptFallback(nextData, presentationProfileId),
    );

    setError("");
    setDraft({
      presentationProfileId,
      prompt: clonePromptSettings(prompt),
      immersiveDescriptionEnabled: nextData.settings.immersiveDescriptionEnabled !== false,
      presets: getPromptPresetDraft(prompt, presentationProfileId),
    });
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
    setError("");
    setFocusedBlockId("");
  };

  const patchDraftPrompt = (
    updater: (prompt: TavernRoomPromptSettings, current: PromptDraft) => TavernRoomPromptSettings,
  ) => {
    setError("");
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
          immersiveDescriptionEnabled: current.immersiveDescriptionEnabled,
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
      const isPresentationLocked = isTavernPresentationLocked({
        presentation: normalizeTavernPresentation(data.presentation),
        messages: [],
        sceneId: undefined,
      });
      const nextPresentationProfileId = isPresentationLocked
        ? current.presentationProfileId
        : stylePackage.presentationProfileId;

      return {
        ...current,
        presentationProfileId: nextPresentationProfileId,
        immersiveDescriptionEnabled: stylePackage.immersiveDescriptionEnabled,
        presets: {
          stylePackageId: stylePackage.id,
          systemNarrativePresetId: stylePackage.systemNarrativePresetId,
          roomStyleId: stylePackage.promptStyleId,
        },
        prompt: createTavernPromptSettingsFromStylePackage({
          stylePackageId: stylePackage.id,
          presentationProfileId: nextPresentationProfileId,
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

  const locatePromptWarning = (warning: TavernPromptPreviewWarning) => {
    const promptBlockLocation = getPromptBlockWarningLocation(warning);
    if (promptBlockLocation) {
      setFocusedBlockId(promptBlockLocation.blockId);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          setFocusedBlockId((current) => (current === promptBlockLocation.blockId ? "" : current));
        }, 1800);
      }
    }

    if (!focusPromptWarningLocation(warning)) {
      focusElementById("tavern-prompt-preview-section");
    }
  };

  const save = () => {
    if (!draft) {
      return;
    }

    const previewRoom = buildPromptPreviewRoom(data, draft);
    const previewForSave = buildTavernPromptPreview({
      room: previewRoom,
      characters: getTavernRuntimeStoryProjection(previewRoom).characters,
      messages: [],
    });
    const blockingWarning = previewForSave.warnings.find(
      (warning) => warning.severity === "danger" && warning.blocksSave !== false,
    );

    if (blockingWarning) {
      setError(blockingWarning.message);
      locatePromptWarning(blockingWarning);
      return;
    }

    const basePresentation = normalizeTavernPresentation(data.presentation);
    const presentationLocked = isTavernPresentationLocked({
      presentation: basePresentation,
      messages: [],
      sceneId: undefined,
    });
    const nextPresentation = presentationLocked
      ? basePresentation
      : {
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
      settings: {
        ...data.settings,
        immersiveDescriptionEnabled: draft.immersiveDescriptionEnabled,
      },
    });
    close();
  };

  const presentationLocked = draft
    ? isTavernPresentationLocked({
        presentation: normalizeTavernPresentation(data.presentation),
        messages: [],
        sceneId: undefined,
      })
    : false;
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
  const previewRoom = useMemo(() => (draft ? buildPromptPreviewRoom(data, draft) : null), [data, draft]);
  const promptPreview = useMemo(
    () =>
      previewRoom
        ? buildTavernPromptPreview({
            room: previewRoom,
            characters: getTavernRuntimeStoryProjection(previewRoom).characters,
            messages: [],
          })
        : null,
    [previewRoom],
  );
  const promptPreviewBlockingCount = promptPreview?.summary.blockingWarningCount ?? 0;
  const promptPreviewWarningCount = promptPreview?.summary.warningCount ?? 0;
  const getPromptWarningAction = (warning: TavernPromptPreviewWarning) => {
    if (getPromptBlockWarningLocation(warning)) {
      return {
        label: "定位",
        onClick: () => locatePromptWarning(warning),
      };
    }

    const navigation = previewRoom ? resolveTavernPromptWarningNavigation(warning, previewRoom) : null;

    if (!navigation || !onOpenWarningNavigation) {
      return null;
    }

    return {
      label: "打开来源",
      onClick: () => {
        onOpenWarningNavigation(navigation);
        close();
      },
    };
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
                        <EditorStatusPill tone={draft.immersiveDescriptionEnabled ? "active" : "muted"}>
                          沉浸描写{draft.immersiveDescriptionEnabled ? "开" : "关"}
                        </EditorStatusPill>
                        <EditorStatusPill
                          tone={promptPreviewBlockingCount > 0 || promptPreviewWarningCount > 0 ? "warning" : "active"}
                        >
                          诊断 {promptPreviewBlockingCount + promptPreviewWarningCount}
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
                      { href: "#tavern-prompt-preview-section", icon: Eye, label: "最终预览" },
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
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                  <EditorField
                    label="呈现规则"
                    htmlFor="tavern-prompt-presentation-profile"
                    description={
                      presentationLocked ? "场景已开始，呈现规则已锁定。" : selectedPresentationProfile?.description
                    }
                  >
                    <NativeSelect
                      id="tavern-prompt-presentation-profile"
                      value={draft.presentationProfileId}
                      className={selectClassName}
                      disabled={presentationLocked}
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

                  <div className="rounded-lg border border-border/70 bg-background/72 p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">沉浸描写</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          作为系统叙事文本块的引用参数；已编辑文本不会被自动覆盖。
                        </div>
                      </div>
                      <Switch
                        checked={draft.immersiveDescriptionEnabled}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            immersiveDescriptionEnabled: checked === true,
                          })
                        }
                        aria-label="切换沉浸描写"
                      />
                    </div>
                  </div>
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

              {promptPreview && (
                <EditorFormCard
                  id="tavern-prompt-preview-section"
                  icon={Eye}
                  title="最终预览"
                  description="按当前草稿拼装整理员、导演和角色请求，并标出结构风险。"
                >
                  <div className="space-y-3">
                    <EditorMetricStrip
                      items={[
                        {
                          icon: TextSearch,
                          label: "预览总量",
                          value: formatPromptCharCount(promptPreview.summary.totalChars),
                          description: "三个目标合计",
                        },
                        {
                          icon: Braces,
                          label: "启用文本块",
                          value: promptPreview.summary.enabledPromptBlockCount,
                          description: `${formatPromptCharCount(promptPreview.summary.totalPromptBlockChars)} 字`,
                        },
                        {
                          icon: AlertTriangle,
                          label: "结构诊断",
                          value:
                            promptPreviewBlockingCount > 0
                              ? `${promptPreviewBlockingCount} 阻断`
                              : promptPreviewWarningCount > 0
                                ? `${promptPreviewWarningCount} 风险`
                                : "通过",
                          description: promptPreview.activeCharacter
                            ? `角色：${promptPreview.activeCharacter.name}`
                            : "未找到角色",
                        },
                        {
                          icon: ListChecks,
                          label: "覆盖目标",
                          value: promptPreview.items.length,
                          description: "bridge / director / character",
                        },
                      ]}
                    />

                    {(() => {
                      const actionableWarnings = promptPreview.warnings.filter(
                        (warning) => warning.severity !== "info",
                      );

                      if (actionableWarnings.length === 0) {
                        return (
                          <div className="flex items-center gap-2 rounded-lg border border-teal-500/15 bg-teal-500/8 px-3 py-2 text-xs leading-5 text-teal-700 dark:text-teal-200">
                            <CheckCircle2 className="size-4 shrink-0" />
                            <span>未发现阻断或风险项。</span>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
                          {actionableWarnings.slice(0, 6).map((warning) => {
                            const action = getPromptWarningAction(warning);

                            return (
                              <div
                                key={warning.id}
                                className="flex min-w-0 items-start gap-2 text-xs leading-5 text-amber-800 dark:text-amber-100"
                              >
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                  <EditorStatusPill tone={getPromptWarningTone(warning.severity)}>
                                    {getPromptWarningLabel(warning.severity)}
                                  </EditorStatusPill>
                                  <span className="min-w-0 flex-1">{warning.message}</span>
                                  {action && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-6 gap-1 px-2 text-[11px]"
                                      onClick={action.onClick}
                                    >
                                      <LocateFixed className="size-3" />
                                      {action.label}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {actionableWarnings.length > 6 && (
                            <div className="text-xs leading-5 text-amber-800/80 dark:text-amber-100/80">
                              另有 {actionableWarnings.length - 6} 项风险未展开。
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <Tabs defaultValue={promptPreview.items[0]?.target ?? "bridge"}>
                      <TabsList className="max-w-full overflow-x-auto">
                        {promptPreview.items.map((item) => (
                          <TabsTrigger key={item.target} value={item.target}>
                            {item.label}
                            {item.warnings.some((warning) => warning.severity !== "info") && (
                              <AlertTriangle className="size-3.5 text-amber-600" />
                            )}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {promptPreview.items.map((item) => {
                        const actionableItemWarnings = item.warnings.filter((warning) => warning.severity !== "info");

                        return (
                          <TabsContent key={item.target} value={item.target} className="space-y-3">
                            <div className="grid gap-2 md:grid-cols-4">
                              <div className="rounded-md border border-border/70 bg-background/72 px-3 py-2">
                                <div className="text-[11px] font-medium text-muted-foreground">systemPrompt</div>
                                <div className="mt-0.5 text-sm font-semibold leading-5">
                                  {formatPromptCharCount(item.metrics.systemPromptChars)}
                                </div>
                              </div>
                              <div className="rounded-md border border-border/70 bg-background/72 px-3 py-2">
                                <div className="text-[11px] font-medium text-muted-foreground">runtimeInstruction</div>
                                <div className="mt-0.5 text-sm font-semibold leading-5">
                                  {formatPromptCharCount(item.metrics.runtimeInstructionChars)}
                                </div>
                              </div>
                              <div className="rounded-md border border-border/70 bg-background/72 px-3 py-2">
                                <div className="text-[11px] font-medium text-muted-foreground">requestContext</div>
                                <div className="mt-0.5 text-sm font-semibold leading-5">
                                  {formatPromptCharCount(item.metrics.requestContextChars)}
                                </div>
                              </div>
                              <div className="rounded-md border border-border/70 bg-background/72 px-3 py-2">
                                <div className="text-[11px] font-medium text-muted-foreground">userMessage</div>
                                <div className="mt-0.5 text-sm font-semibold leading-5">
                                  {formatPromptCharCount(item.metrics.userMessageChars)}
                                </div>
                              </div>
                            </div>

                            {actionableItemWarnings.length > 0 && (
                              <div className="space-y-1.5 rounded-md border border-amber-500/20 bg-amber-500/8 px-3 py-2">
                                {actionableItemWarnings.map((warning) => {
                                  const action = getPromptWarningAction(warning);

                                  return (
                                    <div
                                      key={warning.id}
                                      className="flex items-start gap-2 text-xs leading-5 text-amber-800 dark:text-amber-100"
                                    >
                                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                      <span className="min-w-0 flex-1">{warning.message}</span>
                                      {action && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-6 gap-1 px-2 text-[11px]"
                                          onClick={action.onClick}
                                        >
                                          <LocateFixed className="size-3" />
                                          {action.label}
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-muted/20 p-3 font-mono text-[11px] leading-5 text-foreground shadow-inner">
                              {item.previewText || "暂无可预览内容。"}
                            </pre>
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </div>
                </EditorFormCard>
              )}

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
                                    focusedBlockId === block.id && "border-primary/55 ring-2 ring-primary/20",
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
                                    <span className="shrink-0">
                                      {renderTextFieldAgentActions({
                                        fieldKey: `promptBlock:${block.id}`,
                                        fieldLabel: `提示词文本块：${block.label}`,
                                        currentText: block.text,
                                        applyText: (text) => {
                                          patchDraftPrompt((prompt) =>
                                            updatePromptBlock(prompt, block.id, (nextBlock) => ({
                                              ...nextBlock,
                                              text,
                                            })),
                                          );
                                        },
                                        context: buildPromptBlockAgentContext({
                                          room: data,
                                          draft,
                                          block,
                                        }),
                                      })}
                                    </span>
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

              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </EditorFormLayout>

            <EditorFormFooter
              status={
                <span className="inline-flex items-center gap-1.5">
                  <Goal className="size-3.5" />
                  {promptPreviewBlockingCount > 0
                    ? `有 ${promptPreviewBlockingCount} 项阻断诊断，建议先处理`
                    : promptPreviewWarningCount > 0
                      ? `有 ${promptPreviewWarningCount} 项风险诊断，保存后影响后续请求`
                      : "诊断通过；保存后会影响后续整理员、导演与角色请求"}
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
