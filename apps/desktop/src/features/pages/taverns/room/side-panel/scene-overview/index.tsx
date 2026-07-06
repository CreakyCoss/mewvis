import type {
  TavernCharacterMemoryLayers,
  TavernRuntimeRoom as TavernRoom,
  TavernSceneMemoryLayers,
} from "@/features/pages/taverns/room/model";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Eye,
  FileText,
  LockKeyhole,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  addTavernSecretMemoryEntry,
  listTavernBranchSecretMemoryEntries,
  loadTavernBranchUpstreamMemory,
  revealTavernSecretMemory,
} from "@/features/pages/taverns/tavern/runtime/branch-memory-runtime";
import {
  updateTavernActiveCharacterMemoryLayers,
  updateTavernActiveSceneMemoryLayers,
  updateTavernActiveScenePromptOverrides,
} from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import {
  getTavernSceneDisplayTitle,
  getTavernSceneInstanceDisplayTitle,
} from "@/features/pages/taverns/tavern/runtime/scene-selectors";
import type { TavernPromptBlock, TavernReplyMode } from "@/features/pages/taverns/manage/model";
import { useTavernRoomContext } from "@/features/pages/taverns/room/context";
import { compactText } from "../shared";
import { buildTavernMemoryOverviewSummary } from "../memory-summary";

type SceneOverviewSectionProps = {
  externalBusy: boolean;
  onBusyChange?: (isBusy: boolean) => void;
  onOpenTipsDetail: () => void;
};

const replyModeDescriptions: Record<TavernReplyMode, string> = {
  director: "由导演选择合适角色发言",
};

const OverviewHeader = ({
  sceneTitle,
  scenePhase,
  sceneStatusItems,
}: {
  sceneTitle: string;
  scenePhase: string;
  sceneStatusItems: string[];
}) => (
  <header className="space-y-2">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight text-current">场景概览</div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-current/70">
          <span className="min-w-0 truncate">{sceneTitle}</span>
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          <span className="shrink-0 font-medium text-primary">{scenePhase}</span>
        </div>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] text-current shadow-sm transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="查看对话设置"
            >
              <Settings className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="start"
            sideOffset={8}
            className="block max-w-72 whitespace-normal px-3 py-2 text-left leading-5"
          >
            <div className="space-y-1">
              {sceneStatusItems.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </header>
);

const SectionCard = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div
    className={`rounded-xl border border-current/10 bg-current/[0.045] dark:bg-current/[0.065] text-current shadow-sm ${className}`}
  >
    {children}
  </div>
);

const CardHeading = ({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) => (
  <div className="flex items-center gap-2 text-[13px] font-semibold">
    <Icon className="size-4 shrink-0 text-primary" />
    <span className="min-w-0 truncate">{children}</span>
  </div>
);

const GoalTargetIcon = () => (
  <span
    className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-primary shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
    aria-hidden="true"
  >
    <Target className="size-5" />
    <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_75%,transparent)]" />
    <span className="absolute right-2 top-1.5 h-4 w-px -rotate-45 rounded-full bg-primary/75" />
    <span className="absolute right-1.5 top-1 size-1 rounded-full bg-primary/75" />
  </span>
);

const GoalCard = ({ sceneGoal }: { sceneGoal: string | undefined }) => (
  <SectionCard className="overflow-hidden px-3 py-3">
    <div className="flex items-center gap-2.5">
      <GoalTargetIcon />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-primary">当前目标</div>
        <div className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5">{compactText(sceneGoal)}</div>
        <div className="mt-0.5 text-[11px] leading-4 text-current/65">当前回合最优先处理事项</div>
      </div>
    </div>
  </SectionCard>
);

const DetailRow = ({
  icon: Icon,
  title,
  summary,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] px-3 py-2.5 text-left text-current transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={onClick}
  >
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="size-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold leading-5">{title}</span>
      <span className="mt-0.5 line-clamp-1 block text-[11px] leading-4 text-current/60">{summary}</span>
    </span>
    <ChevronDown className="size-4 shrink-0 text-current/60" />
  </button>
);

const SceneDetailsSection = ({
  immersiveDescriptionEnabled,
  scene,
  memorySummary,
  isSending,
  onOpenTipsDetail,
  onImmersiveDescriptionChange,
}: {
  immersiveDescriptionEnabled: boolean;
  scene: string | undefined;
  memorySummary: string | undefined;
  isSending: boolean;
  onOpenTipsDetail: () => void;
  onImmersiveDescriptionChange: (checked: boolean) => void;
}) => (
  <SectionCard className="space-y-2 px-3 py-3">
    <CardHeading icon={BookOpen}>场景详情</CardHeading>
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-current/10 bg-current/[0.055] dark:bg-current/[0.075] px-3 py-2.5 text-current">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Eye className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-5">沉浸描写</span>
        <span className="mt-0.5 block truncate text-[11px] leading-4 text-current/60">动作、神态、感官与环境互动</span>
      </span>
      <Switch
        size="sm"
        checked={immersiveDescriptionEnabled}
        disabled={isSending}
        aria-label="切换沉浸描写"
        onCheckedChange={onImmersiveDescriptionChange}
      />
    </div>
    <DetailRow icon={FileText} title="场景描述" summary={compactText(scene)} onClick={onOpenTipsDetail} />
    <DetailRow icon={Brain} title="节点记忆" summary={compactText(memorySummary)} onClick={onOpenTipsDetail} />
  </SectionCard>
);

type MemoryEditorTarget = "scene" | string;

type MemoryEditorDraft = {
  required: string;
  upstream: string;
  public: string;
  private: string;
  known: string;
  privateSelf: string;
  directorSecret: string;
};

type PromptOverrideDraft = {
  bridge: string;
  director: string;
  character: string;
};

const createMemoryEditorDraft = (target: MemoryEditorTarget, activeRoom: TavernRoom): MemoryEditorDraft => {
  const activeInstance = activeRoom.sceneInstances.find((instance) => instance.id === activeRoom.activeSceneInstanceId);
  if (target === "scene") {
    const layers = activeInstance?.memoryLayers;
    return {
      required: layers?.required ?? "",
      upstream: layers?.upstream ?? "",
      public: layers?.public ?? "",
      private: layers?.private ?? "",
      known: "",
      privateSelf: "",
      directorSecret: layers?.directorSecret ?? "",
    };
  }

  const layers = activeInstance?.characterMemoryLayers?.[target];
  return {
    required: layers?.required ?? "",
    upstream: "",
    public: layers?.public ?? "",
    private: "",
    known: layers?.known ?? "",
    privateSelf: layers?.privateSelf ?? "",
    directorSecret: layers?.directorSecret ?? "",
  };
};

const createPromptOverrideDraft = (activeRoom: TavernRoom): PromptOverrideDraft => {
  const activeInstance = activeRoom.sceneInstances.find((instance) => instance.id === activeRoom.activeSceneInstanceId);
  const blockByTarget = new Map(
    (activeInstance?.promptOverrides?.blocks ?? []).map((block) => [block.target, block.text] as const),
  );

  return {
    bridge: blockByTarget.get("bridge") ?? "",
    director: blockByTarget.get("director") ?? "",
    character: blockByTarget.get("character") ?? "",
  };
};

const createPromptOverrideBlocks = (draft: PromptOverrideDraft): TavernPromptBlock[] =>
  [["bridge", "底层会话"] as const, ["director", "导演"] as const, ["character", "角色"] as const].flatMap(
    ([target, label], index) => {
      const text = draft[target].trim();
      return text
        ? [
            {
              id: `node-prompt-override:${target}`,
              target,
              label: `节点风格补充：${label}`,
              text,
              enabled: true,
              order: 9000 + index,
              source: {
                type: "custom",
                id: "node-prompt-override",
                label: "节点风格补充",
              },
            },
          ]
        : [];
    },
  );

const ToolActionsSection = ({
  isBusy,
  hasSecrets,
  onOpenMemoryEditor,
  onOpenPromptOverrideEditor,
  onOpenRecordSecret,
  onOpenRevealSecret,
}: {
  isBusy: boolean;
  hasSecrets: boolean;
  onOpenMemoryEditor: () => void;
  onOpenPromptOverrideEditor: () => void;
  onOpenRecordSecret: () => void;
  onOpenRevealSecret: () => void;
}) => (
  <SectionCard className="space-y-2.5 px-3 py-3">
    <CardHeading icon={Sparkles}>工具操作</CardHeading>
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onOpenMemoryEditor}
      >
        <Brain className="size-3.5" />
        编辑记忆
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onOpenPromptOverrideEditor}
      >
        <FileText className="size-3.5" />
        节点提示
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy}
        onClick={onOpenRecordSecret}
      >
        <LockKeyhole className="size-3.5" />
        记录秘密
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-8 border-primary/35 bg-current/[0.055] dark:bg-current/[0.075] text-xs text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        disabled={isBusy || !hasSecrets}
        onClick={onOpenRevealSecret}
      >
        <Eye className="size-3.5" />
        解密秘密
      </Button>
    </div>
  </SectionCard>
);

export const SceneOverviewSection = ({ externalBusy, onBusyChange, onOpenTipsDetail }: SceneOverviewSectionProps) => {
  const { activeRoom, roomCharacters, isSending, patchRoom } = useTavernRoomContext();
  const [secretDialogMode, setSecretDialogMode] = useState<"record" | "reveal" | null>(null);
  const [secretDraftText, setSecretDraftText] = useState("");
  const [secretDraftTarget, setSecretDraftTarget] = useState("scene");
  const [selectedSecretId, setSelectedSecretId] = useState("");
  const [revealVisibility, setRevealVisibility] = useState<"public" | "character">("public");
  const [revealCharacterId, setRevealCharacterId] = useState("");
  const [isMemoryDialogOpen, setIsMemoryDialogOpen] = useState(false);
  const [memoryEditorTarget, setMemoryEditorTarget] = useState<MemoryEditorTarget>("scene");
  const [memoryEditorDraft, setMemoryEditorDraft] = useState<MemoryEditorDraft>({
    required: "",
    upstream: "",
    public: "",
    private: "",
    known: "",
    privateSelf: "",
    directorSecret: "",
  });
  const [isPromptOverrideDialogOpen, setIsPromptOverrideDialogOpen] = useState(false);
  const [promptOverrideDraft, setPromptOverrideDraft] = useState<PromptOverrideDraft>({
    bridge: "",
    director: "",
    character: "",
  });

  useEffect(
    () => () => {
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  if (!activeRoom) {
    return null;
  }

  const isBusy = isSending || externalBusy;
  const userPersonaName = activeRoom.userPersonaName.trim();
  const activeScene = activeRoom.scenes?.find((scene) => scene.id === activeRoom.activeSceneId);
  const sceneOverviewTitle =
    getTavernSceneInstanceDisplayTitle(activeRoom, activeRoom.activeSceneInstanceId, "") ||
    getTavernSceneDisplayTitle(activeRoom, activeScene?.id, "") ||
    activeRoom.sceneStatus?.location?.trim() ||
    activeRoom.title.trim() ||
    "当前场景";
  const sceneOverviewPhase =
    activeRoom.sceneStatus?.scenePhase?.trim() ||
    activeRoom.sceneStatus?.atmosphere?.trim() ||
    activeRoom.sceneStatus?.timeLabel?.trim() ||
    "进行中";
  const sceneStatusItems = [
    `回复方式：${replyModeDescriptions[activeRoom.replyMode ?? "director"]}`,
    userPersonaName && userPersonaName !== "我" ? `你的称呼：${userPersonaName}` : "",
    `沉浸描写：${activeRoom.settings.immersiveDescriptionEnabled ? "开启" : "关闭"}`,
    `生成过程：${activeRoom.settings.showExecutionTrace ? "显示" : "隐藏"}`,
    `自动整理资产：${activeRoom.settings.autoAssetExtractionEnabled ? "开启" : "关闭"}`,
  ].filter(Boolean);
  const characterNameById = new Map(roomCharacters.map((character) => [character.id, character.name]));
  const branchSecretOptions = listTavernBranchSecretMemoryEntries(activeRoom);
  const memoryOverviewSummary = buildTavernMemoryOverviewSummary(activeRoom, roomCharacters);

  const openMemoryEditor = () => {
    setMemoryEditorTarget("scene");
    setMemoryEditorDraft(createMemoryEditorDraft("scene", activeRoom));
    setIsMemoryDialogOpen(true);
  };

  const changeMemoryEditorTarget = (target: MemoryEditorTarget) => {
    setMemoryEditorTarget(target);
    setMemoryEditorDraft(createMemoryEditorDraft(target, activeRoom));
  };

  const closeMemoryEditor = () => {
    setIsMemoryDialogOpen(false);
  };

  const saveMemoryEditor = () => {
    if (memoryEditorTarget === "scene") {
      const nextRoom = updateTavernActiveSceneMemoryLayers(activeRoom, {
        required: memoryEditorDraft.required.trim(),
        upstream: memoryEditorDraft.upstream.trim(),
        public: memoryEditorDraft.public.trim(),
        private: memoryEditorDraft.private.trim(),
        directorSecret: memoryEditorDraft.directorSecret.trim(),
      } satisfies Partial<TavernSceneMemoryLayers>);
      patchRoom(activeRoom.id, nextRoom);
      toast.success("当前节点场景记忆已更新。");
      closeMemoryEditor();
      return;
    }

    const nextRoom = updateTavernActiveCharacterMemoryLayers(activeRoom, memoryEditorTarget, {
      required: memoryEditorDraft.required.trim(),
      public: memoryEditorDraft.public.trim(),
      known: memoryEditorDraft.known.trim(),
      privateSelf: memoryEditorDraft.privateSelf.trim(),
      directorSecret: memoryEditorDraft.directorSecret.trim(),
    } satisfies Partial<TavernCharacterMemoryLayers>);
    patchRoom(activeRoom.id, nextRoom);
    toast.success("当前节点角色记忆已更新。");
    closeMemoryEditor();
  };

  const openPromptOverrideEditor = () => {
    setPromptOverrideDraft(createPromptOverrideDraft(activeRoom));
    setIsPromptOverrideDialogOpen(true);
  };

  const closePromptOverrideEditor = () => {
    setIsPromptOverrideDialogOpen(false);
  };

  const savePromptOverrideEditor = () => {
    const nextRoom = updateTavernActiveScenePromptOverrides(activeRoom, {
      version: 1,
      blocks: createPromptOverrideBlocks(promptOverrideDraft),
    });
    patchRoom(activeRoom.id, nextRoom);
    toast.success("当前节点提示词补充已更新。");
    closePromptOverrideEditor();
  };

  const closeSecretDialog = () => {
    setSecretDialogMode(null);
    setSecretDraftText("");
  };

  const openRecordSecretDialog = () => {
    setSecretDraftTarget("scene");
    setSecretDraftText("");
    setSecretDialogMode("record");
  };

  const openRevealSecretDialog = () => {
    setSelectedSecretId((current) =>
      branchSecretOptions.some((option) => option.secretId === current)
        ? current
        : (branchSecretOptions[0]?.secretId ?? ""),
    );
    setRevealVisibility("public");
    setRevealCharacterId(roomCharacters[0]?.id ?? "");
    setSecretDialogMode("reveal");
  };

  const recordSecretMemory = () => {
    const result = addTavernSecretMemoryEntry(activeRoom, {
      target: secretDraftTarget === "scene" ? { type: "scene" } : { type: "character", characterId: secretDraftTarget },
      text: secretDraftText,
    });
    if (!result.entry) {
      return;
    }

    patchRoom(activeRoom.id, result.room);
    toast.success("已记录当前节点秘密");
    closeSecretDialog();
  };

  const revealSecretMemory = () => {
    const secretOption = branchSecretOptions.find((option) => option.secretId === selectedSecretId);
    if (!secretOption) {
      return;
    }
    const result = revealTavernSecretMemory(activeRoom, {
      secretId: secretOption.secretId,
      visibility: revealVisibility,
      targetCharacterIds: revealVisibility === "character" ? [revealCharacterId] : [],
    });
    if (!result.reveal) {
      return;
    }

    const refreshed = loadTavernBranchUpstreamMemory(result.room);
    patchRoom(activeRoom.id, refreshed.room);
    toast.success(revealVisibility === "public" ? "秘密已公开" : "秘密已对角色解密");
    closeSecretDialog();
  };

  return (
    <section className="space-y-4">
      <OverviewHeader
        sceneTitle={sceneOverviewTitle}
        scenePhase={sceneOverviewPhase}
        sceneStatusItems={sceneStatusItems}
      />
      <GoalCard sceneGoal={activeRoom.sceneGoal} />
      <SceneDetailsSection
        immersiveDescriptionEnabled={activeRoom.settings.immersiveDescriptionEnabled}
        scene={activeRoom.scene}
        memorySummary={memoryOverviewSummary}
        isSending={isSending}
        onOpenTipsDetail={onOpenTipsDetail}
        onImmersiveDescriptionChange={(checked) =>
          patchRoom(activeRoom.id, {
            settings: {
              ...activeRoom.settings,
              immersiveDescriptionEnabled: checked,
            },
          })
        }
      />
      <ToolActionsSection
        isBusy={isBusy}
        hasSecrets={branchSecretOptions.length > 0}
        onOpenMemoryEditor={openMemoryEditor}
        onOpenPromptOverrideEditor={openPromptOverrideEditor}
        onOpenRecordSecret={openRecordSecretDialog}
        onOpenRevealSecret={openRevealSecretDialog}
      />
      <Dialog
        open={isMemoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeMemoryEditor();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑节点记忆</DialogTitle>
            <DialogDescription>
              只修改当前节点实例的场景/角色记忆层；底层规范、视角和输出协议不在这里开放编辑。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <NativeSelect
              value={memoryEditorTarget}
              onChange={(event) => changeMemoryEditorTarget(event.currentTarget.value)}
            >
              <NativeSelectOption value="scene">当前场景</NativeSelectOption>
              {roomCharacters.map((character) => (
                <NativeSelectOption key={character.id} value={character.id}>
                  {character.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">必须记忆</span>
                <Textarea
                  value={memoryEditorDraft.required}
                  className="min-h-24 resize-none"
                  onChange={(event) =>
                    setMemoryEditorDraft((draft) => ({
                      ...draft,
                      required: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {memoryEditorTarget === "scene" ? "公开记忆" : "角色公开记忆"}
                </span>
                <Textarea
                  value={memoryEditorDraft.public}
                  className="min-h-24 resize-none"
                  onChange={(event) =>
                    setMemoryEditorDraft((draft) => ({
                      ...draft,
                      public: event.target.value,
                    }))
                  }
                />
              </label>
              {memoryEditorTarget === "scene" ? (
                <>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">上游汇总</span>
                    <Textarea
                      value={memoryEditorDraft.upstream}
                      className="min-h-24 resize-none"
                      onChange={(event) =>
                        setMemoryEditorDraft((draft) => ({
                          ...draft,
                          upstream: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">分支私有</span>
                    <Textarea
                      value={memoryEditorDraft.private}
                      className="min-h-24 resize-none"
                      onChange={(event) =>
                        setMemoryEditorDraft((draft) => ({
                          ...draft,
                          private: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">角色已知</span>
                    <Textarea
                      value={memoryEditorDraft.known}
                      className="min-h-24 resize-none"
                      onChange={(event) =>
                        setMemoryEditorDraft((draft) => ({
                          ...draft,
                          known: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">角色私有</span>
                    <Textarea
                      value={memoryEditorDraft.privateSelf}
                      className="min-h-24 resize-none"
                      onChange={(event) =>
                        setMemoryEditorDraft((draft) => ({
                          ...draft,
                          privateSelf: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">导演秘密</span>
              <Textarea
                value={memoryEditorDraft.directorSecret}
                className="min-h-20 resize-none"
                onChange={(event) =>
                  setMemoryEditorDraft((draft) => ({
                    ...draft,
                    directorSecret: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeMemoryEditor}>
              取消
            </Button>
            <Button type="button" onClick={saveMemoryEditor}>
              保存记忆
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isPromptOverrideDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePromptOverrideEditor();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>节点提示词补充</DialogTitle>
            <DialogDescription>
              当前节点会继承酒馆级预设；这里只追加局部风格/调度补充，不修改底层视角、输出协议和可见性规范。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">角色 Agent 补充</span>
              <Textarea
                value={promptOverrideDraft.character}
                className="min-h-24 resize-none"
                onChange={(event) =>
                  setPromptOverrideDraft((draft) => ({
                    ...draft,
                    character: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">导演 Agent 补充</span>
              <Textarea
                value={promptOverrideDraft.director}
                className="min-h-24 resize-none"
                onChange={(event) =>
                  setPromptOverrideDraft((draft) => ({
                    ...draft,
                    director: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Bridge 补充</span>
              <Textarea
                value={promptOverrideDraft.bridge}
                className="min-h-20 resize-none"
                onChange={(event) =>
                  setPromptOverrideDraft((draft) => ({
                    ...draft,
                    bridge: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closePromptOverrideEditor}>
              取消
            </Button>
            <Button type="button" onClick={savePromptOverrideEditor}>
              保存补充
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={secretDialogMode === "record"}
        onOpenChange={(open) => {
          if (!open) {
            closeSecretDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>记录秘密</DialogTitle>
            <DialogDescription>
              保存到当前节点场景实例，默认只作为隐藏记忆，之后可公开或对指定角色解密。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <NativeSelect value={secretDraftTarget} onChange={(event) => setSecretDraftTarget(event.target.value)}>
              <NativeSelectOption value="scene">场景秘密</NativeSelectOption>
              {roomCharacters.map((character) => (
                <NativeSelectOption key={character.id} value={character.id}>
                  {character.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Textarea
              value={secretDraftText}
              className="min-h-28 resize-none"
              placeholder="写下暂不公开的事实、身份、暗号、动机或只应由导演掌握的信息。"
              onChange={(event) => setSecretDraftText(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeSecretDialog}>
              取消
            </Button>
            <Button type="button" disabled={!secretDraftText.trim()} onClick={recordSecretMemory}>
              <Check className="size-3.5" />
              记录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={secretDialogMode === "reveal"}
        onOpenChange={(open) => {
          if (!open) {
            closeSecretDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>解密秘密</DialogTitle>
            <DialogDescription>
              在当前节点场景实例写入解密标记；重新加载上游记忆时会按公开或指定角色可见规则汇总。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <NativeSelect value={selectedSecretId} onChange={(event) => setSelectedSecretId(event.target.value)}>
              {branchSecretOptions.map((option) => (
                <NativeSelectOption key={`${option.sourceInstanceId}:${option.secretId}`} value={option.secretId}>
                  {option.sourceTitle} ·{" "}
                  {option.target === "character"
                    ? (characterNameById.get(option.characterId ?? "") ?? "角色秘密")
                    : "场景秘密"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="rounded-md border border-current/10 bg-current/[0.04] px-3 py-2 text-xs leading-5 text-current/75">
              {branchSecretOptions.find((option) => option.secretId === selectedSecretId)?.text ?? "暂无可解密秘密。"}
            </div>
            <NativeSelect
              value={revealVisibility}
              onChange={(event) => setRevealVisibility(event.target.value === "character" ? "character" : "public")}
            >
              <NativeSelectOption value="public">公开给当前分支</NativeSelectOption>
              <NativeSelectOption value="character">只对指定角色解密</NativeSelectOption>
            </NativeSelect>
            {revealVisibility === "character" && (
              <NativeSelect value={revealCharacterId} onChange={(event) => setRevealCharacterId(event.target.value)}>
                {roomCharacters.map((character) => (
                  <NativeSelectOption key={character.id} value={character.id}>
                    {character.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeSecretDialog}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!selectedSecretId || (revealVisibility === "character" && !revealCharacterId)}
              onClick={revealSecretMemory}
            >
              <Eye className="size-3.5" />
              解密
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
