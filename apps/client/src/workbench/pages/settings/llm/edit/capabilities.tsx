import { AudioLines, Brain, ChevronDown, FileText, Image, SlidersHorizontal, Video, Wand2, Wrench } from "lucide-react";
import { getModelCapabilities, type LlmProviderConfig, type ProviderModelConfig } from "@/agent-client/runtime-model";
import type { RuntimeModelCapabilities, RuntimeModelModality } from "@/agent-client/wire";
import { Label } from "design-system/components/ui/label";
import { Switch } from "design-system/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "design-system/components/ui/toggle-group";
import { MODEL_MODALITY_OPTIONS, MODEL_OPERATION_OPTIONS } from "../options";

const modalityIcons = { text: FileText, image: Image, audio: AudioLines, video: Video };
const selectionClass =
  "h-9 justify-center gap-1 rounded-lg px-2 border border-border/80 bg-background text-xs font-normal text-muted-foreground shadow-none hover:border-primary/30 hover:bg-primary/5 data-[state=on]:border-primary/35 data-[state=on]:bg-primary/8 data-[state=on]:text-primary";

export const ModelCapabilitiesEditor = ({
  provider,
  model,
  onChange,
}: {
  provider: LlmProviderConfig;
  model: ProviderModelConfig;
  onChange: (value: RuntimeModelCapabilities | null) => void;
}) => {
  const { declared, available, source, sourceUrl } = getModelCapabilities(provider, model);
  const custom = model.capabilities != null;
  const extraOperations = MODEL_OPERATION_OPTIONS.filter((option) => option.value !== "chat");
  const pending =
    declared.input.some((value) => !available.input.includes(value)) ||
    declared.output.some((value) => !available.output.includes(value)) ||
    declared.operations.some((value) => !available.operations.includes(value));

  return (
    <section className="space-y-3" aria-labelledby={`${model.id}-capabilities-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${model.id}-capabilities-heading`} className="text-sm font-medium">
          模型能力
        </h3>
        <ToggleGroup
          type="single"
          value={custom ? "custom" : "preset"}
          onValueChange={(value) => {
            if (value) onChange(value === "custom" ? declared : null);
          }}
          aria-label="模型能力配置方式"
          spacing={0}
          className="rounded-lg border border-border/60 bg-muted/35 p-0.5"
        >
          <ToggleGroupItem
            value="preset"
            className="h-8 rounded-md! px-3! text-xs font-normal text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
          >
            <Wand2 className="size-3.5" aria-hidden="true" />
            自动预设
          </ToggleGroupItem>
          <ToggleGroupItem
            value="custom"
            className="h-8 rounded-md! px-3! text-xs font-normal text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            手动配置
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!custom ? (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/15">
          <dl className="grid grid-cols-2 divide-x divide-border/60">
            {(["input", "output"] as const).map((key) => (
              <div key={key} className="space-y-3 px-4 py-3">
                <dt className="text-xs text-muted-foreground">{key === "input" ? "接受输入" : "生成输出"}</dt>
                <dd className="flex min-h-5 flex-wrap items-center gap-x-4 gap-y-2">
                  {MODEL_MODALITY_OPTIONS.filter((option) => declared[key].includes(option.value)).map((option) => {
                    const Icon = modalityIcons[option.value];
                    return (
                      <span key={option.value} className="inline-flex items-center gap-1.5 text-sm">
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        {option.label}
                      </span>
                    );
                  })}
                  {!declared[key].length && <span className="text-xs text-muted-foreground">未配置</span>}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">用途</span>
            {MODEL_OPERATION_OPTIONS.filter((option) => declared.operations.includes(option.value)).map((option) => (
              <span key={option.value}>{option.label}</span>
            ))}
            {!declared.operations.length && <span className="text-muted-foreground">未配置</span>}
            {declared.reasoning && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Brain className="size-3.5" aria-hidden="true" />
                支持思考
              </span>
            )}
            {declared.toolCalling && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Wrench className="size-3.5" aria-hidden="true" />
                工具调用
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4">
          {(["input", "output"] as const).map((key) => (
            <div key={key} className="space-y-2">
              <span id={`${model.id}-${key}-heading`} className="text-xs text-muted-foreground">
                {key === "input" ? "接受输入" : "生成输出"}
              </span>
              <ToggleGroup
                type="multiple"
                value={declared[key]}
                onValueChange={(values) => onChange({ ...declared, [key]: values as RuntimeModelModality[] })}
                aria-labelledby={`${model.id}-${key}-heading`}
                className="grid w-full grid-cols-2 gap-2 min-[375px]:grid-cols-4"
              >
                {MODEL_MODALITY_OPTIONS.map((option) => {
                  const Icon = modalityIcons[option.value];
                  return (
                    <ToggleGroupItem key={option.value} value={option.value} className={selectionClass}>
                      <Icon className="size-3.5" aria-hidden="true" />
                      {option.label}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
          ))}
          <div className="grid divide-y divide-border/60 border-y border-border/60 sm:grid-cols-3 sm:gap-4 sm:divide-y-0">
            {(
              [
                { key: "chat", label: "文字对话", description: "在聊天中使用这个模型" },
                { key: "reasoning", label: "思考能力", description: "允许配置思考模式和强度" },
                { key: "toolCalling", label: "工具调用", description: "允许模型使用智能体工具" },
              ] as const
            ).map((option) => (
              <div key={option.key} className="flex items-center justify-between gap-3 py-2.5">
                <Label htmlFor={`${model.id}-${option.key}`} className="min-w-0 cursor-pointer text-xs font-normal">
                  {option.label}
                </Label>
                <Switch
                  id={`${model.id}-${option.key}`}
                  title={option.description}
                  checked={option.key === "chat" ? declared.operations.includes("chat") : declared[option.key]}
                  onCheckedChange={(checked) =>
                    onChange(
                      option.key === "chat"
                        ? {
                            ...declared,
                            operations: checked
                              ? [...declared.operations, "chat"]
                              : declared.operations.filter((value) => value !== "chat"),
                          }
                        : { ...declared, [option.key]: checked },
                    )
                  }
                />
              </div>
            ))}
          </div>
          <details className="group/extra">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="size-3.5 -rotate-90 transition-transform group-open/extra:rotate-0 motion-reduce:transition-none"
                aria-hidden="true"
              />
              扩展用途
              <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-[11px]">
                待接入
                {declared.operations.filter((value) => value !== "chat").length
                  ? ` · 已选 ${declared.operations.filter((value) => value !== "chat").length} 项`
                  : ""}
              </span>
            </summary>
            <div className="space-y-2.5 pt-3">
              <p className="text-xs leading-5 text-muted-foreground">
                用于保存绘图、语音等模型配置，执行服务后续接入。
              </p>
              <ToggleGroup
                type="multiple"
                value={declared.operations.filter((value) => value !== "chat")}
                onValueChange={(values) =>
                  onChange({
                    ...declared,
                    operations: [
                      ...(declared.operations.includes("chat") ? ["chat" as const] : []),
                      ...extraOperations
                        .filter((option) => values.includes(option.value))
                        .map((option) => option.value),
                    ],
                  })
                }
                aria-label="扩展用途"
                className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {extraOperations.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value} className={selectionClass}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </details>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-xs leading-5 text-muted-foreground">
        <p>
          {source === "fallback"
            ? "未识别到预设，可根据服务文档手动配置。"
            : custom
              ? "手动配置优先；切回自动预设可恢复模型能力。"
              : "随模型和 API 格式自动匹配。"}
        </p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-primary hover:underline underline-offset-2"
          >
            查看文档
          </a>
        )}
      </div>
      {(pending || !available.operations.includes("chat")) && (
        <p role="status" className="rounded-lg bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {available.operations.includes("chat")
            ? "音频、视频及媒体生成能力可保存配置，执行服务待接入。"
            : "此模型当前不用于文字对话，将保留在模型设置中。"}
        </p>
      )}
    </section>
  );
};
