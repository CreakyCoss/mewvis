import { useMemo, useState } from "react";
import { BookOpenText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { RuntimeModelInput } from "@/agent-client/protocol";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getSceneNovelizerPlatformPackage,
  SCENE_NOVELIZER_PLATFORM_PACKAGES,
} from "../prompt-registry/packages";
import {
  evaluateSceneNovelDraft,
} from "../quality/metrics";
import {
  runSceneNovelizer,
} from "../runtime/run-scene-novelizer";
import type {
  SceneNovelDraft,
  SceneNovelSource,
  SceneNovelizerPlatformStyleId,
} from "../types";
import { SceneNovelizerDraftView } from "./SceneNovelizerDraftView";

type SceneNovelizerPanelProps = {
  source: SceneNovelSource;
  workspacePath: string;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelInput | null;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

const sourceStatItems = (source: SceneNovelSource) => [
  ["行动", source.stats.userActionCount],
  ["角色", source.stats.characterBeatCount],
  ["对白", source.stats.dialogueCount],
  ["心理", source.stats.thoughtCount],
  ["后果", source.stats.consequenceCount],
  ["钩子", source.stats.hookCount],
];

const materialKindLabels: Record<string, string> = {
  user_action: "用户行动",
  dialogue: "实际话语",
  action: "动作行为",
  thought: "心理想法",
  narration: "旁白承接",
  observation: "观察线索",
  consequence: "行动后果",
  interruption: "事件打断",
  hook: "主线钩子",
};

const createLocalDraft = (
  source: SceneNovelSource,
  text: string,
  rewriteCount: number,
): SceneNovelDraft => ({
  id: crypto.randomUUID(),
  sourceId: source.id,
  platformStyleId: source.platformStyleId,
  text,
  quality: evaluateSceneNovelDraft({ text, source }),
  createdAt: Date.now(),
  rewriteCount,
});

export const SceneNovelizerPanel = ({
  source,
  workspacePath,
  runtimeAgentId,
  runtimeModel,
  disabled = false,
  onBusyChange,
}: SceneNovelizerPanelProps) => {
  const [platformStyleId, setPlatformStyleId] = useState<SceneNovelizerPlatformStyleId>(
    source.platformStyleId,
  );
  const [draft, setDraft] = useState<SceneNovelDraft | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const effectiveSource = useMemo((): SceneNovelSource => {
    const platformPackage = getSceneNovelizerPlatformPackage(platformStyleId);
    return {
      ...source,
      platformStyleId,
      constraints: {
        ...source.constraints,
        paragraphMaxChars: platformStyleId === "fanqie" ? 160 : 180,
      },
      unresolvedHooks: source.unresolvedHooks.length > 0
        ? source.unresolvedHooks
        : platformPackage.judgeFocus,
    };
  }, [platformStyleId, source]);
  const platformPackage = getSceneNovelizerPlatformPackage(platformStyleId);
  const canGenerate =
    !disabled &&
    !isGenerating &&
    Boolean(runtimeModel) &&
    effectiveSource.materials.length > 0;

  const generateDraft = async () => {
    if (!runtimeModel) {
      toast.error("当前模型不可用。");
      return;
    }

    if (effectiveSource.materials.length === 0) {
      toast.error("当前场景没有可用素材。");
      return;
    }

    setIsGenerating(true);
    setStreamingText("");
    onBusyChange?.(true);
    try {
      const nextDraft = await runSceneNovelizer({
        workspacePath,
        agentId: runtimeAgentId,
        runtimeModel,
        source: effectiveSource,
        autoRewrite: true,
        onTextDelta: (delta) => {
          setStreamingText((current) => `${current}${delta}`);
        },
      });
      setDraft(nextDraft);
      setStreamingText("");
      if (nextDraft.quality.verdict === "fail") {
        toast.warning("小说稿已生成，但质量分偏低。");
      } else {
        toast.success("小说稿已生成。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || "小说稿生成失败。");
    } finally {
      setIsGenerating(false);
      onBusyChange?.(false);
    }
  };

  const updateDraftText = (text: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            text,
            quality: evaluateSceneNovelDraft({ text, source: effectiveSource }),
          }
        : createLocalDraft(effectiveSource, text, 0)
    );
  };

  return (
    <section className="space-y-3 text-current">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold">
          <BookOpenText className="size-4 shrink-0 text-primary" />
          <span className="truncate">场景小说稿</span>
        </div>
        <Select
          value={platformStyleId}
          onValueChange={(value) =>
            setPlatformStyleId(value as SceneNovelizerPlatformStyleId)
          }
          disabled={isGenerating}
        >
          <SelectTrigger size="sm" className="h-8 max-w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCENE_NOVELIZER_PLATFORM_PACKAGES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.shortLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border border-current/10 bg-current/[0.045] p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium">{platformPackage.label}</span>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={!canGenerate}
            onClick={() => {
              void generateDraft();
            }}
          >
            {isGenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {draft ? "重写" : "生成"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {sourceStatItems(effectiveSource).map(([label, value]) => (
            <div
              key={label}
              className={cn(
                "rounded-md bg-current/5 px-2 py-1.5 text-center",
                value === 0 && "opacity-55",
              )}
            >
              <div className="text-[11px] font-semibold tabular-nums">{value}</div>
              <div className="text-[10px] opacity-65">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {isGenerating && streamingText.trim() && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-current/10 bg-background/70 p-3 font-serif text-xs leading-6 shadow-sm">
          {streamingText}
        </div>
      )}

      {draft && (
        <SceneNovelizerDraftView
          draft={draft}
          onTextChange={updateDraftText}
        />
      )}

      <details className="rounded-md border border-current/10 bg-current/[0.035] px-3 py-2 text-xs">
        <summary className="cursor-pointer select-none font-medium">素材</summary>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
          {effectiveSource.materials.slice(-18).map((material) => (
            <div key={material.id} className="border-l border-current/15 pl-2">
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] opacity-60">
                <span>#{material.turnIndex}</span>
                <span>{materialKindLabels[material.kind] ?? material.kind}</span>
                {material.characterName && <span>{material.characterName}</span>}
              </div>
              <div className="whitespace-pre-wrap leading-5 opacity-80">{material.text}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
};
