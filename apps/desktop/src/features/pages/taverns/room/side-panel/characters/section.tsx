import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpenText,
  BriefcaseBusiness,
  ChevronRight,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Target,
  TriangleAlertIcon,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { resolveAvatar } from "@/assets/avatars";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Textarea } from "@/components/ui/textarea";
import { requireRuntimeModelInput, type RuntimeModelOption } from "@/features/pages/settings/llm/store";
import { cn } from "@/lib/utils";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import {
  tavernCharacterAgentRoleId,
  formatTavernCharacterRelationshipSummary,
} from "@/features/pages/taverns/tavern/core";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { getVisualPreset } from "@/features/pages/taverns/tavern/visual-presets";
import { updateTavernActiveCharacterMemoryLayers } from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { runTavernAssetExtraction } from "@/features/pages/taverns/tavern/runtime/assistants";
import {
  compactTavernAgentKnowledge,
  rebuildTavernAgentKnowledge,
} from "@/features/pages/taverns/tavern/runtime/conversation";
import { buildTavernCharacterMemoryText } from "../memory-summary";
import { EmptyPanelCard, emptyValueText } from "../shared";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

type CharacterMemoryDraftMode = "manual" | "generated";

type CharacterConfirmAction = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
};

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const trimText = (value: string | undefined) => value?.trim() ?? "";

const trimArray = (values: string[] | undefined) => values?.map((value) => value.trim()).filter(Boolean) ?? [];

const splitLines = (value: string | undefined) =>
  trimText(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

const splitPhrases = (value: string | undefined) =>
  trimText(value)
    .split(/[，,、；;。.!！？?]+/)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0 && phrase.length <= 8)
    .slice(0, 3);

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const Pill = ({ children }: { children: ReactNode }) => (
  <span className="max-w-full truncate rounded-md bg-primary/10 px-1.5 py-1 text-[11px] font-medium leading-none text-primary">
    {children}
  </span>
);

const DetailSection = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) => (
  <section className="rounded-lg border border-current/10 bg-current/[0.06] p-2.5 shadow-sm dark:bg-current/[0.085]">
    <div className="mb-2 flex min-w-0 items-center gap-2 text-[12px] font-semibold text-current">
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="truncate">{title}</span>
    </div>
    {children}
  </section>
);

const LineList = ({ lines, empty = emptyValueText }: { lines: string[]; empty?: string }) => {
  if (lines.length === 0) {
    return <div className="text-xs leading-5 text-current/60">{empty}</div>;
  }

  return (
    <ul className="space-y-1.5 text-xs leading-5 text-current/80">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current/70" />
          <span className="min-w-0 whitespace-pre-wrap">{line}</span>
        </li>
      ))}
    </ul>
  );
};

const CharacterDetail = ({
  character,
  memory,
  isBusy,
  isCompacting,
  isRebuilding,
  isExtractingMemory,
  onAddMemory,
  onExtractMemory,
  onCompact,
  onRebuild,
}: {
  character: TavernCharacter;
  memory: string;
  isBusy?: boolean;
  isCompacting?: boolean;
  isRebuilding?: boolean;
  isExtractingMemory?: boolean;
  onAddMemory?: () => void;
  onExtractMemory?: () => void;
  onCompact?: () => void;
  onRebuild?: () => void;
}) => {
  const { activeRoom } = useTavernRoomContext();
  if (!activeRoom) {
    return null;
  }

  const avatar = resolveAvatar(character.avatar).src;
  const publicStatus = activeRoom.characterPublicStatuses[character.id];
  const privateStatus = activeRoom.characterPrivateStatuses[character.id];
  const holding = trimArray(publicStatus?.holding);
  const privateKnowledge = trimArray(privateStatus?.privateKnowledge);
  const speakingPhrases = splitPhrases(character.speakingStyle);
  const headerPills = unique([
    trimText(publicStatus?.visibleMood),
    trimText(publicStatus?.posture),
    ...speakingPhrases,
  ]).slice(0, 4);
  const profileSummary =
    trimText(character.description) ||
    trimText(publicStatus?.publicGoal) ||
    trimText(character.goals) ||
    trimText(character.speakingStyle);
  const stanceLines = [
    publicStatus?.location ? `位置：${publicStatus.location}` : "",
    publicStatus?.posture ? `姿态：${publicStatus.posture}` : "",
    publicStatus?.visibleMood ? `外显情绪：${publicStatus.visibleMood}` : "",
    publicStatus?.outfit ? `装束：${publicStatus.outfit}` : "",
    publicStatus?.visibleInjury ? `可见伤势：${publicStatus.visibleInjury}` : "",
    holding.length > 0 ? `持有：${holding.join("、")}` : "",
    privateStatus?.privateMood ? `私下情绪：${privateStatus.privateMood}` : "",
    privateStatus?.suspicion ? `疑虑：${privateStatus.suspicion}` : "",
  ].filter(Boolean);
  const goalLines = [
    ...splitLines(character.goals),
    publicStatus?.publicGoal ? `公开目标：${publicStatus.publicGoal}` : "",
    privateStatus?.hiddenGoal ? `隐藏目标：${privateStatus.hiddenGoal}` : "",
  ].filter(Boolean);
  const styleLines = [
    trimText(character.speakingStyle),
    character.writingStyle ? `叙述：${character.writingStyle}` : "",
    character.replyStylePrompt ? `回复约束：${character.replyStylePrompt}` : "",
  ].filter(Boolean);
  const relationshipSummary = formatTavernCharacterRelationshipSummary({
    character,
    room: activeRoom,
    maxItems: 4,
  });
  const relationshipLines = splitLines(relationshipSummary);
  const memoryLines = [
    trimText(memory),
    privateKnowledge.length > 0 ? `已知信息：${privateKnowledge.join("、")}` : "",
  ].filter(Boolean);
  const visualPreset = getVisualPreset(activeRoom.scenePresetId);
  const actionButtonClassName =
    "h-auto justify-start gap-3 border-current/15 bg-current/[0.055] px-3 py-2 text-left text-current hover:bg-current/10 hover:text-current dark:bg-current/[0.075]";

  return (
    <HoverCardContent
      side="left"
      align="start"
      sideOffset={8}
      className="w-[36rem] max-w-[calc(100vw-2rem)] !bg-transparent !p-0 text-left !shadow-none !ring-0"
    >
      <div
        className={cn(
          "space-y-2.5 rounded-xl border p-2.5 shadow-xl ring-1 ring-current/10",
          visualPreset.tavern.page,
          visualPreset.tavern.sidePanel,
        )}
      >
        <div className="overflow-hidden rounded-lg border border-current/10 bg-current/[0.075] shadow-sm dark:bg-current/[0.1]">
          <div className="grid min-h-36 md:grid-cols-[10.5rem_minmax(0,1fr)]">
            <div className="min-h-36 bg-current/10">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="min-w-0 p-4">
              <div className="truncate text-xl font-semibold leading-tight text-current">{character.name}</div>
              {headerPills.length > 0 && (
                <div className="mt-2.5 flex min-w-0 flex-wrap gap-1.5">
                  {headerPills.map((pill) => (
                    <Pill key={pill}>{pill}</Pill>
                  ))}
                </div>
              )}
              <div className="mt-3 line-clamp-3 text-[13px] leading-6 text-current/70">
                {profileSummary || "暂无角色设定"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          <DetailSection icon={Shield} title="当前立场">
            <LineList lines={stanceLines} empty="暂无公开状态" />
          </DetailSection>
          <DetailSection icon={Target} title="目标">
            <LineList lines={goalLines} empty="暂无目标" />
          </DetailSection>
          <DetailSection icon={MessageCircle} title="说话方式">
            {speakingPhrases.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {speakingPhrases.map((phrase) => (
                  <Pill key={phrase}>{phrase}</Pill>
                ))}
              </div>
            )}
            <LineList lines={styleLines} empty="暂无说话方式" />
          </DetailSection>
          <DetailSection icon={UsersRound} title="关系">
            <LineList lines={relationshipLines} empty="暂无关系记录" />
          </DetailSection>
        </div>

        <DetailSection icon={BookOpenText} title="角色记忆">
          <LineList lines={memoryLines} empty="暂无稳定记忆" />
        </DetailSection>

        {(onAddMemory || onExtractMemory || onCompact || onRebuild) && (
          <DetailSection icon={BriefcaseBusiness} title="角色工具">
            <div className="grid gap-2 md:grid-cols-2">
              {onAddMemory && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onAddMemory}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Plus className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">添加记忆</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      手动追加角色记忆
                    </span>
                  </span>
                </Button>
              )}
              {onExtractMemory && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onExtractMemory}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {isExtractingMemory ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">从剧情整理</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      生成待确认记忆草稿
                    </span>
                  </span>
                </Button>
              )}
              {onCompact && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onCompact}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {isCompacting ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">压缩角色知识</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      控制底层角色上下文长度
                    </span>
                  </span>
                </Button>
              )}
              {onRebuild && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={actionButtonClassName}
                  disabled={isBusy || isCompacting || isRebuilding || isExtractingMemory}
                  onClick={onRebuild}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {isRebuilding ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">重建记忆</span>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-current/70">
                      基于历史重建角色记忆
                    </span>
                  </span>
                </Button>
              )}
            </div>
          </DetailSection>
        )}
      </div>
    </HoverCardContent>
  );
};

const CharacterCardContent = ({ character, isActive }: { character: TavernCharacter; isActive: boolean }) => {
  const { activeRoom } = useTavernRoomContext();
  const avatar = resolveAvatar(character.avatar).src;
  const publicStatus = activeRoom?.characterPublicStatuses[character.id];
  const chipTexts = unique([
    trimText(publicStatus?.visibleMood),
    trimText(publicStatus?.posture),
    trimText(publicStatus?.location),
  ]).slice(0, 2);

  if (isActive) {
    return (
      <span className="block space-y-3">
        <span className="flex min-w-0 items-center gap-3">
          <img
            src={avatar}
            alt=""
            className="size-12 shrink-0 rounded-lg border border-current/15 bg-current/[0.045] object-cover shadow-sm dark:bg-current/[0.065]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center">
              <span className="truncate text-sm font-semibold leading-tight">{character.name}</span>
            </span>
            <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-current/65">
              {character.speakingStyle || character.description || "当前默认发言角色"}
            </span>
          </span>
        </span>
        {chipTexts.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {chipTexts.map((chip) => (
              <Pill key={chip}>{chip}</Pill>
            ))}
          </span>
        ) : (
          <span className="block rounded-lg border border-current/10 bg-current/[0.06] px-3 py-2.5 text-xs text-current/65 dark:bg-current/[0.085]">
            暂无公开状态
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img
        src={avatar}
        alt=""
        className="size-10 shrink-0 rounded-lg border border-current/15 bg-current/[0.045] object-cover shadow-sm dark:bg-current/[0.065]"
      />
      <span className="min-w-[4.5rem] max-w-[5.5rem] truncate text-[13px] font-semibold leading-tight">
        {character.name}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-current/65">
        {publicStatus?.publicGoal || publicStatus?.visibleMood || character.description || "入席角色"}
      </span>
      <ChevronRight className="size-4 shrink-0 text-current/60" />
    </span>
  );
};

const CharacterCard = ({
  character,
  isActive,
  disabled,
  memory,
  isBusy,
  isCompacting,
  isRebuilding,
  isExtractingMemory,
  onClick,
  onAddMemory,
  onExtractMemory,
  onCompact,
  onRebuild,
}: {
  character: TavernCharacter;
  isActive: boolean;
  disabled: boolean;
  memory: string;
  isBusy: boolean;
  isCompacting: boolean;
  isRebuilding: boolean;
  isExtractingMemory: boolean;
  onClick: () => void;
  onAddMemory: () => void;
  onExtractMemory: () => void;
  onCompact: () => void;
  onRebuild: () => void;
}) => (
  <HoverCard openDelay={120} closeDelay={120}>
    <HoverCardTrigger asChild>
      <button
        type="button"
        className={cn(
          "w-full min-w-0 rounded-xl border border-current/10 bg-current/[0.055] p-2.5 text-left text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 dark:bg-current/[0.075]",
          isActive && "border-primary/30 bg-primary/10 ring-1 ring-primary/10",
        )}
        disabled={disabled}
        onClick={onClick}
      >
        <CharacterCardContent character={character} isActive={isActive} />
      </button>
    </HoverCardTrigger>
    <CharacterDetail
      character={character}
      memory={memory}
      isBusy={isBusy}
      isCompacting={isCompacting}
      isRebuilding={isRebuilding}
      isExtractingMemory={isExtractingMemory}
      onAddMemory={onAddMemory}
      onExtractMemory={onExtractMemory}
      onCompact={onCompact}
      onRebuild={onRebuild}
    />
  </HoverCard>
);

export const CharacterStatusSection = ({
  externalBusy,
  onBusyChange,
}: {
  externalBusy: boolean;
  onBusyChange?: (isBusy: boolean) => void;
}) => {
  const {
    activeRoom,
    activeCharacter,
    roomCharacters,
    roomMessages,
    runtimeModel,
    isSending,
    patchRoom,
    reportError,
    resetExecutionTrace,
    patchExecutionStep,
    setExecutionTraceAnchorMessageId,
    workspace,
  } = useTavernRoomContext();
  const [compactingCharacterIds, setCompactingCharacterIds] = useState<Set<string>>(() => new Set());
  const [rebuildingCharacterIds, setRebuildingCharacterIds] = useState<Set<string>>(() => new Set());
  const [extractingCharacterMemoryIds, setExtractingCharacterMemoryIds] = useState<Set<string>>(() => new Set());
  const [memoryDraftCharacterId, setMemoryDraftCharacterId] = useState<string | null>(null);
  const [memoryDraftText, setMemoryDraftText] = useState("");
  const [memoryDraftMode, setMemoryDraftMode] = useState<CharacterMemoryDraftMode>("manual");
  const [pendingConfirmAction, setPendingConfirmAction] = useState<CharacterConfirmAction | null>(null);
  const isCharacterBusy =
    compactingCharacterIds.size > 0 || rebuildingCharacterIds.size > 0 || extractingCharacterMemoryIds.size > 0;
  const isBusy = externalBusy || isCharacterBusy;
  const memoryDraftCharacter = memoryDraftCharacterId
    ? roomCharacters.find((character) => character.id === memoryDraftCharacterId)
    : undefined;

  useEffect(() => {
    onBusyChange?.(isCharacterBusy);
  }, [isCharacterBusy, onBusyChange]);

  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  if (!activeRoom) {
    return null;
  }

  const openMemoryDraftDialog = (characterId: string, note = "", mode: CharacterMemoryDraftMode = "manual") => {
    setMemoryDraftCharacterId(characterId);
    setMemoryDraftText(note);
    setMemoryDraftMode(mode);
  };

  const closeMemoryDraftDialog = () => {
    setMemoryDraftCharacterId(null);
    setMemoryDraftText("");
    setMemoryDraftMode("manual");
  };

  const closeConfirmAction = () => {
    setPendingConfirmAction(null);
  };

  const confirmPendingAction = () => {
    if (!pendingConfirmAction) {
      return;
    }

    pendingConfirmAction.onConfirm();
    closeConfirmAction();
  };

  const appendCharacterMemory = (characterId: string, note: string) => {
    const nextNote = note.trim();
    if (!nextNote) {
      reportError("请输入要添加的角色记忆。");
      return;
    }

    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要添加记忆的角色。");
      return;
    }

    const activeInstance = activeRoom.sceneInstances.find(
      (instance) => instance.id === activeRoom.activeSceneInstanceId,
    );
    const existing = activeInstance?.characterMemoryLayers?.[characterId]?.known.trim() ?? "";
    const nextKnownMemory = existing ? [existing, nextNote].join("\n") : nextNote;
    const nextRoom = updateTavernActiveCharacterMemoryLayers(activeRoom, characterId, {
      known: nextKnownMemory,
    });

    patchRoom(activeRoom.id, nextRoom);
    closeMemoryDraftDialog();
    toast.success(`已添加 ${character.name} 的角色记忆。`);
  };

  const extractCharacterMemoryFromRecentPlot = async (characterId: string) => {
    if (isBusy) {
      return;
    }

    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要整理记忆的角色。");
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再整理角色记忆。");
      return;
    }

    const availableMessages = roomMessages.filter(
      (message) => message.status !== "streaming" && message.status !== "error",
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      reportError("当前房间还没有可整理的对话。");
      return;
    }

    setExtractingCharacterMemoryIds((current) => new Set([...current, characterId]));
    reportError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(sourceMessages.at(-1)?.id ?? "");
      resetExecutionTrace([
        {
          id: `character-memory-extraction-${characterId}`,
          label: `整理 ${character.name} 的记忆`,
          detail: "从最近对话中提取该角色需要长期记住的事实。",
          status: "running",
        },
      ]);
    }

    try {
      const extractedDraft = await runTavernAssetExtraction({
        workspacePath: workspace.path,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: `只整理「${character.name}」需要长期记住的稳定事实，输出 characterMemories 时只使用 characterId="${character.id}"。`,
      });
      const generatedMemory = extractedDraft.characterMemories
        .filter((memory) => memory.characterId === character.id && memory.note.trim())
        .map((memory) => memory.note.trim())
        .filter(Boolean)
        .join("\n");

      if (!generatedMemory) {
        patchExecutionStep(`character-memory-extraction-${characterId}`, {
          status: "done",
          detail: "没有发现该角色新的稳定记忆。",
        });
        toast.info(`最近剧情没有整理出 ${character.name} 的新记忆。`);
        return;
      }

      openMemoryDraftDialog(character.id, generatedMemory, "generated");
      patchExecutionStep(`character-memory-extraction-${characterId}`, {
        status: "done",
        detail: "已生成待确认角色记忆。",
      });
      toast.success(`已整理 ${character.name} 的角色记忆，请确认后添加。`);
    } catch (assetError) {
      patchExecutionStep(`character-memory-extraction-${characterId}`, {
        status: "error",
        detail: getErrorMessage(assetError),
      });
      reportError(`整理角色记忆失败：${getErrorMessage(assetError)}`);
    } finally {
      setExtractingCharacterMemoryIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  };

  const compactCharacterKnowledge = async (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要压缩知识的角色。");
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再压缩角色知识。");
      return;
    }

    setCompactingCharacterIds((current) => new Set([...current, characterId]));
    reportError("");
    try {
      const result = await compactTavernAgentKnowledge({
        workspacePath: workspace.path,
        room: activeRoom,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        agentRoleId: tavernCharacterAgentRoleId(activeRoom, character),
        compactInstruction: [
          `压缩「${character.name}」在当前酒馆中的长期角色知识。`,
          "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
          "不要引入其他角色未公开的心理描写。",
        ].join("\n"),
      });
      toast.success(
        result?.compacted === false
          ? `${character.name} 的底层 session 暂无可压缩内容。`
          : `已压缩 ${character.name} 的角色知识。`,
      );
    } catch (compactError) {
      reportError(`压缩角色知识失败：${getErrorMessage(compactError)}`);
    } finally {
      setCompactingCharacterIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  };

  const rebuildCharacterKnowledge = async (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要重建记忆的角色。");
      return;
    }

    if (!runtimeModel) {
      reportError("请先在设置中选择模型，再重建角色记忆。");
      return;
    }

    setRebuildingCharacterIds((current) => new Set([...current, characterId]));
    reportError("");
    try {
      await rebuildTavernAgentKnowledge({
        workspacePath: workspace.path,
        room: activeRoom,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        agentRoleId: tavernCharacterAgentRoleId(activeRoom, character),
        rebuildInstruction: [
          `重建「${character.name}」在当前酒馆中的长期角色记忆。`,
          "基于酒馆历史、可见事实、角色设定、角色记忆和关系变化恢复该角色应当知道的上下文。",
          "保留角色已经知道的公开事实、自己产生过的心理与承诺、与其他角色的关系变化。",
          "不要引入其他角色未公开给该角色的心理描写或秘密。",
        ].join("\n"),
        userMessage: `请重建「${character.name}」的长期角色记忆。`,
      });
      toast.success(`已重建 ${character.name} 的角色记忆。`);
    } catch (rebuildError) {
      reportError(`重建角色记忆失败：${getErrorMessage(rebuildError)}`);
    } finally {
      setRebuildingCharacterIds((current) => {
        const next = new Set(current);
        next.delete(characterId);
        return next;
      });
    }
  };

  const requestCompactCharacterKnowledge = (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要压缩知识的角色。");
      return;
    }

    setPendingConfirmAction({
      title: "压缩角色知识",
      description: `压缩「${character.name}」的底层角色知识？这会精简该角色 Agent 的上下文，保留长期事实、承诺和关系变化。`,
      confirmLabel: "确认压缩",
      onConfirm: () => void compactCharacterKnowledge(characterId),
    });
  };

  const requestRebuildCharacterKnowledge = (characterId: string) => {
    const character = roomCharacters.find((item) => item.id === characterId);
    if (!character) {
      reportError("未找到要重建记忆的角色。");
      return;
    }

    setPendingConfirmAction({
      title: "重建角色记忆",
      description: `重建「${character.name}」的底层角色记忆？这会基于酒馆历史重新恢复该角色应当知道的上下文，不会删除当前酒馆中保存的角色记忆文本。`,
      confirmLabel: "确认重建",
      onConfirm: () => void rebuildCharacterKnowledge(characterId),
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex min-h-8 items-center gap-2 text-sm font-semibold leading-tight text-current">
        <UsersRound className="size-4 shrink-0 text-primary" />
        <span className="truncate">入席角色</span>
      </div>
      <div className="space-y-2">
        {roomCharacters.map((character) => {
          const isCompacting = compactingCharacterIds.has(character.id);
          const isRebuilding = rebuildingCharacterIds.has(character.id);
          const isExtractingMemory = extractingCharacterMemoryIds.has(character.id);
          return (
            <CharacterCard
              key={character.id}
              character={character}
              isActive={character.id === activeCharacter?.id}
              disabled={isSending}
              memory={buildTavernCharacterMemoryText(activeRoom, character)}
              isBusy={isBusy}
              isCompacting={isCompacting}
              isRebuilding={isRebuilding}
              isExtractingMemory={isExtractingMemory}
              onClick={() => patchRoom(activeRoom.id, { activeCharacterId: character.id })}
              onAddMemory={() => openMemoryDraftDialog(character.id)}
              onExtractMemory={() => void extractCharacterMemoryFromRecentPlot(character.id)}
              onCompact={() => requestCompactCharacterKnowledge(character.id)}
              onRebuild={() => requestRebuildCharacterKnowledge(character.id)}
            />
          );
        })}
        {roomCharacters.length === 0 && <EmptyPanelCard>还没有角色入席。</EmptyPanelCard>}
      </div>

      <Dialog
        open={Boolean(memoryDraftCharacter)}
        onOpenChange={(open) => {
          if (!open) {
            closeMemoryDraftDialog();
          }
        }}
      >
        {memoryDraftCharacter && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{memoryDraftMode === "generated" ? "确认角色记忆" : "添加角色记忆"}</DialogTitle>
              <DialogDescription>
                {memoryDraftMode === "generated"
                  ? `模型已从最近剧情中整理出「${memoryDraftCharacter.name}」的长期记忆，确认后会追加到当前酒馆角色记忆。`
                  : `追加到「${memoryDraftCharacter.name}」在当前酒馆中的长期角色记忆。`}
              </DialogDescription>
            </DialogHeader>

            <Textarea
              value={memoryDraftText}
              className="min-h-32 resize-none"
              placeholder={
                memoryDraftMode === "generated"
                  ? "确认或修改模型整理的角色记忆。"
                  : "写下这个角色需要长期记住的事实、承诺、关系变化或已知信息。"
              }
              onChange={(event) => setMemoryDraftText(event.target.value)}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeMemoryDraftDialog}>
                取消
              </Button>
              <Button
                type="button"
                disabled={!memoryDraftText.trim()}
                onClick={() => appendCharacterMemory(memoryDraftCharacter.id, memoryDraftText)}
              >
                <Save className="size-3.5" />
                {memoryDraftMode === "generated" ? "确认添加" : "添加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(pendingConfirmAction)}
        onOpenChange={(open) => {
          if (!open) {
            closeConfirmAction();
          }
        }}
      >
        {pendingConfirmAction && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>{pendingConfirmAction.title}</DialogTitle>
              </div>
              <DialogDescription>{pendingConfirmAction.description}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeConfirmAction}>
                取消
              </Button>
              <Button type="button" variant="destructive" onClick={confirmPendingAction}>
                {pendingConfirmAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
};
