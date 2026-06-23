import {
  Braces,
  Eye,
  FileText,
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
import type {
  TavernMessage,
  TavernPromptBlock,
  TavernPromptBlockSourceType,
  TavernPromptBlockTarget,
  TavernRoom,
} from "../../../../../types";
import {
  EditorMetricStrip,
  EditorSection,
  EditorStatusPill,
  editorHeaderActionButtonClassName,
} from "../../primitives";
import { PromptEdit, type PromptEditHandle } from "./edit";
import type { ModuleSave, TextFieldAgentActionRenderer } from "../types";

type PromptSectionProps = {
  data: TavernRoom;
  messages: TavernMessage[];
  onSave: ModuleSave;
  renderTextFieldAgentActions: TextFieldAgentActionRenderer;
};

type PromptHierarchyStep = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  description: string;
  tone?: "active" | "muted" | "info" | "warning";
};

const targetLabels: Record<TavernPromptBlockTarget, string> = {
  bridge: "整理员",
  director: "导演",
  character: "角色",
};

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

const writingRuleSourceTypes: TavernPromptBlockSourceType[] = [
  "platform_style",
  "quality_rule",
  "narrative_style",
  "genre_rule",
  "hook_rule",
  "taboo_rule",
];

const getPresentationContractLabel = (room: TavernRoom) => {
  const presentationProfile = getTavernPresentationProfile(room.presentation?.profileId);

  if (presentationProfile.generationContract === "character_narrative_beat") {
    return "小说段落";
  }

  return "角色回复";
};

const getEnabledPromptBlocks = (blocks: TavernPromptBlock[]) =>
  blocks.filter((block) => block.enabled && block.text.trim());

const countBlocksByTarget = (
  blocks: TavernPromptBlock[],
  target: TavernPromptBlockTarget,
) => blocks.filter((block) => block.target === target).length;

const countEnabledBlocksBySource = (
  blocks: TavernPromptBlock[],
  sourceTypes: TavernPromptBlockSourceType[],
) => getEnabledPromptBlocks(blocks).filter((block) =>
  block.source && sourceTypes.includes(block.source.type)
).length;

const getSourceLabels = (
  blocks: TavernPromptBlock[],
  sourceTypes?: TavernPromptBlockSourceType[],
) => Array.from(new Set(
  getEnabledPromptBlocks(blocks).flatMap((block) => {
    if (!block.source) {
      return [];
    }
    if (sourceTypes && !sourceTypes.includes(block.source.type)) {
      return [];
    }
    return [`${sourceTypeLabels[block.source.type]}：${block.source.label}`];
  }),
));

const formatCompactList = (items: string[], fallback: string) =>
  items.length > 0 ? items.slice(0, 3).join(" / ") : fallback;

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
  const blocks = data.prompt.blocks;
  const enabledBlocks = getEnabledPromptBlocks(blocks);
  const systemNarrativeCount = countEnabledBlocksBySource(blocks, ["system_narrative"]);
  const roomStyleCount = countEnabledBlocksBySource(blocks, ["room_style"]);
  const writingRuleCount = countEnabledBlocksBySource(blocks, writingRuleSourceTypes);
  const sourceLabels = getSourceLabels(blocks);
  const systemNarrativeLabels = getSourceLabels(blocks, ["system_narrative"]);
  const writingRuleLabels = getSourceLabels(blocks, writingRuleSourceTypes);
  const targetCoverage = (["bridge", "director", "character"] as const)
    .map((target) => `${targetLabels[target]} ${countBlocksByTarget(blocks, target)}`)
    .join(" / ");
  const hierarchySteps: PromptHierarchyStep[] = [
    {
      icon: ShieldCheck,
      label: "输出合同",
      value: getPresentationContractLabel(data),
      description: "固定角色边界、可见性、XML 标签和输出形态，由系统底层控制。",
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
      label: "叙事文本",
      value: systemNarrativeCount > 0 ? `${systemNarrativeCount} 块` : "未启用",
      description: "系统叙事预设引用后已保存为可编辑文本。",
      tone: systemNarrativeCount > 0 ? "info" : "muted",
    },
    {
      icon: Wand2,
      label: "风格文本",
      value: roomStyleCount > 0 ? `${roomStyleCount} 块` : "未启用",
      description: "酒馆风格预设引用后已保存为可编辑文本。",
      tone: roomStyleCount > 0 ? "info" : "muted",
    },
    {
      icon: Layers3,
      label: "写作规则",
      value: writingRuleCount > 0 ? `${writingRuleCount} 块` : "未启用",
      description: "平台偏好、质量规则、题材套路、钩子和雷点边界以文本块注入。",
      tone: writingRuleCount > 0 ? "info" : "muted",
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
            icon: FileText,
            label: "文本块",
            value: `${enabledBlocks.length}/${blocks.length} 启用`,
            description: targetCoverage,
          },
          {
            icon: Sparkles,
            label: "叙事来源",
            value: formatCompactList(systemNarrativeLabels, "未启用"),
          },
          {
            icon: Layers3,
            label: "规则文本",
            value: writingRuleCount > 0 ? `${writingRuleCount} 块` : "未启用",
            description: formatCompactList(writingRuleLabels, ""),
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
            <p>{presentationProfile.description}</p>
            <p>
              {enabledBlocks.length > 0
                ? `后续请求会注入 ${enabledBlocks.length} 个已保存文本块。`
                : "后续请求只使用系统合同和上下文资料。"}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <EditorStatusPill tone={data.settings.immersiveDescriptionEnabled ? "active" : "muted"}>
                沉浸描写{data.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}
              </EditorStatusPill>
              {sourceLabels.slice(0, 5).map((label) => (
                <EditorStatusPill key={label} tone="info">
                  {label}
                </EditorStatusPill>
              ))}
              {sourceLabels.length > 5 && (
                <EditorStatusPill tone="muted">
                  +{sourceLabels.length - 5}
                </EditorStatusPill>
              )}
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
  renderTextFieldAgentActions,
}: PromptSectionProps) => {
  const editRef = useRef<PromptEditHandle>(null);
  const presentationProfile = getTavernPresentationProfile(data.presentation?.profileId);
  const presentationLocked = isTavernPresentationLocked({
    presentation: data.presentation,
    messages,
    sceneId: data.activeSceneId,
  });
  const enabledBlockCount = getEnabledPromptBlocks(data.prompt.blocks).length;

  return (
    <>
      <EditorSection
        icon={ScrollText}
        title="提示词"
        description="管理系统控制层和酒馆保存的可编辑提示词文本块。"
        meta={`${presentationProfile.label} / ${enabledBlockCount} 块启用`}
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
            当前场景已有对话，呈现规则已锁定；仍可引用预设并调整已保存文本块。
          </div>
        )}
      </EditorSection>

      <PromptEdit
        bind={editRef}
        data={data}
        messages={messages}
        onSave={onSave}
        renderTextFieldAgentActions={renderTextFieldAgentActions}
      />
    </>
  );
};
