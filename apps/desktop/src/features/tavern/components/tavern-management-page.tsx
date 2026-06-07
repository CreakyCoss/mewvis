import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Clock,
  Copy,
  Download,
  FileUp,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  TriangleAlertIcon,
  UnlockKeyhole,
  UserPlus,
  UsersRound,
  Wine,
} from "lucide-react";
import type { ComponentType, FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { TAVERN_SCENE_PRESET_OPTIONS } from "@/features/visual-presets";
import { cn } from "@/lib/utils";
import {
  parseTavernCharacterCard,
  stringifyTavernCharacterCard,
} from "../character-card";
import { createTavernLorebookEntry, createTavernTimelineEvent } from "../storage";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernReplyMode,
  TavernMessage,
  TavernRoom,
  TavernRoomSettings,
  TavernTimelineEvent,
} from "../types";
import { compactScene } from "../utils";
import {
  TavernCharacterFormDialog,
  type TavernCharacterFormValue,
} from "./tavern-character-form-dialog";

type TavernManagementPageProps = {
  rooms: TavernRoom[];
  characters: TavernCharacter[];
  activeRoom: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  messagesByRoom: Record<string, TavernMessage[]>;
  providers: LlmProvider[];
  globalProvider: LlmProvider | null;
  globalModel: ProviderModel | null;
  canDeleteRoom: boolean;
  onCreateRoom: () => void;
  onSelectRoom: (roomId: string) => void;
  onOpenRoom: (roomId: string) => void;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onCopyRoom: (roomId: string) => void;
  onRestoreSystemPresetRoom: (roomId: string) => void;
  onSetRoomLocked: (roomId: string, locked: boolean) => boolean;
  onDeleteRoom: (roomId: string) => void;
  onClearRoomMessages: (roomId: string) => void;
  onExportRoom: (roomId: string) => boolean;
  onImportRoom: (raw: string) => string | null;
  onCreateCharacter: (value: TavernCharacterFormValue) => void;
  onUpdateCharacter: (characterId: string, patch: Partial<TavernCharacter>) => void;
  onDeleteCharacter: (characterId: string) => void;
};

const replyModeOptions: Array<{
  value: TavernReplyMode;
  label: string;
}> = [
  { value: "active", label: "当前角色" },
  { value: "round", label: "全员轮流" },
  { value: "director", label: "导演调度" },
];

const formatCount = (value: number, label: string) => `${value} ${label}`;

const emptyValueText = "未设置";

const parseKeywords = (value: string) =>
  value.split(/[,，\n]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

const editorControlClassName = "w-full bg-background/80 shadow-none";
const settingsFlagGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-2";
const settingsMetricGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2";
const settingsEditorMetricGridClassName =
  "grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3";

const getReplyModeLabel = (replyMode: TavernReplyMode) =>
  replyModeOptions.find((option) => option.value === replyMode)?.label ?? "当前角色";

const TavernEditorField = ({
  label,
  htmlFor,
  children,
  description,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  description?: string;
  className?: string;
}) => (
  <label className={cn("block space-y-1.5", className)} htmlFor={htmlFor}>
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    {children}
    {description && (
      <span className="block text-xs leading-5 text-muted-foreground">
        {description}
      </span>
    )}
  </label>
);

const TavernReadonlyField = ({
  label,
  value,
  description,
  multiline,
  className,
  valueClassName,
  descriptionClassName,
}: {
  label: string;
  value: string;
  description?: string;
  multiline?: boolean;
  className?: string;
  valueClassName?: string;
  descriptionClassName?: string;
}) => {
  const normalizedValue = value.trim();

  return (
    <div className={cn("rounded-md border bg-background/80 px-3 py-2.5 shadow-xs", className)}>
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-sm leading-6",
          multiline ? "whitespace-pre-wrap" : "truncate",
          !normalizedValue && "text-muted-foreground",
          valueClassName,
        )}
      >
        {normalizedValue || emptyValueText}
      </div>
      {description && (
        <div className={cn("mt-1 text-xs leading-5 text-muted-foreground", descriptionClassName)}>
          {description}
        </div>
      )}
    </div>
  );
};

const TavernReadonlyFlag = ({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) => (
  <div className="flex min-h-[3.25rem] min-w-0 items-center justify-between gap-2.5 rounded-md border bg-background/80 px-3 py-2.5 text-sm shadow-xs">
    <span className="min-w-0 leading-5 [word-break:keep-all]">{label}</span>
    <Badge variant={enabled ? "secondary" : "outline"} className="shrink-0">
      {enabled ? "开启" : "关闭"}
    </Badge>
  </div>
);

const TavernReadonlyMetric = ({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) => (
  <div className="rounded-md border bg-background/80 px-3 py-2.5 shadow-xs">
    <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 text-lg font-semibold leading-7 tabular-nums">{value}</div>
    <div className="text-xs leading-5 text-muted-foreground">{description}</div>
  </div>
);

const TavernEditorSection = ({
  icon: Icon,
  title,
  description,
  meta,
  action,
  children,
  className,
  contentClassName,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) => (
  <section
    className={cn(
      "overflow-hidden rounded-lg border bg-card/55 shadow-sm",
      className,
    )}
  >
    <div className="flex items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
      <div className="flex min-w-0 gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold leading-5">{title}</h3>
            {meta && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {meta}
              </span>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className={cn("space-y-3 p-4", contentClassName)}>
      {children}
    </div>
  </section>
);

type PendingDangerAction = {
  title: string;
  description: string;
  secondDescription: string;
  confirmLabel: string;
  summary?: string;
  onConfirm: () => void;
};

type RoomContentEditDraft =
  | {
      type: "basic";
      title: string;
      scenePresetId: TavernRoom["scenePresetId"];
      replyMode: TavernReplyMode;
      userPersonaName: string;
    }
  | {
      type: "narrative";
      scene: string;
      sceneGoal: string;
      memory: string;
    }
  | ({
      type: "settings";
    } & TavernRoomSettings)
  | {
      type: "characterMemory";
      characterId: string;
      note: string;
    }
  | {
      type: "timeline";
      eventId: string | null;
      title: string;
      summary: string;
    }
  | {
      type: "lore";
      entryId: string | null;
      title: string;
      keywords: string;
      content: string;
      enabled: boolean;
      alwaysOn: boolean;
    };

const cloneTavernRoom = (room: TavernRoom): TavernRoom => ({
  ...room,
  settings: { ...room.settings },
  summarizedMessageIds: room.summarizedMessageIds
    ? [...room.summarizedMessageIds]
    : undefined,
  characterMemories: { ...room.characterMemories },
  characterIds: [...room.characterIds],
  timelineEvents: room.timelineEvents.map((event) => ({ ...event })),
  lorebookEntries: room.lorebookEntries.map((entry) => ({
    ...entry,
    keywords: [...entry.keywords],
  })),
  assetDrafts: room.assetDrafts.map((draft) => ({
    ...draft,
    sourceMessageIds: [...draft.sourceMessageIds],
    timelineEvents: draft.timelineEvents.map((event) => ({ ...event })),
    characterMemories: draft.characterMemories.map((memory) => ({ ...memory })),
    lorebookEntries: draft.lorebookEntries.map((entry) => ({
      ...entry,
      keywords: [...entry.keywords],
    })),
  })),
});

export const TavernManagementPage = ({
  rooms,
  characters,
  activeRoom,
  characterById,
  messagesByRoom,
  providers,
  globalProvider,
  globalModel,
  canDeleteRoom,
  onCreateRoom,
  onSelectRoom,
  onOpenRoom,
  onPatchRoom,
  onCopyRoom,
  onRestoreSystemPresetRoom,
  onSetRoomLocked,
  onDeleteRoom,
  onClearRoomMessages,
  onExportRoom,
  onImportRoom,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
}: TavernManagementPageProps) => {
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomDraft, setEditingRoomDraft] = useState<TavernRoom | null>(null);
  const [roomContentEditDraft, setRoomContentEditDraft] =
    useState<RoomContentEditDraft | null>(null);
  const [roomContentEditError, setRoomContentEditError] = useState("");
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [restoringRoomId, setRestoringRoomId] = useState<string | null>(null);
  const [invitingRoomId, setInvitingRoomId] = useState<string | null>(null);
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  const [dangerConfirmStep, setDangerConfirmStep] = useState<1 | 2>(1);
  const [lockingRoomRequest, setLockingRoomRequest] = useState<{
    roomId: string;
    locked: boolean;
  } | null>(null);
  const [isCreatingCharacter, setIsCreatingCharacter] = useState(false);
  const [isCharacterLibraryOpen, setIsCharacterLibraryOpen] = useState(false);
  const [isImportingCharacterCard, setIsImportingCharacterCard] = useState(false);
  const [characterCardText, setCharacterCardText] = useState("");
  const [characterCardStatus, setCharacterCardStatus] = useState("");
  const [roomOperationStatus, setRoomOperationStatus] = useState("");
  const roomImportInputRef = useRef<HTMLInputElement | null>(null);

  const editingRoom = editingRoomDraft;
  const deletingRoom = deletingRoomId
    ? rooms.find((room) => room.id === deletingRoomId) ?? null
    : null;
  const restoringRoom = restoringRoomId
    ? rooms.find((room) => room.id === restoringRoomId) ?? null
    : null;
  const invitingRoom = invitingRoomId === editingRoom?.id
    ? editingRoom
    : invitingRoomId
      ? rooms.find((room) => room.id === invitingRoomId) ?? null
      : null;
  const lockingRoom = lockingRoomRequest
    ? rooms.find((room) => room.id === lockingRoomRequest.roomId) ?? null
    : null;
  const isLockingRoom = lockingRoomRequest?.locked ?? false;
  const editingCharacter = editingCharacterId
    ? characters.find((character) => character.id === editingCharacterId) ?? null
    : null;
  const activeRoomMessages = messagesByRoom[activeRoom.id] ?? [];
  const characterUsageById = new Map<string, number>();
  for (const room of rooms) {
    for (const characterId of new Set(room.characterIds)) {
      characterUsageById.set(characterId, (characterUsageById.get(characterId) ?? 0) + 1);
    }
  }
  const editingRoomCharacterIds = new Set(editingRoom?.characterIds ?? []);
  const editingRoomCharacters = editingRoom
    ? editingRoom.characterIds
        .map((characterId) => characterById.get(characterId))
        .filter((character): character is TavernCharacter => Boolean(character))
    : [];
  const editingRoomAvailableCharacters = editingRoom
    ? characters.filter((character) => !editingRoomCharacterIds.has(character.id))
    : [];
  const editingRoomScenePreset = editingRoom
    ? TAVERN_SCENE_PRESET_OPTIONS.find((preset) => preset.id === editingRoom.scenePresetId)
    : null;
  const editingRoomMessageCount = editingRoom
    ? messagesByRoom[editingRoom.id]?.length ?? 0
    : 0;
  const invitingRoomCharacterIds = new Set(invitingRoom?.characterIds ?? []);
  const invitingRoomAvailableCharacters = invitingRoom
    ? characters.filter((character) => !invitingRoomCharacterIds.has(character.id))
    : [];

  const openRoomEditor = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room) {
      return;
    }

    onSelectRoom(roomId);
    setEditingRoomId(roomId);
    setEditingRoomDraft(cloneTavernRoom(room));
    setRoomContentEditDraft(null);
    setRoomContentEditError("");
    setInvitingRoomId(null);
    setRoomOperationStatus("");
  };

  const closeRoomEditor = () => {
    setEditingRoomId(null);
    setEditingRoomDraft(null);
    setRoomContentEditDraft(null);
    setRoomContentEditError("");
    setInvitingRoomId(null);
  };

  const patchEditingRoomDraft = (patch: Partial<TavernRoom>) => {
    setEditingRoomDraft((current) => current ? { ...current, ...patch } : current);
  };

  const addCharacterToEditingRoomDraft = (characterId: string) => {
    setEditingRoomDraft((current) => {
      if (!current || current.characterIds.includes(characterId)) {
        return current;
      }

      return {
        ...current,
        characterIds: [...current.characterIds, characterId],
        activeCharacterId: current.activeCharacterId || characterId,
      };
    });
  };

  const removeCharacterFromEditingRoomDraft = (characterId: string) => {
    setEditingRoomDraft((current) => {
      if (!current || current.characterIds.length <= 1) {
        return current;
      }

      const nextCharacterIds = current.characterIds.filter((id) => id !== characterId);
      return {
        ...current,
        characterIds: nextCharacterIds,
        activeCharacterId: current.activeCharacterId === characterId
          ? nextCharacterIds[0] ?? ""
          : current.activeCharacterId,
      };
    });
  };

  const saveRoomEditor = () => {
    if (!editingRoom) {
      return;
    }

    onPatchRoom(editingRoom.id, editingRoom);
    closeRoomEditor();
  };

  const requestDangerAction = (action: PendingDangerAction) => {
    setPendingDangerAction(action);
    setDangerConfirmStep(1);
  };

  const closeDangerAction = () => {
    setPendingDangerAction(null);
    setDangerConfirmStep(1);
  };

  const confirmDangerAction = () => {
    if (!pendingDangerAction) {
      return;
    }

    if (dangerConfirmStep === 1) {
      setDangerConfirmStep(2);
      return;
    }

    pendingDangerAction.onConfirm();
    closeDangerAction();
  };

  const requestDeleteRoom = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!canDeleteRoom || room?.locked) {
      return;
    }

    setDeletingRoomId(roomId);
  };

  const requestRestoreSystemPresetRoom = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room?.systemPresetId || room.locked) {
      return;
    }

    setRestoringRoomId(roomId);
  };

  const requestRoomLockChange = (roomId: string, locked: boolean) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room || room.locked === locked) {
      return;
    }

    setLockingRoomRequest({ roomId, locked });
  };

  const confirmRestoreSystemPresetRoom = () => {
    if (!restoringRoom) {
      return;
    }

    onRestoreSystemPresetRoom(restoringRoom.id);
    setRestoringRoomId(null);
  };

  const confirmRoomLockChange = () => {
    if (!lockingRoom || !lockingRoomRequest) {
      return;
    }

    const applied = onSetRoomLocked(lockingRoom.id, lockingRoomRequest.locked);
    if (applied) {
      setLockingRoomRequest(null);
    }
  };

  const confirmDeleteRoom = () => {
    if (!deletingRoom || deletingRoom.locked) {
      return;
    }

    if (!window.confirm(
      `再次确认删除酒馆「${deletingRoom.title}」？房间、对话记录和剧情资产都会被永久移除。`,
    )) {
      return;
    }

    if (editingRoomId === deletingRoom.id) {
      closeRoomEditor();
    }
    onDeleteRoom(deletingRoom.id);
    setDeletingRoomId(null);
  };

  const closeRoomContentEditor = () => {
    setRoomContentEditDraft(null);
    setRoomContentEditError("");
  };

  const openBasicContentEditor = () => {
    if (!editingRoom) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "basic",
      title: editingRoom.title,
      scenePresetId: editingRoom.scenePresetId,
      replyMode: editingRoom.replyMode ?? "active",
      userPersonaName: editingRoom.userPersonaName,
    });
  };

  const openNarrativeContentEditor = () => {
    if (!editingRoom) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "narrative",
      scene: editingRoom.scene,
      sceneGoal: editingRoom.sceneGoal,
      memory: editingRoom.memory,
    });
  };

  const openSettingsContentEditor = () => {
    if (!editingRoom) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "settings",
      ...editingRoom.settings,
    });
  };

  const openCharacterMemoryContentEditor = (characterId: string) => {
    if (!editingRoom) {
      return;
    }

    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "characterMemory",
      characterId,
      note: editingRoom.characterMemories[characterId] ?? "",
    });
  };

  const openTimelineContentEditor = (event: TavernTimelineEvent | null = null) => {
    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "timeline",
      eventId: event?.id ?? null,
      title: event?.title ?? "",
      summary: event?.summary ?? "",
    });
  };

  const openLoreContentEditor = (entry: TavernLorebookEntry | null = null) => {
    setRoomContentEditError("");
    setRoomContentEditDraft({
      type: "lore",
      entryId: entry?.id ?? null,
      title: entry?.title ?? "",
      keywords: entry?.keywords.join("，") ?? "",
      content: entry?.content ?? "",
      enabled: entry?.enabled ?? true,
      alwaysOn: entry?.alwaysOn ?? false,
    });
  };

  const saveRoomContentEditor = () => {
    if (!editingRoom || !roomContentEditDraft) {
      return;
    }

    if (roomContentEditDraft.type === "basic") {
      patchEditingRoomDraft({
        title: roomContentEditDraft.title,
        scenePresetId: roomContentEditDraft.scenePresetId,
        replyMode: roomContentEditDraft.replyMode,
        userPersonaName: roomContentEditDraft.userPersonaName,
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "narrative") {
      patchEditingRoomDraft({
        scene: roomContentEditDraft.scene,
        sceneGoal: roomContentEditDraft.sceneGoal,
        memory: roomContentEditDraft.memory,
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "settings") {
      patchEditingRoomDraft({
        settings: {
          immersiveDescriptionEnabled: roomContentEditDraft.immersiveDescriptionEnabled,
          showExecutionTrace: roomContentEditDraft.showExecutionTrace,
          autoAssetExtractionEnabled: roomContentEditDraft.autoAssetExtractionEnabled,
          assetExtractionIntervalTurns: Math.min(
            10,
            Math.max(1, Number(roomContentEditDraft.assetExtractionIntervalTurns) || 1),
          ),
          maxAssetDrafts: Math.min(
            20,
            Math.max(1, Number(roomContentEditDraft.maxAssetDrafts) || 1),
          ),
          directorMaxSpeakers: Math.min(
            6,
            Math.max(1, Number(roomContentEditDraft.directorMaxSpeakers) || 1),
          ),
        },
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "characterMemory") {
      patchEditingRoomDraft({
        characterMemories: {
          ...editingRoom.characterMemories,
          [roomContentEditDraft.characterId]: roomContentEditDraft.note,
        },
      });
      closeRoomContentEditor();
      return;
    }

    if (roomContentEditDraft.type === "timeline") {
      const title = roomContentEditDraft.title.trim();
      const summary = roomContentEditDraft.summary.trim();
      if (!title || !summary) {
        setRoomContentEditError("请填写事件标题和摘要。");
        return;
      }

      patchEditingRoomDraft({
        timelineEvents: roomContentEditDraft.eventId
          ? editingRoom.timelineEvents.map((item) =>
              item.id === roomContentEditDraft.eventId
                ? {
                    ...item,
                    title,
                    summary,
                    updatedAt: Date.now(),
                  }
                : item
            )
          : [
              ...editingRoom.timelineEvents,
              createTavernTimelineEvent({ title, summary }),
            ],
      });
      closeRoomContentEditor();
      return;
    }

    const title = roomContentEditDraft.title.trim();
    const content = roomContentEditDraft.content.trim();
    if (!title || !content) {
      setRoomContentEditError("请填写世界书名称和内容。");
      return;
    }

    patchEditingRoomDraft({
      lorebookEntries: roomContentEditDraft.entryId
        ? editingRoom.lorebookEntries.map((item) =>
            item.id === roomContentEditDraft.entryId
              ? {
                  ...item,
                  title,
                  content,
                  keywords: parseKeywords(roomContentEditDraft.keywords),
                  enabled: roomContentEditDraft.enabled,
                  alwaysOn: roomContentEditDraft.alwaysOn,
                  updatedAt: Date.now(),
                }
              : item
          )
        : [
            ...editingRoom.lorebookEntries,
            {
              ...createTavernLorebookEntry({
                title,
                content,
                keywords: parseKeywords(roomContentEditDraft.keywords),
                alwaysOn: roomContentEditDraft.alwaysOn,
              }),
              enabled: roomContentEditDraft.enabled,
            },
          ],
    });
    closeRoomContentEditor();
  };

  const handleImportRoomFile = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const error = onImportRoom(await file.text());
      setRoomOperationStatus(error ?? "房间已导入");
    } catch {
      setRoomOperationStatus("读取房间文件失败");
    }
  };

  const copyCharacterCard = async (character: TavernCharacter) => {
    try {
      await navigator.clipboard.writeText(stringifyTavernCharacterCard(character));
      setCharacterCardStatus(`已复制 ${character.name}`);
    } catch {
      setCharacterCardStatus("复制角色卡失败");
    }
  };

  const importCharacterCard = () => {
    const raw = characterCardText.trim();
    if (!raw) {
      setCharacterCardStatus("请粘贴角色卡 JSON");
      return;
    }

    try {
      onCreateCharacter(parseTavernCharacterCard(raw));
      setCharacterCardText("");
      setIsImportingCharacterCard(false);
      setCharacterCardStatus("角色卡已导入角色库");
    } catch (caught) {
      setCharacterCardStatus(caught instanceof Error ? caught.message : "角色卡导入失败");
    }
  };

  const getRoomContentEditDialogTitle = () => {
    if (!roomContentEditDraft) {
      return "";
    }

    switch (roomContentEditDraft.type) {
      case "basic":
        return "编辑基础信息";
      case "narrative":
        return "编辑叙事内容";
      case "settings":
        return "编辑运行设置";
      case "characterMemory": {
        const character = characterById.get(roomContentEditDraft.characterId);
        return `编辑${character?.name ?? "角色"}记忆`;
      }
      case "timeline":
        return roomContentEditDraft.eventId ? "编辑剧情事件" : "新增剧情事件";
      case "lore":
        return roomContentEditDraft.entryId ? "编辑世界书" : "新增世界书";
    }
  };

  const getRoomContentEditDialogDescription = () => {
    if (!editingRoom || !roomContentEditDraft) {
      return "";
    }

    switch (roomContentEditDraft.type) {
      case "basic":
        return "修改房间名称、主题风格、发言模式和你的称呼。";
      case "narrative":
        return "修改场景描述、当前目标和房间记忆。";
      case "settings":
        return "调整执行过程、剧情资产整理和导演调度设置。";
      case "characterMemory":
        return `修改「${editingRoom.title || "当前酒馆"}」中的单个角色记忆。`;
      case "timeline":
        return "剧情事件会进入当前酒馆草稿，保存酒馆后才生效。";
      case "lore":
        return "世界书条目会进入当前酒馆草稿，保存酒馆后才生效。";
    }
  };

  const renderRoomContentEditFields = () => {
    if (!roomContentEditDraft) {
      return null;
    }

    switch (roomContentEditDraft.type) {
      case "basic":
        return (
          <>
            <TavernEditorField label="房间名称" htmlFor="tavern-content-title">
              <Input
                id="tavern-content-title"
                value={roomContentEditDraft.title}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  title: event.target.value,
                })}
              />
            </TavernEditorField>
            <div className="grid gap-3 sm:grid-cols-2">
              <TavernEditorField label="场景设置" htmlFor="tavern-content-scene-preset">
                <NativeSelect
                  id="tavern-content-scene-preset"
                  value={roomContentEditDraft.scenePresetId}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    scenePresetId: event.target.value as TavernRoom["scenePresetId"],
                  })}
                >
                  {TAVERN_SCENE_PRESET_OPTIONS.map((preset) => (
                    <NativeSelectOption key={preset.id} value={preset.id}>
                      {preset.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TavernEditorField>
              <TavernEditorField label="发言模式" htmlFor="tavern-content-reply-mode">
                <NativeSelect
                  id="tavern-content-reply-mode"
                  value={roomContentEditDraft.replyMode}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    replyMode: event.target.value as TavernReplyMode,
                  })}
                >
                  {replyModeOptions.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </TavernEditorField>
            </div>
            <TavernEditorField label="你的称呼" htmlFor="tavern-content-user">
              <Input
                id="tavern-content-user"
                value={roomContentEditDraft.userPersonaName}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  userPersonaName: event.target.value,
                })}
              />
            </TavernEditorField>
          </>
        );
      case "narrative":
        return (
          <>
            <TavernEditorField label="场景描述" htmlFor="tavern-content-scene">
              <Textarea
                id="tavern-content-scene"
                value={roomContentEditDraft.scene}
                className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  scene: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="场景目标" htmlFor="tavern-content-goal">
              <Textarea
                id="tavern-content-goal"
                value={roomContentEditDraft.sceneGoal}
                className={cn("min-h-[92px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  sceneGoal: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="房间记忆" htmlFor="tavern-content-memory">
              <Textarea
                id="tavern-content-memory"
                value={roomContentEditDraft.memory}
                className={cn("min-h-[112px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  memory: event.target.value,
                })}
              />
            </TavernEditorField>
          </>
        );
      case "settings":
        return (
          <>
            <div className={settingsFlagGridClassName}>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.immersiveDescriptionEnabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    immersiveDescriptionEnabled: event.target.checked,
                  })}
                />
                沉浸描写
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.showExecutionTrace}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    showExecutionTrace: event.target.checked,
                  })}
                />
                显示执行过程
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.autoAssetExtractionEnabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    autoAssetExtractionEnabled: event.target.checked,
                  })}
                />
                自动整理剧情资产
              </label>
            </div>
            <div className={settingsEditorMetricGridClassName}>
              <TavernEditorField label="整理间隔" htmlFor="tavern-content-asset-interval">
                <Input
                  id="tavern-content-asset-interval"
                  type="number"
                  min={1}
                  max={10}
                  value={roomContentEditDraft.assetExtractionIntervalTurns}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    assetExtractionIntervalTurns: Math.min(
                      10,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="草稿上限" htmlFor="tavern-content-max-drafts">
                <Input
                  id="tavern-content-max-drafts"
                  type="number"
                  min={1}
                  max={20}
                  value={roomContentEditDraft.maxAssetDrafts}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    maxAssetDrafts: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                  })}
                />
              </TavernEditorField>
              <TavernEditorField label="导演人数" htmlFor="tavern-content-director-speakers">
                <Input
                  id="tavern-content-director-speakers"
                  type="number"
                  min={1}
                  max={6}
                  value={roomContentEditDraft.directorMaxSpeakers}
                  className={editorControlClassName}
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    directorMaxSpeakers: Math.min(6, Math.max(1, Number(event.target.value) || 1)),
                  })}
                />
              </TavernEditorField>
            </div>
          </>
        );
      case "characterMemory": {
        const character = characterById.get(roomContentEditDraft.characterId);

        return (
          <TavernEditorField
            label={character?.name ?? "角色记忆"}
            htmlFor="tavern-content-character-memory"
          >
            <Textarea
              id="tavern-content-character-memory"
              value={roomContentEditDraft.note}
              className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
              onChange={(event) => setRoomContentEditDraft({
                ...roomContentEditDraft,
                note: event.target.value,
              })}
            />
          </TavernEditorField>
        );
      }
      case "timeline":
        return (
          <>
            <TavernEditorField label="事件标题" htmlFor="tavern-content-event-title">
              <Input
                id="tavern-content-event-title"
                value={roomContentEditDraft.title}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  title: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="事件摘要" htmlFor="tavern-content-event-summary">
              <Textarea
                id="tavern-content-event-summary"
                value={roomContentEditDraft.summary}
                className={cn("min-h-[120px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  summary: event.target.value,
                })}
              />
            </TavernEditorField>
          </>
        );
      case "lore":
        return (
          <>
            <TavernEditorField label="条目名称" htmlFor="tavern-content-lore-title">
              <Input
                id="tavern-content-lore-title"
                value={roomContentEditDraft.title}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  title: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField
              label="关键词"
              htmlFor="tavern-content-lore-keywords"
              description="使用逗号、中文逗号或换行分隔。"
            >
              <Input
                id="tavern-content-lore-keywords"
                value={roomContentEditDraft.keywords}
                className={editorControlClassName}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  keywords: event.target.value,
                })}
              />
            </TavernEditorField>
            <TavernEditorField label="设定内容" htmlFor="tavern-content-lore-content">
              <Textarea
                id="tavern-content-lore-content"
                value={roomContentEditDraft.content}
                className={cn("min-h-[132px] resize-none text-sm leading-6", editorControlClassName)}
                onChange={(event) => setRoomContentEditDraft({
                  ...roomContentEditDraft,
                  content: event.target.value,
                })}
              />
            </TavernEditorField>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.enabled}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    enabled: event.target.checked,
                  })}
                />
                启用
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-md border bg-background/80 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roomContentEditDraft.alwaysOn}
                  className="accent-primary"
                  onChange={(event) => setRoomContentEditDraft({
                    ...roomContentEditDraft,
                    alwaysOn: event.target.checked,
                  })}
                />
                常驻
              </label>
            </div>
          </>
        );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 bg-background text-foreground">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
                <Wine className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-7">酒馆管理</h1>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatCount(rooms.length, "房间")}</span>
                  <span>{formatCount(characters.length, "角色")}</span>
                  <span>{formatCount(activeRoomMessages.length, "消息")}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                ref={roomImportInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportRoomFile}
              />
              <Button type="button" onClick={onCreateRoom}>
                <Plus className="size-4" />
                新建酒馆
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-9"
                title="角色库"
                aria-label="打开角色库"
                onClick={() => setIsCharacterLibraryOpen(true)}
              >
                <UsersRound className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-9"
                    title="更多酒馆操作"
                    aria-label="更多酒馆操作"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>酒馆操作</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      setRoomOperationStatus("");
                      roomImportInputRef.current?.click();
                    }}
                  >
                    <FileUp className="size-4" />
                    导入酒馆
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-6">酒馆</h2>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {formatCount(rooms.length, "房间")}
                  {roomOperationStatus && (
                    <span aria-live="polite">{roomOperationStatus}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => {
                const isActive = room.id === activeRoom.id;
                const roomCharacters = room.characterIds
                  .map((characterId) => characterById.get(characterId))
                  .filter((character): character is TavernCharacter => Boolean(character));
                const messages = messagesByRoom[room.id] ?? [];
                const draftCount = room.assetDrafts.length;

                return (
                  <article
                    key={room.id}
                    className={cn(
                      "flex min-h-[132px] flex-col rounded-md border bg-background p-2 shadow-sm transition-colors",
                      isActive && "border-primary/50 bg-primary/[0.03]",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onSelectRoom(room.id)}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{room.title}</h3>
                            {room.systemPresetId && (
                              <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px]">
                                系统预设
                              </Badge>
                            )}
                            {room.locked && (
                              <Badge
                                variant="outline"
                                className="h-5 w-5 shrink-0 justify-center p-0"
                                title="已锁定"
                                aria-label="已锁定"
                              >
                                <LockKeyhole className="size-3" />
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">
                            {compactScene(room.scene)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {roomCharacters.slice(0, 3).map((character) => (
                            <img
                              key={character.id}
                              src={resolveAgentAvatar(character.avatar).src}
                              alt=""
                              className="size-6 rounded-md border bg-background"
                            />
                          ))}
                        </div>
                      </div>
                      {room.sceneGoal.trim() && (
                        <div className="mt-1.5 line-clamp-1 rounded-md bg-muted/35 px-2 py-1 text-xs leading-5 text-muted-foreground">
                          {room.sceneGoal}
                        </div>
                      )}
                    </button>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <UsersRound className="size-3.5" />
                        {roomCharacters.length}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="size-3.5" />
                        {messages.length}
                      </span>
                      {draftCount > 0 && <span>{draftCount} 草稿</span>}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <div className="grid min-w-[156px] flex-1 grid-cols-2 gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 min-w-[74px] whitespace-nowrap"
                          onClick={() => onOpenRoom(room.id)}
                        >
                          <ArrowRight className="size-3.5 shrink-0" />
                          <span className="truncate">进入</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 min-w-[74px] whitespace-nowrap"
                          onClick={() => openRoomEditor(room.id)}
                        >
                          <Pencil className="size-3.5 shrink-0" />
                          <span className="truncate">编辑</span>
                        </Button>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="ml-auto size-8 shrink-0"
                            title="更多操作"
                            aria-label={`更多操作：${room.title}`}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuLabel>房间操作</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => onCopyRoom(room.id)}>
                            <Copy className="size-4" />
                            复制酒馆
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              const exported = onExportRoom(room.id);
                              setRoomOperationStatus(
                                exported
                                  ? `已导出「${room.title}」`
                                  : `导出「${room.title}」失败`,
                              );
                            }}
                          >
                            <Download className="size-4" />
                            导出酒馆
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={room.locked}
                            onSelect={() => requestDangerAction({
                              title: "清空对话",
                              description: `清空「${room.title}」的对话记录？`,
                              secondDescription: "再次确认清空对话？当前房间现有消息会被替换为一条重置提示。",
                              confirmLabel: "清空对话",
                              summary: formatCount(messages.length, "消息"),
                              onConfirm: () => onClearRoomMessages(room.id),
                            })}
                          >
                            <RotateCcw className="size-4" />
                            清空对话
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => requestRoomLockChange(room.id, !room.locked)}
                          >
                            {room.locked ? (
                              <LockKeyhole className="size-4" />
                            ) : (
                              <UnlockKeyhole className="size-4" />
                            )}
                            {room.locked ? "解锁酒馆" : "锁定酒馆"}
                          </DropdownMenuItem>
                          {room.systemPresetId && (
                            <DropdownMenuItem
                              disabled={room.locked}
                              onSelect={() => requestRestoreSystemPresetRoom(room.id)}
                            >
                              <RotateCcw className="size-4" />
                              恢复默认
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={!canDeleteRoom || room.locked}
                            onSelect={() => requestDeleteRoom(room.id)}
                          >
                            <Trash2 className="size-4" />
                            删除酒馆
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </ScrollArea>

      <Dialog
        open={Boolean(deletingRoom)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingRoomId(null);
          }
        }}
      >
        {deletingRoom && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>确认删除酒馆</DialogTitle>
              </div>
              <DialogDescription>
                「{deletingRoom.title}」将从首页移除，相关对话记录和剧情资产也会一并删除。
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {formatCount(messagesByRoom[deletingRoom.id]?.length ?? 0, "消息")}
              {" / "}
              {formatCount(deletingRoom.characterIds.length, "入席角色")}
              {" / "}
              {formatCount(deletingRoom.assetDrafts.length, "草稿")}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingRoomId(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDeleteRoom}
              >
                <Trash2 className="size-4" />
                删除酒馆
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(restoringRoom)}
        onOpenChange={(open) => {
          if (!open) {
            setRestoringRoomId(null);
          }
        }}
      >
        {restoringRoom && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>确认恢复默认</DialogTitle>
              </div>
              <DialogDescription>
                「{restoringRoom.title}」将被系统预设内容覆盖，当前场景、角色、记忆、剧情资产和对话记录都会重置。
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {formatCount(messagesByRoom[restoringRoom.id]?.length ?? 0, "消息")}
              {" / "}
              {formatCount(restoringRoom.timelineEvents.length, "剧情事件")}
              {" / "}
              {formatCount(restoringRoom.lorebookEntries.length, "世界书")}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRestoringRoomId(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmRestoreSystemPresetRoom}
              >
                <RotateCcw className="size-4" />
                继续恢复
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(lockingRoom)}
        onOpenChange={(open) => {
          if (!open) {
            setLockingRoomRequest(null);
          }
        }}
      >
        {lockingRoom && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md",
                  isLockingRoom
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive",
                )}>
                  {isLockingRoom ? (
                    <LockKeyhole className="size-4" />
                  ) : (
                    <UnlockKeyhole className="size-4" />
                  )}
                </span>
                <DialogTitle>
                  {isLockingRoom ? "确认锁定酒馆" : "确认解锁酒馆"}
                </DialogTitle>
              </div>
              <DialogDescription>
                {isLockingRoom
                  ? `锁定「${lockingRoom.title}」后，将不能删除该酒馆、恢复系统默认或清空对话。`
                  : `解锁「${lockingRoom.title}」后，将重新允许删除该酒馆、恢复系统默认或清空对话。`}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {formatCount(messagesByRoom[lockingRoom.id]?.length ?? 0, "消息")}
              {" / "}
              {formatCount(lockingRoom.timelineEvents.length, "剧情事件")}
              {" / "}
              {formatCount(lockingRoom.lorebookEntries.length, "世界书")}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLockingRoomRequest(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant={isLockingRoom ? "default" : "destructive"}
                onClick={confirmRoomLockChange}
              >
                {isLockingRoom ? (
                  <LockKeyhole className="size-4" />
                ) : (
                  <UnlockKeyhole className="size-4" />
                )}
                {isLockingRoom ? "继续锁定" : "继续解锁"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(pendingDangerAction)}
        onOpenChange={(open) => {
          if (!open) {
            closeDangerAction();
          }
        }}
      >
        {pendingDangerAction && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <TriangleAlertIcon className="size-4" />
                </span>
                <DialogTitle>
                  {dangerConfirmStep === 1
                    ? pendingDangerAction.title
                    : `再次确认${pendingDangerAction.title}`}
                </DialogTitle>
              </div>
              <DialogDescription>
                {dangerConfirmStep === 1
                  ? pendingDangerAction.description
                  : pendingDangerAction.secondDescription}
              </DialogDescription>
            </DialogHeader>

            {pendingDangerAction.summary && (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {pendingDangerAction.summary}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDangerAction}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDangerAction}
              >
                {dangerConfirmStep === 1 ? "继续" : pendingDangerAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={isCharacterLibraryOpen} onOpenChange={setIsCharacterLibraryOpen}>
        <DialogContent className="flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle>角色库</DialogTitle>
                <DialogDescription>
                  全局角色配置会影响所有引用它的酒馆。
                </DialogDescription>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsImportingCharacterCard((current) => !current);
                    setCharacterCardStatus("");
                  }}
                >
                  <FileUp className="size-4" />
                  导入角色卡
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsCreatingCharacter(true)}
                >
                  <Plus className="size-4" />
                  新建角色
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatCount(characters.length, "角色")}</span>
                <span>{formatCount(rooms.length, "酒馆")}</span>
                {characterCardStatus && <span>{characterCardStatus}</span>}
              </div>

              {isImportingCharacterCard && (
                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <Textarea
                    value={characterCardText}
                    placeholder="粘贴角色卡 JSON"
                    className="min-h-[132px] resize-none bg-background font-mono text-xs leading-5"
                    onChange={(event) => setCharacterCardText(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCharacterCardText("");
                        setIsImportingCharacterCard(false);
                      }}
                    >
                      取消
                    </Button>
                    <Button type="button" size="sm" onClick={importCharacterCard}>
                      <FileUp className="size-4" />
                      导入
                    </Button>
                  </div>
                </div>
              )}

              {characters.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {characters.map((character) => {
                    const avatar = resolveAgentAvatar(character.avatar);
                    const usageCount = characterUsageById.get(character.id) ?? 0;

                    return (
                      <article
                        key={character.id}
                        className="flex min-h-[132px] flex-col rounded-md border bg-background p-2.5 shadow-sm"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <img
                            src={avatar.src}
                            alt=""
                            className="size-8 rounded-md border bg-muted/20"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <div className="min-w-0 truncate text-sm font-semibold">
                                {character.name}
                              </div>
                              {character.systemPresetId && (
                                <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px]">
                                  系统预设
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {formatCount(usageCount, "个酒馆")}
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {character.description}
                        </p>
                        <div className="mt-auto grid grid-cols-[1fr_auto_auto] gap-1.5 pt-2.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setEditingCharacterId(character.id)}
                          >
                            <Pencil className="size-3.5" />
                            编辑
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            title="复制角色卡"
                            aria-label="复制角色卡"
                            onClick={() => void copyCharacterCard(character)}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            title={character.systemPresetId ? "系统预设角色不可删除" : "删除角色"}
                            aria-label={character.systemPresetId ? "系统预设角色不可删除" : "删除角色"}
                            disabled={characters.length <= 1 || Boolean(character.systemPresetId)}
                            onClick={() => {
                              if (editingCharacterId === character.id) {
                                setEditingCharacterId(null);
                              }
                              onDeleteCharacter(character.id);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex min-h-32 items-center justify-center rounded-md border bg-background/60 text-sm text-muted-foreground">
                  还没有全局角色。
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t bg-popover px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCharacterLibraryOpen(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingRoom)}
        onOpenChange={(open) => {
          if (!open) {
            closeRoomEditor();
          }
        }}
      >
        {editingRoom && (
          <DialogContent className="flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
            <DialogHeader className="border-b bg-muted/10 px-5 py-4 pr-12">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-lg">编辑酒馆</DialogTitle>
                    {editingRoom.systemPresetId && (
                      <Badge variant="secondary">
                        系统预设
                      </Badge>
                    )}
                    {editingRoom.locked && (
                      <Badge variant="outline" className="gap-1">
                        <LockKeyhole className="size-3" />
                        已锁定
                      </Badge>
                    )}
                  </div>
                  <DialogDescription className="line-clamp-2 max-w-2xl">
                    {editingRoom.title || emptyValueText}
                  </DialogDescription>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:min-w-[360px]">
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoomCharacters.length, "角色")}</div>
                    <div className="text-muted-foreground">入席</div>
                  </div>
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoomMessageCount, "消息")}</div>
                    <div className="text-muted-foreground">对话</div>
                  </div>
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoom.timelineEvents.length, "事件")}</div>
                    <div className="text-muted-foreground">时间线</div>
                  </div>
                  <div className="rounded-md border bg-background/70 px-3 py-2">
                    <div className="font-medium">{formatCount(editingRoom.lorebookEntries.length, "条")}</div>
                    <div className="text-muted-foreground">世界书</div>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1 bg-muted/5">
              <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                <div className="space-y-4">
	                  <TavernEditorSection
	                    icon={Wine}
	                    title="基础信息"
	                    description="设置房间识别信息、聊天风格和发言方式。"
	                    meta={editingRoomScenePreset?.label ?? "通用"}
		                    action={(
		                      <Button
		                        type="button"
		                        size="xs"
	                        variant="outline"
	                        onClick={openBasicContentEditor}
	                      >
	                        <Pencil className="size-3.5" />
		                        编辑
		                      </Button>
		                    )}
		                    contentClassName="space-y-3"
		                  >
		                    <TavernReadonlyField
		                      label="房间名称"
		                      value={editingRoom.title}
		                      className="border-primary/20 bg-primary/[0.04]"
		                      valueClassName="text-base font-semibold leading-7"
		                    />

		                    <div className="grid gap-3 sm:grid-cols-3">
		                      <TavernReadonlyField
		                        label="场景设置"
		                        value={editingRoomScenePreset?.label ?? "通用"}
		                        description={editingRoomScenePreset?.description ?? "选择酒馆内部聊天页的显示风格。"}
		                        className="sm:col-span-1"
		                        valueClassName="font-medium"
		                        descriptionClassName="line-clamp-2"
		                      />
		                      <TavernReadonlyField
		                        label="发言模式"
		                        value={getReplyModeLabel(editingRoom.replyMode ?? "active")}
		                        valueClassName="font-medium"
		                      />
		                      <TavernReadonlyField
		                        label="你的称呼"
		                        value={editingRoom.userPersonaName}
		                        valueClassName="font-medium"
		                      />
		                    </div>
		                  </TavernEditorSection>

	                  <TavernEditorSection
	                    icon={MessageCircle}
	                    title="叙事内容"
	                    description="这些内容会影响酒馆开场、角色回应和长期上下文。"
	                    action={(
	                      <Button
	                        type="button"
	                        size="xs"
	                        variant="outline"
	                        onClick={openNarrativeContentEditor}
	                      >
	                        <Pencil className="size-3.5" />
		                        编辑
		                      </Button>
		                    )}
		                    contentClassName="space-y-3"
		                  >
		                    <TavernReadonlyField
		                      label="场景描述"
		                      value={editingRoom.scene}
		                      multiline
		                      className="bg-muted/15"
		                      valueClassName="leading-7 text-foreground/90"
		                    />

		                    <TavernReadonlyField
		                      label="场景目标"
		                      value={editingRoom.sceneGoal}
		                      multiline
		                      className="border-primary/15 bg-primary/[0.035]"
		                      valueClassName="font-medium leading-7"
		                    />

		                    <TavernReadonlyField
		                      label="房间记忆"
		                      value={editingRoom.memory}
		                      multiline
		                      className="bg-muted/15"
		                      valueClassName="leading-7 text-foreground/90"
		                    />

                    {editingRoom.autoMemory.trim() && (
                      <div className="overflow-hidden rounded-md border bg-background/70">
                        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Brain className="size-3.5" />
                            自动记忆
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              const roomLabel = editingRoom.title.trim() || "当前酒馆";
                              requestDangerAction({
                                title: "清除自动记忆",
                                description: `清除「${roomLabel}」的自动记忆？`,
                                secondDescription: "再次确认清除自动记忆？后续对话将不再引用这段整理结果。",
                                confirmLabel: "清除记忆",
                                onConfirm: () => patchEditingRoomDraft({
                                  autoMemory: "",
                                  autoMemoryUpdatedAt: undefined,
                                  summarizedMessageIds: [],
                                }),
                              });
                            }}
                          >
                            清除
                          </Button>
                        </div>
                        <div className="max-h-36 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-sm leading-6 text-muted-foreground">
                          {editingRoom.autoMemory}
                        </div>
                      </div>
                    )}
                  </TavernEditorSection>
                </div>

                <div className="space-y-4">
                  <TavernEditorSection
                    icon={Settings2}
                    title="运行设置"
                    description="控制执行过程、剧情资产整理频率和导演调度人数。"
                    action={(
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={openSettingsContentEditor}
                      >
                        <Pencil className="size-3.5" />
                        编辑
                      </Button>
                    )}
                    contentClassName="space-y-3"
                  >
                    <div className={settingsFlagGridClassName}>
                      <TavernReadonlyFlag
                        label="沉浸描写"
                        enabled={editingRoom.settings.immersiveDescriptionEnabled}
                      />
                      <TavernReadonlyFlag
                        label="显示执行过程"
                        enabled={editingRoom.settings.showExecutionTrace}
                      />
                      <TavernReadonlyFlag
                        label="自动整理剧情资产"
                        enabled={editingRoom.settings.autoAssetExtractionEnabled}
                      />
                    </div>
                    <div className={settingsMetricGridClassName}>
                      <TavernReadonlyMetric
                        label="整理间隔"
                        value={`${editingRoom.settings.assetExtractionIntervalTurns} 轮`}
                        description="触发整理"
                      />
                      <TavernReadonlyMetric
                        label="草稿上限"
                        value={`${editingRoom.settings.maxAssetDrafts} 条`}
                        description="保留草稿"
                      />
                      <TavernReadonlyMetric
                        label="导演人数"
                        value={`${editingRoom.settings.directorMaxSpeakers} 人`}
                        description="本轮上限"
                      />
                    </div>
                  </TavernEditorSection>

                  <TavernEditorSection
                    icon={UsersRound}
                    title="入席角色"
                    description="这里只管理当前酒馆使用哪些全局角色。"
                    meta={formatCount(editingRoomCharacters.length, "角色")}
                    action={(
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={editingRoomAvailableCharacters.length === 0}
                        title={editingRoomAvailableCharacters.length === 0 ? "没有可邀请角色" : "邀请角色"}
                        onClick={() => setInvitingRoomId(editingRoom.id)}
                      >
                        <UserPlus className="size-3.5" />
                        邀请
                      </Button>
	                    )}
	                    contentClassName="space-y-0"
	                  >
	                  <div className="grid grid-cols-2 gap-2">
                    {editingRoomCharacters.map((character) => {
                      const isActiveCharacter = editingRoom.activeCharacterId === character.id;

                      return (
                        <div
                          key={character.id}
                          className={cn(
                            "flex min-w-0 items-center gap-2 rounded-md border bg-background/80 px-2.5 py-2",
                            isActiveCharacter && "border-primary/45 bg-primary/[0.06] ring-1 ring-primary/10",
                          )}
                        >
                          <img
                            src={resolveAgentAvatar(character.avatar).src}
                            alt=""
                            className="size-8 rounded-md border bg-muted/20"
                          />
                          <div className="min-w-0 flex-1 text-xs">
                            <div className="truncate font-medium leading-5">{character.name}</div>
                            {isActiveCharacter && (
                              <div className="text-[11px] leading-4 text-primary">默认</div>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant={isActiveCharacter ? "secondary" : "outline"}
                            title={isActiveCharacter ? "已是默认角色" : "设为默认角色"}
                            aria-label={isActiveCharacter ? `${character.name} 已是默认角色` : `设 ${character.name} 为默认角色`}
                            disabled={isActiveCharacter}
                            onClick={() => patchEditingRoomDraft({
                              activeCharacterId: character.id,
                            })}
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            title="移出酒馆"
                            aria-label="移出酒馆"
                            disabled={editingRoomCharacters.length <= 1}
                            onClick={() => {
                              const characterLabel = character.name.trim() || "未命名角色";
                              const roomLabel = editingRoom.title.trim() || "当前酒馆";
                              requestDangerAction({
                                title: "移出角色",
                                description: `将「${characterLabel}」移出「${roomLabel}」？`,
                                secondDescription: "再次确认移出角色？保存后该角色会离开当前酒馆的入席列表。",
                                confirmLabel: "移出角色",
                                onConfirm: () => removeCharacterFromEditingRoomDraft(character.id),
                              });
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      );
	                    })}
	                    {editingRoomCharacters.length === 0 && (
	                      <div className="col-span-2 rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
	                        这个酒馆还没有角色入席。
	                      </div>
	                    )}
                  </div>
                  </TavernEditorSection>
                </div>

                {editingRoomCharacters.length > 0 && (
                  <TavernEditorSection
                    className="lg:col-span-2"
                    icon={Brain}
                    title="角色房间记忆"
                    description="记录角色在当前酒馆中的局部关系、承诺和状态。"
                    meta={formatCount(editingRoomCharacters.length, "角色")}
	                  >
	                    <div className="grid gap-3 md:grid-cols-2">
	                      {editingRoomCharacters.map((character) => (
	                        <div
	                          key={character.id}
	                          className="rounded-md border bg-background/80 p-3"
	                        >
	                          <div className="flex items-start gap-2">
	                            <img
	                              src={resolveAgentAvatar(character.avatar).src}
	                              alt=""
	                              className="size-8 rounded-md border bg-muted/20"
	                            />
	                            <div className="min-w-0 flex-1">
	                              <div className="truncate text-sm font-medium leading-5">
	                                {character.name}
	                              </div>
	                              <div
	                                className={cn(
	                                  "mt-1 whitespace-pre-wrap text-sm leading-6",
	                                  !(editingRoom.characterMemories[character.id] ?? "").trim() &&
	                                    "text-muted-foreground",
	                                )}
	                              >
	                                {(editingRoom.characterMemories[character.id] ?? "").trim() || emptyValueText}
	                              </div>
	                            </div>
	                            <Button
	                              type="button"
	                              size="icon-sm"
	                              variant="ghost"
	                              title="编辑角色记忆"
	                              aria-label={`编辑${character.name}的角色记忆`}
	                              onClick={() => openCharacterMemoryContentEditor(character.id)}
	                            >
	                              <Pencil className="size-4" />
	                            </Button>
	                          </div>
	                        </div>
	                      ))}
	                    </div>
	                  </TavernEditorSection>
                )}

                  <TavernEditorSection
                    className="lg:col-span-2"
                    icon={Clock}
                    title="剧情时间线"
                    description="沉淀已经确定发生过的关键事件。"
                    meta={formatCount(editingRoom.timelineEvents.length, "事件")}
	                    action={(
	                      <Button
	                        type="button"
	                        size="xs"
	                        variant="outline"
	                        onClick={() => openTimelineContentEditor()}
	                      >
	                        <Plus className="size-3.5" />
	                        新增
	                      </Button>
	                    )}
	                  >

	                  <div className="grid gap-2 lg:grid-cols-2">
	                    {editingRoom.timelineEvents.map((event, index) => (
	                      <div key={event.id} className="space-y-2 rounded-md border bg-background/80 p-3">
	                        <div className="flex items-start gap-2">
	                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-xs font-medium text-muted-foreground">
	                            {index + 1}
	                          </span>
	                          <div className="min-w-0 flex-1">
	                            <div className="truncate text-sm font-medium leading-5">
	                              {event.title || emptyValueText}
	                            </div>
	                            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
	                              {event.summary || emptyValueText}
	                            </div>
	                          </div>
	                          <Button
	                            type="button"
	                            size="icon-sm"
	                            variant="ghost"
	                            title="编辑剧情事件"
	                            aria-label="编辑剧情事件"
	                            onClick={() => openTimelineContentEditor(event)}
	                          >
	                            <Pencil className="size-4" />
	                          </Button>
	                          <Button
	                            type="button"
	                            size="icon-sm"
	                            variant="ghost"
	                            title="删除剧情事件"
	                            aria-label="删除剧情事件"
	                            onClick={() => {
                              const eventLabel = event.title.trim() || `剧情事件 ${index + 1}`;
                              requestDangerAction({
                                title: "删除剧情事件",
                                description: `删除剧情事件「${eventLabel}」？`,
                                secondDescription: "再次确认删除剧情事件？保存后它会从当前酒馆的剧情时间线中移除。",
                                confirmLabel: "删除事件",
                                onConfirm: () => patchEditingRoomDraft({
                                  timelineEvents: editingRoom.timelineEvents.filter((item) => item.id !== event.id),
                                }),
                              });
	                            }}
	                          >
	                            <Trash2 className="size-4" />
	                          </Button>
	                        </div>
	                      </div>
	                    ))}
                    {editingRoom.timelineEvents.length === 0 && (
                      <div className="rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground lg:col-span-2">
                        暂无剧情事件。
                      </div>
                    )}
                  </div>
                  </TavernEditorSection>

                  <TavernEditorSection
                    className="lg:col-span-2"
                    icon={BookOpen}
                    title="世界书"
	                    description="维护可被关键词触发或常驻生效的设定资料。"
	                    meta={formatCount(editingRoom.lorebookEntries.length, "条")}
	                    action={(
	                      <Button
	                        type="button"
	                        size="xs"
	                        variant="outline"
	                        onClick={() => openLoreContentEditor()}
	                      >
	                        <Plus className="size-3.5" />
	                        新增
	                      </Button>
	                    )}
	                  >

	                  <div className="grid gap-2 lg:grid-cols-2">
	                    {editingRoom.lorebookEntries.map((entry) => (
	                      <div key={entry.id} className="space-y-2 rounded-md border bg-background/80 p-3">
	                        <div className="flex items-start gap-2">
	                          <div className="min-w-0 flex-1">
	                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
	                              <div className="min-w-0 truncate text-sm font-medium leading-5">
	                                {entry.title || emptyValueText}
	                              </div>
	                              <Badge variant={entry.enabled ? "secondary" : "outline"}>
	                                {entry.enabled ? "启用" : "停用"}
	                              </Badge>
	                              {entry.alwaysOn && (
	                                <Badge variant="outline">常驻</Badge>
	                              )}
	                            </div>
	                            <div className="mt-2 flex flex-wrap gap-1">
	                              {entry.keywords.length > 0 ? (
	                                entry.keywords.map((keyword) => (
	                                  <span
	                                    key={keyword}
	                                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
	                                  >
	                                    {keyword}
	                                  </span>
	                                ))
	                              ) : (
	                                <span className="text-xs text-muted-foreground">无关键词</span>
	                              )}
	                            </div>
	                            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
	                              {entry.content || emptyValueText}
	                            </div>
	                          </div>
	                          <Button
	                            type="button"
	                            size="icon-sm"
	                            variant="ghost"
	                            title="编辑世界书"
	                            aria-label="编辑世界书"
	                            onClick={() => openLoreContentEditor(entry)}
	                          >
	                            <Pencil className="size-4" />
	                          </Button>
	                          <Button
	                            type="button"
	                            size="icon-sm"
	                            variant="ghost"
	                            title="删除世界书"
	                            aria-label="删除世界书"
	                            onClick={() => {
                              const entryLabel = entry.title.trim() || "未命名世界书";
                              requestDangerAction({
                                title: "删除世界书",
                                description: `删除世界书「${entryLabel}」？`,
                                secondDescription: "再次确认删除世界书？保存后它会从当前酒馆的设定资料中移除。",
                                confirmLabel: "删除世界书",
                                onConfirm: () => patchEditingRoomDraft({
                                  lorebookEntries: editingRoom.lorebookEntries.filter((item) => item.id !== entry.id),
                                }),
                              });
                            }}
                          >
	                            <Trash2 className="size-4" />
	                          </Button>
	                        </div>
	                      </div>
	                    ))}
                    {editingRoom.lorebookEntries.length === 0 && (
                      <div className="rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground lg:col-span-2">
                        暂无世界书。
                      </div>
                    )}
                  </div>
                  </TavernEditorSection>
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 border-t bg-popover px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeRoomEditor}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={saveRoomEditor}
              >
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
	      </Dialog>

	      <Dialog
	        open={Boolean(editingRoom && roomContentEditDraft)}
	        onOpenChange={(open) => {
	          if (!open) {
	            closeRoomContentEditor();
	          }
	        }}
	      >
	        {editingRoom && roomContentEditDraft && (
	          <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
	            <DialogHeader>
	              <DialogTitle>{getRoomContentEditDialogTitle()}</DialogTitle>
	              <DialogDescription>
	                {getRoomContentEditDialogDescription()}
	              </DialogDescription>
	            </DialogHeader>

	            <form
	              className="space-y-4"
	              onSubmit={(event) => {
	                event.preventDefault();
	                saveRoomContentEditor();
	              }}
	            >
	              <div className="space-y-3">
	                {renderRoomContentEditFields()}
	              </div>

	              {roomContentEditError && (
	                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
	                  {roomContentEditError}
	                </div>
	              )}

	              <DialogFooter>
	                <Button
	                  type="button"
	                  variant="outline"
	                  onClick={closeRoomContentEditor}
	                >
	                  取消
	                </Button>
	                <Button type="submit">
	                  保存修改
	                </Button>
	              </DialogFooter>
	            </form>
	          </DialogContent>
	        )}
	      </Dialog>

	      <Dialog
	        open={Boolean(invitingRoom)}
        onOpenChange={(open) => {
          if (!open) {
            setInvitingRoomId(null);
          }
        }}
      >
        {invitingRoom && (
          <DialogContent className="flex max-h-[min(680px,calc(100vh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="border-b px-5 py-4 pr-12">
              <DialogTitle>邀请角色</DialogTitle>
              <DialogDescription>
                选择要加入「{invitingRoom.title}」的全局角色。
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-2 px-5 py-4 sm:grid-cols-2">
                {invitingRoomAvailableCharacters.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      addCharacterToEditingRoomDraft(character.id);
                      setInvitingRoomId(null);
                    }}
                  >
                    <img
                      src={resolveAgentAvatar(character.avatar).src}
                      alt=""
                      className="size-8 rounded-md border bg-muted/20"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{character.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {character.speakingStyle}
                      </div>
                    </div>
                    <UserPlus className="size-4 text-muted-foreground" />
                  </button>
                ))}
                {invitingRoomAvailableCharacters.length === 0 && (
                  <div className="rounded-md border bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground sm:col-span-2">
                    所有角色都已入席。
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 border-t bg-popover px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInvitingRoomId(null)}
              >
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <TavernCharacterFormDialog
        open={isCreatingCharacter || Boolean(editingCharacter)}
        character={editingCharacter}
        providers={providers}
        globalProvider={globalProvider}
        globalModel={globalModel}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreatingCharacter(false);
            setEditingCharacterId(null);
          }
        }}
        onSubmit={(value) => {
          if (editingCharacter) {
            onUpdateCharacter(editingCharacter.id, value);
          } else {
            onCreateCharacter(value);
          }
        }}
      />
    </div>
  );
};
