import {
  Braces,
  Eye,
  Layers3,
  MessageSquareText,
  Pencil,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  getTavernPresentationProfile,
  isTavernPresentationLocked,
} from "../../../../../prompt-registry/presentation-rules";
import { resolveTavernPromptRuleStack } from "../../../../../prompt-registry/rule-layers/resolver";
import { getTavernSystemNarrativePreset } from "../../../../../prompt-registry/system-narrative-styles";
import { getTavernPromptStylePreset } from "../../../../../prompt-styles";
import type {
  TavernMessage,
  TavernRoom,
} from "../../../../../types";
import {
  EditorMetricStrip,
  EditorSection,
  EditorStatusPill,
  editorHeaderActionButtonClassName,
} from "../../primitives";
import { PromptEdit, type PromptEditHandle } from "./edit";
import type { ModuleSave } from "../types";

type PromptSectionProps = {
  data: TavernRoom;
  messages: TavernMessage[];
  onSave: ModuleSave;
};

type PromptHierarchyStep = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  description: string;
  tone?: "active" | "muted" | "info" | "warning";
};

const getPresentationContractLabel = (room: TavernRoom) => {
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);

  if (presentationProfile.generationContract === "character_narrative_beat") {
    return "小说段落";
  }

  return "角色回复";
};

const getEffectiveRuleCount = (room: TavernRoom) => {
  const ruleStack = resolveTavernPromptRuleStack({
    compositionId: room.settings.platformStyleId,
    qualityRuleIds: room.settings.qualityRuleIds,
  });

  return ruleStack.ruleGroups.qualityRules.length +
    ruleStack.ruleGroups.narrativeStyles.length +
    ruleStack.ruleGroups.genreRules.length +
    ruleStack.ruleGroups.hookRules.length +
    ruleStack.ruleGroups.tabooRules.length;
};

const PromptHierarchy = ({
  steps,
}: {
  steps: PromptHierarchyStep[];
}) => (
  <div className="overflow-hidden rounded-lg border border-border/70 bg-background/72 shadow-xs">
    {steps.map((step, index) => {
      const Icon = step.icon;

      return (
        <div
          key={step.label}
          className="grid min-w-0 gap-3 border-border/60 px-3.5 py-3 sm:grid-cols-[2rem_8rem_minmax(0,1fr)_auto] sm:items-center [&+&]:border-t"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/8 text-primary ring-1 ring-primary/10">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">
              L{index + 1}
            </div>
            <div className="truncate text-sm font-semibold leading-5">
              {step.label}
            </div>
          </div>
          <div className="min-w-0 text-xs leading-5 text-muted-foreground">
            {step.description}
          </div>
          <div className="flex min-w-0 justify-start sm:justify-end">
            <EditorStatusPill tone={step.tone}>{step.value}</EditorStatusPill>
          </div>
        </div>
      );
    })}
  </div>
);

export const PromptSummaryContent = ({
  data,
}: {
  data: TavernRoom;
}) => {
  const presentationProfile = getTavernPresentationProfile(data.presentation?.profileId);
  const promptStyle = getTavernPromptStylePreset(data.promptStyleId);
  const systemNarrativePreset = getTavernSystemNarrativePreset(
    data.settings.systemNarrativePreset.presetId,
  );
  const systemNarrativeLabel = data.settings.systemNarrativePreset.customInstructions
    ? `${systemNarrativePreset.label} + 自定义`
    : systemNarrativePreset.label;
  const ruleStack = resolveTavernPromptRuleStack({
    compositionId: data.settings.platformStyleId,
    qualityRuleIds: data.settings.qualityRuleIds,
  });
  const effectiveRuleCount = getEffectiveRuleCount(data);
  const hierarchySteps: PromptHierarchyStep[] = [
    {
      icon: ShieldCheck,
      label: "输出合同",
      value: getPresentationContractLabel(data),
      description: "固定角色边界、可见性、标签和输出形态。",
      tone: "active",
    },
    {
      icon: MessageSquareText,
      label: "呈现规则",
      value: presentationProfile.label,
      description: "决定对话气泡、第三人称段落或小说正文的呈现结构。",
      tone: "info",
    },
    {
      icon: Sparkles,
      label: "系统叙事",
      value: systemNarrativeLabel,
      description: "调整节奏、镜头密度、冲突强度和收束方式。",
      tone: "info",
    },
    {
      icon: Wand2,
      label: "酒馆风格",
      value: promptStyle.label,
      description: "给当前房间定调，例如武侠、轻小说、写实克制。",
      tone: "info",
    },
    {
      icon: Layers3,
      label: "写作规则组合",
      value: ruleStack.composition.label,
      description: "组合平台偏好、质量规则、题材套路、钩子和雷点边界。",
      tone: ruleStack.composition.id === "none" ? "muted" : "info",
    },
    {
      icon: Braces,
      label: "上下文资料",
      value: "自动注入",
      description: "房间、场景、世界书、角色记忆、历史和引用文件只作为事实资料。",
      tone: "muted",
    },
  ];

  return (
    <div className="space-y-3">
      <EditorMetricStrip
        items={[
          {
            icon: MessageSquareText,
            label: "呈现规则",
            value: presentationProfile.label,
          },
          {
            icon: Sparkles,
            label: "系统叙事",
            value: systemNarrativeLabel,
          },
          {
            icon: Wand2,
            label: "酒馆风格",
            value: promptStyle.label,
          },
          {
            icon: Layers3,
            label: "写作规则",
            value: effectiveRuleCount > 0 ? `${effectiveRuleCount} 条` : "未启用",
            description: ruleStack.composition.label,
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <PromptHierarchy steps={hierarchySteps} />
        <aside className="rounded-lg border border-border/70 bg-background/72 p-3.5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold leading-5">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Eye className="size-3.5" />
            </span>
            当前效果
          </div>
          <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
            <p>
              {presentationProfile.description}
            </p>
            <p>
              {promptStyle.description}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <EditorStatusPill tone={data.settings.immersiveDescriptionEnabled ? "active" : "muted"}>
                沉浸描写{data.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}
              </EditorStatusPill>
              <EditorStatusPill tone={data.settings.systemNarrativePreset.customInstructions ? "warning" : "muted"}>
                {data.settings.systemNarrativePreset.customInstructions ? "有自定义规则" : "无自定义规则"}
              </EditorStatusPill>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export const PromptSection = ({
  data,
  messages,
  onSave,
}: PromptSectionProps) => {
  const editRef = useRef<PromptEditHandle>(null);
  const presentationProfile = getTavernPresentationProfile(data.presentation?.profileId);
  const promptStyle = getTavernPromptStylePreset(data.promptStyleId);
  const presentationLocked = isTavernPresentationLocked({
    presentation: data.presentation,
    messages,
  });

  return (
    <>
      <EditorSection
        icon={ScrollText}
        title="提示词"
        description="管理酒馆运行时提示词的层级、呈现结构、叙事调性和写作规则。"
        meta={`${presentationProfile.label} / ${promptStyle.label}`}
        metaClassName="border border-primary/15 bg-primary/10 text-primary dark:border-primary/20 dark:bg-primary/15"
        action={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={editorHeaderActionButtonClassName}
            onClick={() => editRef.current?.(data)}
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
        )}
        contentClassName="p-4"
      >
        <PromptSummaryContent data={data} />
        {presentationLocked && (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
            当前房间已有对话，呈现规则已锁定；仍可调整叙事调性、酒馆风格和写作规则。
          </div>
        )}
      </EditorSection>

      <PromptEdit
        bind={editRef}
        data={data}
        messages={messages}
        onSave={onSave}
      />
    </>
  );
};
