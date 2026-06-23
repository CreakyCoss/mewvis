import {
  Braces,
  CheckCircle2,
  Goal,
  Layers3,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  TAVERN_PRESENTATION_PROFILE_OPTIONS,
  getTavernPresentationProfile,
  isTavernPresentationLocked,
  normalizeTavernPresentation,
  normalizeTavernPresentationProfileId,
} from "../../../../../prompt-registry/presentation-rules";
import {
  TAVERN_QUALITY_RULES,
  TAVERN_RULE_COMPOSITION_OPTIONS,
  getTavernRuleComposition,
  normalizeTavernQualityRuleIds,
  normalizeTavernRuleCompositionId,
} from "../../../../../prompt-registry/rule-layers/resolver";
import {
  TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS,
  getTavernSystemNarrativePreset,
  normalizeTavernSystemNarrativePresetId,
  normalizeTavernSystemNarrativePresetSettings,
} from "../../../../../prompt-registry/system-narrative-styles";
import {
  TAVERN_PROMPT_STYLE_PRESETS,
  getTavernPromptStylePreset,
  normalizeTavernPromptStyleId,
} from "../../../../../prompt-styles";
import type {
  TavernMessage,
  TavernPresentationProfileId,
  TavernPromptStyleId,
  TavernRoom,
  TavernSystemNarrativePresetSettings,
} from "../../../../../types";
import type {
  TavernPlatformStyleId,
  TavernQualityRuleId,
} from "../../../../../prompt-registry/rule-layers/types";
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
import {
  editorControlClassName,
  emptyValueText,
} from "../../utils";
import type { ModuleSave } from "../types";

export type PromptEditHandle = (data?: TavernRoom) => void;

type PromptDraft = {
  presentationProfileId: TavernPresentationProfileId;
  promptStyleId: TavernPromptStyleId;
  systemNarrativePreset: TavernSystemNarrativePresetSettings;
  platformStyleId: TavernPlatformStyleId;
  qualityRuleIds: TavernQualityRuleId[];
  immersiveDescriptionEnabled: boolean;
};

type PromptEditProps = {
  bind: Ref<PromptEditHandle>;
  data: TavernRoom;
  messages: TavernMessage[];
  onSave: ModuleSave;
};

const selectClassName = cn(editorControlClassName, "min-h-9");

const getGenerationContractLabel = (profileId: TavernPresentationProfileId) => {
  const profile = getTavernPresentationProfile(profileId);

  if (profile.generationContract === "character_narrative_beat") {
    return "小说段落合同";
  }

  return "角色回复合同";
};

export const PromptEdit = ({
  bind,
  data,
  messages,
  onSave,
}: PromptEditProps) => {
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  const [error, setError] = useState("");

  const open = (nextData = data) => {
    setError("");
    setDraft({
      presentationProfileId: normalizeTavernPresentationProfileId(
        nextData.presentation?.profileId,
      ),
      promptStyleId: normalizeTavernPromptStyleId(nextData.promptStyleId),
      systemNarrativePreset: normalizeTavernSystemNarrativePresetSettings(
        nextData.settings.systemNarrativePreset,
      ),
      platformStyleId: normalizeTavernRuleCompositionId(nextData.settings.platformStyleId),
      qualityRuleIds: normalizeTavernQualityRuleIds(nextData.settings.qualityRuleIds),
      immersiveDescriptionEnabled: nextData.settings.immersiveDescriptionEnabled !== false,
    });
  };

  useImperativeHandle(bind, () => open);

  const close = () => {
    setDraft(null);
    setError("");
  };

  const toggleQualityRule = (ruleId: TavernQualityRuleId, checked: boolean) => {
    if (!draft) {
      return;
    }

    const nextRuleIds = checked
      ? Array.from(new Set([...draft.qualityRuleIds, ruleId]))
      : draft.qualityRuleIds.filter((currentRuleId) => currentRuleId !== ruleId);

    setDraft({
      ...draft,
      qualityRuleIds: nextRuleIds,
    });
  };

  const save = () => {
    if (!draft) {
      return;
    }

    const basePresentation = normalizeTavernPresentation(data.presentation);
    const presentationLocked = isTavernPresentationLocked({
      presentation: basePresentation,
      messages,
    });
    const nextSystemNarrativePreset = normalizeTavernSystemNarrativePresetSettings(
      draft.systemNarrativePreset,
    );

    if (
      nextSystemNarrativePreset.customInstructions &&
      nextSystemNarrativePreset.customInstructions.length > 1800
    ) {
      setError("自定义叙事规则太长，请压缩到 1800 字以内。");
      return;
    }

    onSave({
      presentation: presentationLocked
        ? basePresentation
        : {
            ...basePresentation,
            profileId: normalizeTavernPresentationProfileId(draft.presentationProfileId),
            profileVersion: 1,
          },
      promptStyleId: normalizeTavernPromptStyleId(draft.promptStyleId),
      settings: {
        ...data.settings,
        systemNarrativePreset: nextSystemNarrativePreset,
        platformStyleId: normalizeTavernRuleCompositionId(draft.platformStyleId),
        qualityRuleIds: normalizeTavernQualityRuleIds(draft.qualityRuleIds),
        immersiveDescriptionEnabled: draft.immersiveDescriptionEnabled,
      },
    });
    close();
  };

  const presentationLocked = draft
    ? isTavernPresentationLocked({
        presentation: normalizeTavernPresentation(data.presentation),
        messages,
      })
    : false;
  const selectedPresentationProfile = draft
    ? getTavernPresentationProfile(draft.presentationProfileId)
    : null;
  const selectedPromptStyle = draft
    ? getTavernPromptStylePreset(draft.promptStyleId)
    : null;
  const selectedSystemNarrativePreset = draft
    ? getTavernSystemNarrativePreset(draft.systemNarrativePreset.presetId)
    : null;
  const selectedRuleComposition = draft
    ? getTavernRuleComposition(draft.platformStyleId)
    : null;

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
            description="配置房间运行时提示词的呈现结构、叙事调性、房间风格和写作规则。"
          />
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <EditorFormLayout
              sidebar={(
                <>
                  <EditorFormSidebarCard
                    icon={ScrollText}
                    title={data.title.trim() || emptyValueText}
                    meta={(
                      <>
                        <EditorStatusPill tone="info">
                          {selectedPresentationProfile?.label ?? emptyValueText}
                        </EditorStatusPill>
                        <EditorStatusPill tone="info">
                          {selectedPromptStyle?.label ?? emptyValueText}
                        </EditorStatusPill>
                        <EditorStatusPill tone={draft.immersiveDescriptionEnabled ? "active" : "muted"}>
                          沉浸描写{draft.immersiveDescriptionEnabled ? "开" : "关"}
                        </EditorStatusPill>
                      </>
                    )}
                  >
                    <p className="text-xs leading-5 text-muted-foreground">
                      {selectedPresentationProfile?.description ?? "选择一个呈现结构。"}
                    </p>
                  </EditorFormSidebarCard>
                  <EditorFormSidebarPanel title="当前输出合同">
                    <div className="flex items-center gap-2 text-sm font-medium leading-5">
                      <ShieldCheck className="size-4 text-primary" />
                      <span className="min-w-0 truncate">
                        {getGenerationContractLabel(draft.presentationProfileId)}
                      </span>
                    </div>
                  </EditorFormSidebarPanel>
                  <EditorFormNav
                    items={[
                      { href: "#tavern-prompt-structure-section", icon: MessageSquareText, label: "呈现结构" },
                      { href: "#tavern-prompt-narrative-section", icon: Sparkles, label: "叙事调性" },
                      { href: "#tavern-prompt-rules-section", icon: Layers3, label: "写作规则" },
                    ]}
                  />
                </>
              )}
            >
              <EditorFormCard
                id="tavern-prompt-structure-section"
                icon={MessageSquareText}
                title="呈现结构"
                description="先确定输出结构，再叠加叙事风格和写作规则。"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditorField
                    label="呈现规则"
                    htmlFor="tavern-prompt-presentation-profile"
                    description={
                      presentationLocked
                        ? "场景已开始，呈现规则已锁定。"
                        : selectedPresentationProfile?.description
                    }
                  >
                    <NativeSelect
                      id="tavern-prompt-presentation-profile"
                      value={draft.presentationProfileId}
                      className={selectClassName}
                      disabled={presentationLocked}
                      onChange={(event) => setDraft({
                        ...draft,
                        presentationProfileId: normalizeTavernPresentationProfileId(
                          event.target.value,
                        ),
                      })}
                    >
                      {TAVERN_PRESENTATION_PROFILE_OPTIONS.map((profile) => (
                        <NativeSelectOption key={profile.id} value={profile.id}>
                          {profile.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>

                  <EditorField
                    label="酒馆风格"
                    htmlFor="tavern-prompt-room-style"
                    description={selectedPromptStyle?.description}
                  >
                    <NativeSelect
                      id="tavern-prompt-room-style"
                      value={draft.promptStyleId}
                      className={selectClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        promptStyleId: normalizeTavernPromptStyleId(event.target.value),
                      })}
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
                id="tavern-prompt-narrative-section"
                icon={Sparkles}
                title="叙事调性"
                description="系统叙事控制节奏、镜头密度和描写边界，不改变呈现结构。"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
                  <div className="space-y-3">
                    <EditorField
                      label="系统叙事"
                      htmlFor="tavern-prompt-system-narrative"
                      description={selectedSystemNarrativePreset?.description}
                    >
                      <NativeSelect
                        id="tavern-prompt-system-narrative"
                        value={draft.systemNarrativePreset.presetId}
                        className={selectClassName}
                        onChange={(event) => setDraft({
                          ...draft,
                          systemNarrativePreset: {
                            ...draft.systemNarrativePreset,
                            presetId: normalizeTavernSystemNarrativePresetId(
                              event.target.value,
                            ),
                          },
                        })}
                      >
                        {TAVERN_SYSTEM_NARRATIVE_PRESET_OPTIONS.map((preset) => (
                          <NativeSelectOption key={preset.id} value={preset.id}>
                            {preset.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </EditorField>

                    <EditorField
                      label="自定义叙事规则"
                      htmlFor="tavern-prompt-custom-narrative"
                      description="只写全局写作边界，角色口吻请放到角色设置里。"
                    >
                      <Textarea
                        id="tavern-prompt-custom-narrative"
                        value={draft.systemNarrativePreset.customInstructions ?? ""}
                        placeholder="例如：对白优先；环境描写只写角色能观察到的变化；结尾保留可承接动作。"
                        className={cn("min-h-28 resize-y text-sm leading-6", editorControlClassName)}
                        onChange={(event) => setDraft({
                          ...draft,
                          systemNarrativePreset: {
                            ...draft.systemNarrativePreset,
                            customInstructions: event.target.value,
                          },
                        })}
                      />
                    </EditorField>
                  </div>

                  <div className="rounded-lg border bg-background/72 p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">
                          沉浸描写
                        </div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          控制角色公开内容中的动作、环境和心理承载量。
                        </div>
                      </div>
                      <Switch
                        checked={draft.immersiveDescriptionEnabled}
                        onCheckedChange={(checked) => setDraft({
                          ...draft,
                          immersiveDescriptionEnabled: checked === true,
                        })}
                        aria-label="切换沉浸描写"
                      />
                    </div>
                  </div>
                </div>
              </EditorFormCard>

              <EditorFormCard
                id="tavern-prompt-rules-section"
                icon={Layers3}
                title="写作规则"
                description="规则组合会注入平台偏好、质量护栏、题材套路、钩子和雷点边界。"
              >
                <div className="space-y-3">
                  <EditorField
                    label="写作规则组合"
                    htmlFor="tavern-prompt-rule-composition"
                    description={selectedRuleComposition?.description}
                  >
                    <NativeSelect
                      id="tavern-prompt-rule-composition"
                      value={draft.platformStyleId}
                      className={selectClassName}
                      onChange={(event) => setDraft({
                        ...draft,
                        platformStyleId: normalizeTavernRuleCompositionId(event.target.value),
                      })}
                    >
                      {TAVERN_RULE_COMPOSITION_OPTIONS.map((composition) => (
                        <NativeSelectOption key={composition.id} value={composition.id}>
                          {composition.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </EditorField>

                  <div className="grid gap-2 md:grid-cols-2">
                    {TAVERN_QUALITY_RULES.map((rule) => {
                      const checked = draft.qualityRuleIds.includes(rule.id);

                      return (
                        <label
                          key={rule.id}
                          className={cn(
                            "grid cursor-pointer gap-3 rounded-lg border bg-background/72 p-3 shadow-xs transition-colors sm:grid-cols-[auto_minmax(0,1fr)]",
                            checked && "border-primary/35 bg-primary/[0.06]",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => {
                              toggleQualityRule(rule.id, nextChecked === true);
                            }}
                            aria-label={rule.label}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 text-sm font-semibold leading-5">
                              <CheckCircle2 className={cn(
                                "size-3.5",
                                checked ? "text-primary" : "text-muted-foreground",
                              )}
                              />
                              {rule.label}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {rule.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </EditorFormCard>

              <EditorFormCard
                icon={Braces}
                title="层级顺序"
                description="运行时按这个顺序注入，后面的层级只能收紧或补充，不能覆盖前面的合同。"
              >
                <div className="grid gap-2 text-xs leading-5 text-muted-foreground md:grid-cols-3">
                  {[
                    "system_contract",
                    "presentation_profile",
                    "system_narrative_preset",
                    "prompt_style",
                    "platform_style / rule_layers",
                    "tavern_context / character_context / turn_instruction",
                  ].map((item, index) => (
                    <div
                      key={item}
                      className="flex min-w-0 items-center gap-2 rounded-md bg-background/70 px-2.5 py-2 shadow-xs"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="min-w-0 truncate font-mono">{item}</span>
                    </div>
                  ))}
                </div>
              </EditorFormCard>

              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </EditorFormLayout>

            <EditorFormFooter
              status={(
                <span className="inline-flex items-center gap-1.5">
                  <Goal className="size-3.5" />
                  保存后会影响后续角色、导演与整理员请求
                </span>
              )}
            >
              <Button type="button" variant="outline" onClick={close}>
                取消
              </Button>
              <Button type="submit">
                <ScrollText className="size-4" />
                保存提示词
              </Button>
            </EditorFormFooter>
          </form>
        </EditorFormDialogContent>
      )}
    </Dialog>
  );
};
