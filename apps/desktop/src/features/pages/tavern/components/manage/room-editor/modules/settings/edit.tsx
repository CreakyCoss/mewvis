import type { ReactNode, Ref } from "react";
import { useImperativeHandle, useState } from "react";
import {
  Clapperboard,
  ChevronRight,
  type LucideIcon,
  Sparkles,
  ThumbsUp,
  UsersRound,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS,
  getTavernSystemNarrativePreset,
  normalizeTavernSystemNarrativePresetId,
  normalizeTavernSystemNarrativePresetSettings,
} from "../../../../../prompt-registry/system-narrative-styles";
import type {
  TavernProgressTrackerSettings,
  TavernRoleAssignmentDefinition,
  TavernRoom,
  TavernRoomSettings,
} from "../../../../../types";
import {
  applyInformationPolicyModePreset,
  cloneTavernRoomSettings,
  editorControlClassName,
  formatProgressJson,
  isRoleAssignmentDefinitionDraft,
  parseProgressJsonArray,
} from "../../utils";
import type { ModuleSave } from "../types";

export type SettingsEditHandle = (data?: TavernRoom) => void;

type SettingsDraft = TavernRoomSettings & {
  progressTracker: TavernProgressTrackerSettings;
  rolePoolJson: string;
};

type SettingsEditProps = {
  bind: Ref<SettingsEditHandle>;
  data: TavernRoom;
  modelLabel: string;
  onSave: ModuleSave;
};

type SettingsPresetId = "default" | "immersive" | "director" | "free";

type SettingsPresetDefinition = {
  id: SettingsPresetId;
  label: string;
  icon: LucideIcon;
  apply: (draft: SettingsDraft) => SettingsDraft;
};

const settingsPresets: SettingsPresetDefinition[] = [
  {
    id: "default",
    label: "默认推荐",
    icon: ThumbsUp,
    apply: (draft) => ({
      ...draft,
      immersiveDescriptionEnabled: true,
      showExecutionTrace: false,
      autoAssetExtractionEnabled: true,
      statusTracking: {
        ...draft.statusTracking,
        enabled: true,
        visibleToUser: true,
      },
      progressTracker: {
        ...draft.progressTracker,
        enabled: true,
        mode: "afterTurn",
        applyMode: "review",
      },
      randomEvents: {
        ...draft.randomEvents,
        enabled: false,
      },
      illustrationHints: {
        ...draft.illustrationHints,
        enabled: true,
      },
    }),
  },
  {
    id: "immersive",
    label: "沉浸体验",
    icon: Sparkles,
    apply: (draft) => ({
      ...draft,
      immersiveDescriptionEnabled: true,
      showExecutionTrace: false,
      statusTracking: {
        ...draft.statusTracking,
        enabled: true,
        visibleToUser: true,
      },
      illustrationHints: {
        ...draft.illustrationHints,
        enabled: true,
      },
      informationPolicy: {
        ...draft.informationPolicy,
        uiDefaultView: "reveal",
      },
    }),
  },
  {
    id: "director",
    label: "导演调试",
    icon: Clapperboard,
    apply: (draft) => ({
      ...draft,
      showExecutionTrace: true,
      statusTracking: {
        ...draft.statusTracking,
        enabled: true,
        visibleToUser: true,
      },
      progressTracker: {
        ...draft.progressTracker,
        enabled: true,
        applyMode: "review",
      },
      informationPolicy: {
        ...draft.informationPolicy,
        uiDefaultView: "director",
        hiddenFacts: {
          ...draft.informationPolicy.hiddenFacts,
          enabled: true,
        },
      },
    }),
  },
  {
    id: "free",
    label: "高自由互动",
    icon: UsersRound,
    apply: (draft) => ({
      ...draft,
      autoAssetExtractionEnabled: false,
      randomEvents: {
        ...draft.randomEvents,
        enabled: true,
      },
      informationPolicy: applyInformationPolicyModePreset(
        "open",
        draft.informationPolicy,
      ),
    }),
  },
];

const inferPresetId = (draft: SettingsDraft): SettingsPresetId => {
  if (draft.showExecutionTrace || draft.informationPolicy.uiDefaultView === "director") {
    return "director";
  }
  if (draft.informationPolicy.mode === "open" && draft.randomEvents.enabled) {
    return "free";
  }
  if (draft.immersiveDescriptionEnabled && draft.illustrationHints.enabled) {
    return "immersive";
  }
  return "default";
};

const SettingsSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="grid gap-4 rounded-lg border border-border/70 bg-background/80 p-4 shadow-xs lg:grid-cols-[14rem_minmax(0,1fr)]">
    <div className="min-w-0">
      <h3 className="text-base font-semibold leading-6 text-foreground">{title}</h3>
      <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
    <div className="min-w-0 space-y-2.5">{children}</div>
  </section>
);

const SettingsRow = ({
  label,
  description,
  control,
}: {
  label: string;
  description: string;
  control: ReactNode;
}) => (
  <div className="grid min-h-9 gap-2 rounded-md px-0.5 py-1 sm:grid-cols-[11rem_minmax(0,1fr)_minmax(10rem,16rem)] sm:items-center sm:gap-4">
    <div className="text-sm font-medium leading-5 text-foreground/82">{label}</div>
    <div className="text-xs leading-5 text-muted-foreground">{description}</div>
    <div className="flex min-w-0 justify-start sm:justify-end">{control}</div>
  </div>
);

const SettingsSwitch = ({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <SettingsRow
    label={label}
    description={description}
    control={(
      <Switch
        checked={checked}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
        aria-label={label}
      />
    )}
  />
);

const selectClassName = cn(editorControlClassName, "h-9 min-w-0 max-w-full sm:w-56");
const inputClassName = cn(editorControlClassName, "h-9 min-w-0 max-w-full sm:w-56");

export const SettingsEdit = ({
  bind,
  data,
  onSave,
  modelLabel,
}: SettingsEditProps) => {
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [error, setError] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<SettingsPresetId>("default");
  const selectedSystemNarrativePreset = draft
    ? getTavernSystemNarrativePreset(draft.systemNarrativePreset.presetId)
    : null;

  const open = (nextData = data) => {
    const nextDraft = {
      ...cloneTavernRoomSettings(nextData.settings),
      progressTracker: { ...nextData.progressTracker },
      rolePoolJson: formatProgressJson(nextData.settings.informationPolicy.roleAssignment.rolePool),
    };
    setError("");
    setSelectedPresetId(inferPresetId(nextDraft));
    setDraft(nextDraft);
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

    const rolePool = parseProgressJsonArray<TavernRoleAssignmentDefinition>(
      draft.rolePoolJson,
      "身份池",
      isRoleAssignmentDefinitionDraft,
    );
    if (!rolePool.ok) {
      setError(rolePool.error);
      return;
    }

    onSave({
      settings: {
        ...data.settings,
        systemNarrativePreset: normalizeTavernSystemNarrativePresetSettings(
          draft.systemNarrativePreset,
        ),
        immersiveDescriptionEnabled: draft.immersiveDescriptionEnabled,
        showExecutionTrace: draft.showExecutionTrace,
        autoAssetExtractionEnabled: draft.autoAssetExtractionEnabled,
        assetExtractionIntervalTurns: Math.min(
          10,
          Math.max(1, Number(draft.assetExtractionIntervalTurns) || 1),
        ),
        maxAssetDrafts: Math.min(20, Math.max(1, Number(draft.maxAssetDrafts) || 1)),
        directorMaxSpeakers: Math.min(
          6,
          Math.max(1, Number(draft.directorMaxSpeakers) || 1),
        ),
        agentKnowledgeCompactIntervalTurns: Math.min(
          50,
          Math.max(0, Number(draft.agentKnowledgeCompactIntervalTurns) || 0),
        ),
        statusTracking: {
          ...data.settings.statusTracking,
          ...draft.statusTracking,
        },
        randomEvents: {
          ...data.settings.randomEvents,
          enabled: draft.randomEvents.enabled,
          probability: Math.min(
            1,
            Math.max(0, Number(draft.randomEvents.probability) || 0),
          ),
        },
        illustrationHints: {
          ...data.settings.illustrationHints,
          enabled: draft.illustrationHints.enabled,
        },
        informationPolicy: {
          ...draft.informationPolicy,
          hiddenFacts: { ...draft.informationPolicy.hiddenFacts },
          roleAssignment: {
            ...draft.informationPolicy.roleAssignment,
            rolePool: rolePool.value.map((role) => ({ ...role })),
          },
        },
      },
      progressTracker: {
        enabled: draft.progressTracker.enabled,
        mode: draft.progressTracker.mode,
        intervalTurns: Math.min(
          50,
          Math.max(1, Number(draft.progressTracker.intervalTurns) || 1),
        ),
        applyMode: draft.progressTracker.applyMode,
        factConfidenceThreshold: Math.min(
          1,
          Math.max(0, Number(draft.progressTracker.factConfidenceThreshold) || 0),
        ),
        generateCheckpointBeforeContextTrim:
          draft.progressTracker.generateCheckpointBeforeContextTrim,
      },
    });
    close();
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
        <DialogContent className="!flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle>编辑运行设置</DialogTitle>
            <DialogDescription>
              调整执行过程、剧情资产整理和导演调度设置。
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 px-4 py-4">
              <div className="space-y-3">
                <SettingsSection
                  title="运行预设"
                  description="选择预设方案，快速配置一套适合的运行设置。"
                >
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {settingsPresets.map((preset) => {
                      const PresetIcon = preset.icon;
                      const isActive = selectedPresetId === preset.id;

                      return (
                        <Button
                          key={preset.id}
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-10 justify-center gap-2 rounded-md bg-background/70 text-sm font-medium shadow-xs",
                            isActive
                              ? "border-primary/55 bg-primary/[0.07] text-primary ring-1 ring-primary/20"
                              : "text-muted-foreground hover:bg-primary/[0.04] hover:text-primary",
                          )}
                          onClick={() => {
                            const nextDraft = preset.apply(draft);
                            setDraft(nextDraft);
                            setSelectedPresetId(preset.id);
                          }}
                        >
                          <PresetIcon className="size-4" />
                          {preset.label}
                        </Button>
                      );
                    })}
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="模型与模式"
                  description="选择模型与互动剧本模式，决定内容生成能力与信息可见性。"
                >
                  <SettingsRow
                    label="酒馆模型"
                    description="酒馆统一使用当前默认模型。"
                    control={(
                      <div
                        className={cn(
                          inputClassName,
                          "flex items-center overflow-hidden px-3 text-sm text-foreground",
                        )}
                        title={modelLabel}
                      >
                        <span className="min-w-0 truncate">{modelLabel}</span>
                      </div>
                    )}
                  />
                  <SettingsRow
                    label="互动剧本模式"
                    description="选择信息可见性和叙事观察风格。"
                    control={(
                      <NativeSelect
                        id="tavern-settings-layout-information-mode"
                        value={draft.informationPolicy.mode}
                        className={selectClassName}
                        onChange={(event) => {
                          const mode = event.target.value as TavernRoomSettings["informationPolicy"]["mode"];
                          setDraft({
                            ...draft,
                            informationPolicy: applyInformationPolicyModePreset(
                              mode,
                              draft.informationPolicy,
                            ),
                          });
                          setSelectedPresetId("default");
                        }}
                      >
                        <NativeSelectOption value="open">开放演绎</NativeSelectOption>
                        <NativeSelectOption value="mystery">推理悬疑</NativeSelectOption>
                        <NativeSelectOption value="social_deduction">
                          狼人杀阵营
                        </NativeSelectOption>
                        <NativeSelectOption value="custom">自定义</NativeSelectOption>
                      </NativeSelect>
                    )}
                  />
                </SettingsSection>

                <SettingsSection
                  title="叙事风格"
                  description="选择可调整的系统叙事预设；它影响对白、动作和环境描写比例，不改变呈现结构。"
                >
                  <SettingsRow
                    label="系统叙事预设"
                    description={selectedSystemNarrativePreset?.description ?? "选择整体叙事节奏。"}
                    control={(
                      <NativeSelect
                        id="tavern-settings-system-narrative-preset"
                        value={draft.systemNarrativePreset.presetId}
                        className={selectClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            systemNarrativePreset: {
                              ...draft.systemNarrativePreset,
                              presetId: normalizeTavernSystemNarrativePresetId(
                                event.target.value,
                              ),
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      >
                        {TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS.map((preset) => (
                          <NativeSelectOption key={preset.id} value={preset.id}>
                            {preset.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    )}
                  />
                  <div className="grid gap-2 rounded-md px-0.5 py-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-5 text-foreground/82">
                        自定义叙事规则
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        可补充对白比例、动作密度、环境描写边界等开发调试规则。
                      </p>
                    </div>
                    <Textarea
                      id="tavern-settings-system-narrative-custom"
                      value={draft.systemNarrativePreset.customInstructions ?? ""}
                      placeholder="例如：对白优先，环境描写仅保留可被角色观察到的变化。"
                      className={cn("min-h-24 resize-y text-sm leading-6", editorControlClassName)}
                      onChange={(event) => {
                        setDraft({
                          ...draft,
                          systemNarrativePreset: {
                            ...draft.systemNarrativePreset,
                            customInstructions: event.target.value,
                          },
                        });
                        setSelectedPresetId("default");
                      }}
                    />
                  </div>
                </SettingsSection>

                <SettingsSection
                  title="执行体验"
                  description="控制执行过程中的展示与交互体验。"
                >
                  <SettingsSwitch
                    label="沉浸描写"
                    description="增强环境与内心描写，提升沉浸感。"
                    checked={draft.immersiveDescriptionEnabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        immersiveDescriptionEnabled: checked,
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="显示执行过程"
                    description="实时展示模型思考与执行过程。"
                    checked={draft.showExecutionTrace}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        showExecutionTrace: checked,
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="显示状态栏"
                    description="在界面中显示状态信息与进度。"
                    checked={draft.statusTracking.enabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        statusTracking: {
                          ...draft.statusTracking,
                          enabled: checked,
                          visibleToUser: checked,
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="插图提示"
                    description="在关键节点提供插图建议与提示。"
                    checked={draft.illustrationHints.enabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        illustrationHints: {
                          ...draft.illustrationHints,
                          enabled: checked,
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsRow
                    label="界面视角"
                    description="选择界面呈现与叙事观察的视角。"
                    control={(
                      <NativeSelect
                        id="tavern-settings-layout-information-view"
                        value={draft.informationPolicy.uiDefaultView}
                        className={selectClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            informationPolicy: {
                              ...draft.informationPolicy,
                              uiDefaultView: event.target.value as TavernRoomSettings["informationPolicy"]["uiDefaultView"],
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      >
                        <NativeSelectOption value="public">公开视角</NativeSelectOption>
                        <NativeSelectOption value="reveal">复盘视角</NativeSelectOption>
                        <NativeSelectOption value="director">导演视角</NativeSelectOption>
                      </NativeSelect>
                    )}
                  />
                </SettingsSection>

                <SettingsSection
                  title="剧情自动化"
                  description="自动化管理剧情资产与事件，减轻导演负担。"
                >
                  <SettingsSwitch
                    label="自动整理剧情资产"
                    description="自动归档与整理角色、线索与事件。"
                    checked={draft.autoAssetExtractionEnabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        autoAssetExtractionEnabled: checked,
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="自动追踪状态"
                    description="自动记录并更新角色与剧情状态。"
                    checked={draft.progressTracker.enabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        progressTracker: {
                          ...draft.progressTracker,
                          enabled: checked,
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="导演随机事件"
                    description="在合适时机触发随机事件，增加变数。"
                    checked={draft.randomEvents.enabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        randomEvents: {
                          ...draft.randomEvents,
                          enabled: checked,
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsRow
                    label="整理间隔"
                    description="每隔多少轮自动整理一次剧情资产。"
                    control={(
                      <Input
                        id="tavern-settings-layout-asset-interval"
                        type="number"
                        min={1}
                        max={10}
                        value={draft.assetExtractionIntervalTurns}
                        className={inputClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            assetExtractionIntervalTurns: Math.min(
                              10,
                              Math.max(1, Number(event.target.value) || 1),
                            ),
                          });
                          setSelectedPresetId("default");
                        }}
                      />
                    )}
                  />
                  <SettingsRow
                    label="状态更新"
                    description="选择状态追踪的触发方式。"
                    control={(
                      <NativeSelect
                        id="tavern-settings-layout-progress-mode"
                        value={draft.progressTracker.mode}
                        className={selectClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            progressTracker: {
                              ...draft.progressTracker,
                              mode: event.target.value as TavernProgressTrackerSettings["mode"],
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      >
                        <NativeSelectOption value="manual">手动</NativeSelectOption>
                        <NativeSelectOption value="afterTurn">每轮</NativeSelectOption>
                        <NativeSelectOption value="fixedTurns">固定轮次</NativeSelectOption>
                      </NativeSelect>
                    )}
                  />
                  <SettingsRow
                    label="状态间隔"
                    description="固定轮次模式下的状态更新间隔。"
                    control={(
                      <Input
                        id="tavern-settings-layout-progress-interval"
                        type="number"
                        min={1}
                        max={50}
                        value={draft.progressTracker.intervalTurns}
                        className={inputClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            progressTracker: {
                              ...draft.progressTracker,
                              intervalTurns: Math.min(
                                50,
                                Math.max(1, Number(event.target.value) || 1),
                              ),
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      />
                    )}
                  />
                  <SettingsRow
                    label="应用方式"
                    description="选择状态变更是否自动应用。"
                    control={(
                      <NativeSelect
                        id="tavern-settings-layout-progress-apply-mode"
                        value={draft.progressTracker.applyMode}
                        className={selectClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            progressTracker: {
                              ...draft.progressTracker,
                              applyMode: event.target.value as TavernProgressTrackerSettings["applyMode"],
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      >
                        <NativeSelectOption value="review">需确认</NativeSelectOption>
                        <NativeSelectOption value="auto">自动</NativeSelectOption>
                      </NativeSelect>
                    )}
                  />
                  <SettingsRow
                    label="事实置信度"
                    description="低于阈值的状态事实不会自动采纳。"
                    control={(
                      <Input
                        id="tavern-settings-layout-progress-confidence"
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draft.progressTracker.factConfidenceThreshold}
                        className={inputClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            progressTracker: {
                              ...draft.progressTracker,
                              factConfidenceThreshold: Math.min(
                                1,
                                Math.max(0, Number(event.target.value) || 0),
                              ),
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      />
                    )}
                  />
                  <SettingsRow
                    label="随机事件概率"
                    description="控制导演随机事件被触发的概率。"
                    control={(
                      <Input
                        id="tavern-settings-layout-random-event-probability"
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draft.randomEvents.probability}
                        className={inputClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            randomEvents: {
                              ...draft.randomEvents,
                              probability: Math.min(
                                1,
                                Math.max(0, Number(event.target.value) || 0),
                              ),
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      />
                    )}
                  />
                  <SettingsSwitch
                    label="检查点"
                    description="上下文裁剪前生成状态检查点。"
                    checked={draft.progressTracker.generateCheckpointBeforeContextTrim}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        progressTracker: {
                          ...draft.progressTracker,
                          generateCheckpointBeforeContextTrim: checked,
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                </SettingsSection>

                <SettingsSection
                  title="角色与身份"
                  description="管理角色身份的分配策略与可知性。"
                >
                  <SettingsRow
                    label="导演人数"
                    description="单轮最多调度多少名角色发言。"
                    control={(
                      <Input
                        id="tavern-settings-layout-director-speakers"
                        type="number"
                        min={1}
                        max={6}
                        value={draft.directorMaxSpeakers}
                        className={inputClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            directorMaxSpeakers: Math.min(
                              6,
                              Math.max(1, Number(event.target.value) || 1),
                            ),
                          });
                          setSelectedPresetId("default");
                        }}
                      />
                    )}
                  />
                  <SettingsRow
                    label="身份分配策略"
                    description="选择角色身份的分配方式。"
                    control={(
                      <NativeSelect
                        id="tavern-settings-layout-role-strategy"
                        value={draft.informationPolicy.roleAssignment.strategy}
                        className={selectClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            informationPolicy: {
                              ...draft.informationPolicy,
                              roleAssignment: {
                                ...draft.informationPolicy.roleAssignment,
                                strategy: event.target.value as TavernRoomSettings["informationPolicy"]["roleAssignment"]["strategy"],
                              },
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      >
                        <NativeSelectOption value="manual">手动</NativeSelectOption>
                        <NativeSelectOption value="director_random">导演随机</NativeSelectOption>
                      </NativeSelect>
                    )}
                  />
                  <SettingsSwitch
                    label="剧本身份分配"
                    description="由剧本自动分配角色身份。"
                    checked={draft.informationPolicy.roleAssignment.enabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            enabled: checked,
                            strategy: checked
                              ? draft.informationPolicy.roleAssignment.strategy
                              : "manual",
                          },
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="用户参与身份池"
                    description="允许用户从身份池中选择与参与身份。"
                    checked={draft.informationPolicy.roleAssignment.includeUser}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            includeUser: checked,
                          },
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="本人可知身份"
                    description="玩家可知自己的全部身份信息。"
                    checked={draft.informationPolicy.roleAssignment.revealToAssignedCharacter}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            revealToAssignedCharacter: checked,
                          },
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="同阵营互知"
                    description="同一阵营内的角色互相可知身份。"
                    checked={draft.informationPolicy.roleAssignment.revealFactionMembers}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          roleAssignment: {
                            ...draft.informationPolicy.roleAssignment,
                            revealFactionMembers: checked,
                          },
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsRow
                    label="角色压缩间隔"
                    description="定期压缩角色知识，控制上下文长度。"
                    control={(
                      <Input
                        id="tavern-settings-layout-agent-compact-interval"
                        type="number"
                        min={0}
                        max={50}
                        value={draft.agentKnowledgeCompactIntervalTurns}
                        className={inputClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            agentKnowledgeCompactIntervalTurns: Math.min(
                              50,
                              Math.max(0, Number(event.target.value) || 0),
                            ),
                          });
                          setSelectedPresetId("default");
                        }}
                      />
                    )}
                  />
                </SettingsSection>

                <SettingsSection
                  title="信息揭示"
                  description="控制心理活动与隐藏信息的揭示规则。"
                >
                  <SettingsRow
                    label="心理揭示"
                    description="选择心理活动揭示的方式。"
                    control={(
                      <NativeSelect
                        id="tavern-settings-layout-thought-reveal"
                        value={draft.informationPolicy.revealThoughts}
                        className={selectClassName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            informationPolicy: {
                              ...draft.informationPolicy,
                              revealThoughts: event.target.value as TavernRoomSettings["informationPolicy"]["revealThoughts"],
                            },
                          });
                          setSelectedPresetId("default");
                        }}
                      >
                        <NativeSelectOption value="manual">手动</NativeSelectOption>
                        <NativeSelectOption value="sceneOutcome">结局后</NativeSelectOption>
                        <NativeSelectOption value="never">不揭示</NativeSelectOption>
                      </NativeSelect>
                    )}
                  />
                  <SettingsSwitch
                    label="隐藏角色心理"
                    description="隐藏角色的内心活动与想法。"
                    checked={draft.informationPolicy.hideCharacterThoughts}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          hideCharacterThoughts: checked,
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                  <SettingsSwitch
                    label="启用隐藏事实"
                    description="启用剧情中的隐藏事实与秘密。"
                    checked={draft.informationPolicy.hiddenFacts.enabled}
                    onCheckedChange={(checked) => {
                      setDraft({
                        ...draft,
                        informationPolicy: {
                          ...draft.informationPolicy,
                          hiddenFacts: {
                            ...draft.informationPolicy.hiddenFacts,
                            enabled: checked,
                          },
                        },
                      });
                      setSelectedPresetId("default");
                    }}
                  />
                </SettingsSection>

                <details className="group rounded-lg border border-border/70 bg-background/80 shadow-xs">
                  <summary className="grid cursor-pointer list-none gap-4 p-4 lg:grid-cols-[14rem_minmax(0,1fr)_auto] lg:items-center [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold leading-6 text-foreground">
                        高级选项
                      </h3>
                      <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
                        更多进阶设置，按需展开配置。
                      </p>
                    </div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      草稿上限、身份池 JSON、性能与限制
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="border-t border-border/70 px-4 py-3">
                    <div className="space-y-2.5 lg:pl-[15rem]">
                      <SettingsRow
                        label="草稿上限"
                        description="限制自动整理时保留的剧情资产草稿数量。"
                        control={(
                          <Input
                            id="tavern-settings-layout-max-drafts"
                            type="number"
                            min={1}
                            max={20}
                            value={draft.maxAssetDrafts}
                            className={inputClassName}
                            onChange={(event) => {
                              setDraft({
                                ...draft,
                                maxAssetDrafts: Math.min(
                                  20,
                                  Math.max(1, Number(event.target.value) || 1),
                                ),
                              });
                              setSelectedPresetId("default");
                            }}
                          />
                        )}
                      />
                      <div className="grid gap-2 py-1 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                        <div>
                          <div className="text-sm font-medium leading-5 text-foreground/82">
                            身份池 JSON
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            用于身份分配的候选定义。
                          </div>
                        </div>
                        <Textarea
                          value={draft.rolePoolJson}
                          className={cn(
                            "min-h-32 font-mono text-xs leading-5",
                            editorControlClassName,
                          )}
                          onChange={(event) => setDraft({
                            ...draft,
                            rolePoolJson: event.target.value,
                          })}
                        />
                      </div>
                    </div>
                  </div>
                </details>
              </div>

              {error && (
                <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 border-t bg-popover px-5 py-4">
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">保存修改</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
};
