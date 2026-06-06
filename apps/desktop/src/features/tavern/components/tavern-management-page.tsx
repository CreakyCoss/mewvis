import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  Clock,
  Copy,
  FileUp,
  LockKeyhole,
  MessageCircle,
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
import type { FormEvent } from "react";
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
  TavernReplyMode,
  TavernMessage,
  TavernRoom,
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
  onClearRoomMessages: () => void;
  onExportRoom: () => void;
  onImportRoom: (raw: string) => string | null;
  onCreateCharacter: (value: TavernCharacterFormValue) => void;
  onUpdateCharacter: (characterId: string, patch: Partial<TavernCharacter>) => void;
  onDeleteCharacter: (characterId: string) => void;
  onAddRoomCharacter: (roomId: string, characterId: string) => void;
  onRemoveRoomCharacter: (roomId: string, characterId: string) => void;
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

const confirmDangerousAction = (message: string, secondMessage: string) =>
  window.confirm(message) && window.confirm(secondMessage);

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
  onAddRoomCharacter,
  onRemoveRoomCharacter,
}: TavernManagementPageProps) => {
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [restoringRoomId, setRestoringRoomId] = useState<string | null>(null);
  const [lockingRoomRequest, setLockingRoomRequest] = useState<{
    roomId: string;
    locked: boolean;
  } | null>(null);
  const [isCreatingCharacter, setIsCreatingCharacter] = useState(false);
  const [isCharacterLibraryOpen, setIsCharacterLibraryOpen] = useState(false);
  const [isImportingCharacterCard, setIsImportingCharacterCard] = useState(false);
  const [characterCardText, setCharacterCardText] = useState("");
  const [characterCardStatus, setCharacterCardStatus] = useState("");
  const [isAddingTimelineEvent, setIsAddingTimelineEvent] = useState(false);
  const [timelineTitle, setTimelineTitle] = useState("");
  const [timelineSummary, setTimelineSummary] = useState("");
  const [isAddingLoreEntry, setIsAddingLoreEntry] = useState(false);
  const [loreTitle, setLoreTitle] = useState("");
  const [loreKeywords, setLoreKeywords] = useState("");
  const [loreContent, setLoreContent] = useState("");
  const [loreAlwaysOn, setLoreAlwaysOn] = useState(false);
  const [roomImportStatus, setRoomImportStatus] = useState("");
  const roomImportInputRef = useRef<HTMLInputElement | null>(null);

  const editingRoom = editingRoomId
    ? rooms.find((room) => room.id === editingRoomId) ?? null
    : null;
  const deletingRoom = deletingRoomId
    ? rooms.find((room) => room.id === deletingRoomId) ?? null
    : null;
  const restoringRoom = restoringRoomId
    ? rooms.find((room) => room.id === restoringRoomId) ?? null
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

  const openRoomEditor = (roomId: string) => {
    onSelectRoom(roomId);
    setEditingRoomId(roomId);
    setRoomImportStatus("");
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
      setEditingRoomId(null);
    }
    onDeleteRoom(deletingRoom.id);
    setDeletingRoomId(null);
  };

  const patchEditingRoomSettings = (
    settingsPatch: Partial<TavernRoom["settings"]>,
  ) => {
    if (!editingRoom) {
      return;
    }

    onPatchRoom(editingRoom.id, {
      settings: {
        ...editingRoom.settings,
        ...settingsPatch,
      },
    });
  };

  const handleAddTimelineEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRoom) {
      return;
    }

    const title = timelineTitle.trim();
    const summary = timelineSummary.trim();
    if (!title || !summary) {
      return;
    }

    onPatchRoom(editingRoom.id, {
      timelineEvents: [
        ...editingRoom.timelineEvents,
        createTavernTimelineEvent({ title, summary }),
      ],
    });
    setTimelineTitle("");
    setTimelineSummary("");
    setIsAddingTimelineEvent(false);
  };

  const handleAddLoreEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRoom) {
      return;
    }

    const title = loreTitle.trim();
    const content = loreContent.trim();
    if (!title || !content) {
      return;
    }

    onPatchRoom(editingRoom.id, {
      lorebookEntries: [
        ...editingRoom.lorebookEntries,
        createTavernLorebookEntry({
          title,
          content,
          keywords: parseKeywords(loreKeywords),
          alwaysOn: loreAlwaysOn,
        }),
      ],
    });
    setLoreTitle("");
    setLoreKeywords("");
    setLoreContent("");
    setLoreAlwaysOn(false);
    setIsAddingLoreEntry(false);
  };

  const handleImportRoomFile = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const error = onImportRoom(await file.text());
      setRoomImportStatus(error ?? "房间已导入");
    } catch {
      setRoomImportStatus("读取房间文件失败");
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
            </div>
          </header>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold leading-6">酒馆</h2>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatCount(rooms.length, "房间")}
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
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title="复制酒馆"
                          aria-label="复制酒馆"
                          onClick={() => onCopyRoom(room.id)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className={cn("size-8", room.locked && "text-primary")}
                          title={room.locked ? "解锁酒馆" : "锁定酒馆"}
                          aria-label={room.locked ? "解锁酒馆" : "锁定酒馆"}
                          onClick={() => requestRoomLockChange(room.id, !room.locked)}
                        >
                          {room.locked ? (
                            <LockKeyhole className="size-3.5" />
                          ) : (
                            <UnlockKeyhole className="size-3.5" />
                          )}
                        </Button>
                        {room.systemPresetId && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            title={room.locked ? "已锁定，不能恢复默认" : "恢复默认"}
                            aria-label={room.locked ? "已锁定，不能恢复默认" : "恢复默认"}
                            disabled={room.locked}
                            onClick={() => requestRestoreSystemPresetRoom(room.id)}
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title={room.locked ? "已锁定，不能删除酒馆" : "删除酒馆"}
                          aria-label={room.locked ? "已锁定，不能删除酒馆" : "删除酒馆"}
                          disabled={!canDeleteRoom || room.locked}
                          onClick={() => requestDeleteRoom(room.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
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
                  ? `锁定「${lockingRoom.title}」后，将不能删除该酒馆，也不能恢复系统默认。`
                  : `解锁「${lockingRoom.title}」后，将重新允许删除该酒馆或恢复系统默认。`}
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
            setEditingRoomId(null);
          }
        }}
      >
        {editingRoom && (
          <DialogContent className="flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="border-b px-5 py-4 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>编辑酒馆</DialogTitle>
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
              <DialogDescription className="truncate">
                {editingRoom.title || emptyValueText}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 px-5 py-4">
                <label className="block space-y-1.5" htmlFor="tavern-edit-title">
                  <span className="text-xs font-medium text-muted-foreground">房间名称</span>
                  <Input
                    id="tavern-edit-title"
                    value={editingRoom.title}
                    onChange={(event) => onPatchRoom(editingRoom.id, {
                      title: event.target.value,
                    })}
                  />
                </label>

                <label className="block space-y-1.5" htmlFor="tavern-edit-scene-preset">
                  <span className="text-xs font-medium text-muted-foreground">场景设置</span>
                  <NativeSelect
                    id="tavern-edit-scene-preset"
                    value={editingRoom.scenePresetId}
                    onChange={(event) => onPatchRoom(editingRoom.id, {
                      scenePresetId: event.target.value as TavernRoom["scenePresetId"],
                    })}
                  >
                    {TAVERN_SCENE_PRESET_OPTIONS.map((preset) => (
                      <NativeSelectOption key={preset.id} value={preset.id}>
                        {preset.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <span className="text-xs text-muted-foreground">
                    {TAVERN_SCENE_PRESET_OPTIONS.find((preset) =>
                      preset.id === editingRoom.scenePresetId
                    )?.description ?? "选择酒馆内部聊天页的显示风格。"}
                  </span>
                </label>

                <label className="block space-y-1.5" htmlFor="tavern-edit-scene">
                  <span className="text-xs font-medium text-muted-foreground">场景描述</span>
                  <Textarea
                    id="tavern-edit-scene"
                    value={editingRoom.scene}
                    className="min-h-[148px] resize-none text-sm leading-6"
                    onChange={(event) => onPatchRoom(editingRoom.id, {
                      scene: event.target.value,
                    })}
                  />
                </label>

                <label className="block space-y-1.5" htmlFor="tavern-edit-goal">
                  <span className="text-xs font-medium text-muted-foreground">场景目标</span>
                  <Textarea
                    id="tavern-edit-goal"
                    value={editingRoom.sceneGoal}
                    className="min-h-[92px] resize-none text-sm leading-6"
                    onChange={(event) => onPatchRoom(editingRoom.id, {
                      sceneGoal: event.target.value,
                    })}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5" htmlFor="tavern-edit-user">
                    <span className="text-xs font-medium text-muted-foreground">你的称呼</span>
                    <Input
                      id="tavern-edit-user"
                      value={editingRoom.userPersonaName}
                      onChange={(event) => onPatchRoom(editingRoom.id, {
                        userPersonaName: event.target.value,
                      })}
                    />
                  </label>
                  <label className="block space-y-1.5" htmlFor="tavern-edit-reply-mode">
                    <span className="text-xs font-medium text-muted-foreground">发言模式</span>
                    <NativeSelect
                      id="tavern-edit-reply-mode"
                      value={editingRoom.replyMode ?? "active"}
                      onChange={(event) => onPatchRoom(editingRoom.id, {
                        replyMode: event.target.value as TavernReplyMode,
                      })}
                    >
                      {replyModeOptions.map((option) => (
                        <NativeSelectOption key={option.value} value={option.value}>
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </label>
                </div>

                <label className="block space-y-1.5" htmlFor="tavern-edit-memory">
                  <span className="text-xs font-medium text-muted-foreground">房间记忆</span>
                  <Textarea
                    id="tavern-edit-memory"
                    value={editingRoom.memory}
                    className="min-h-[108px] resize-none text-sm leading-6"
                    onChange={(event) => onPatchRoom(editingRoom.id, {
                      memory: event.target.value,
                    })}
                  />
                </label>

                {editingRoom.autoMemory.trim() && (
                  <section className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Brain className="size-3.5" />
                        自动记忆
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => onPatchRoom(editingRoom.id, {
                          autoMemory: "",
                          autoMemoryUpdatedAt: undefined,
                          summarizedMessageIds: [],
                        })}
                      >
                        清除
                      </Button>
                    </div>
                    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background px-3 py-2 text-sm leading-6 text-muted-foreground">
                      {editingRoom.autoMemory}
                    </div>
                  </section>
                )}

                <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Settings2 className="size-3.5" />
                    运行设置
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editingRoom.settings.showExecutionTrace}
                        onChange={(event) => patchEditingRoomSettings({
                          showExecutionTrace: event.target.checked,
                        })}
                      />
                      显示执行过程
                    </label>
                    <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editingRoom.settings.autoAssetExtractionEnabled}
                        onChange={(event) => patchEditingRoomSettings({
                          autoAssetExtractionEnabled: event.target.checked,
                        })}
                      />
                      自动整理剧情资产
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block space-y-1.5" htmlFor="tavern-edit-asset-interval">
                      <span className="text-xs font-medium text-muted-foreground">整理间隔</span>
                      <Input
                        id="tavern-edit-asset-interval"
                        type="number"
                        min={1}
                        max={10}
                        value={editingRoom.settings.assetExtractionIntervalTurns}
                        onChange={(event) => patchEditingRoomSettings({
                          assetExtractionIntervalTurns: Math.min(
                            10,
                            Math.max(1, Number(event.target.value) || 1),
                          ),
                        })}
                      />
                    </label>
                    <label className="block space-y-1.5" htmlFor="tavern-edit-max-drafts">
                      <span className="text-xs font-medium text-muted-foreground">草稿上限</span>
                      <Input
                        id="tavern-edit-max-drafts"
                        type="number"
                        min={1}
                        max={20}
                        value={editingRoom.settings.maxAssetDrafts}
                        onChange={(event) => patchEditingRoomSettings({
                          maxAssetDrafts: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                        })}
                      />
                    </label>
                    <label className="block space-y-1.5" htmlFor="tavern-edit-director-speakers">
                      <span className="text-xs font-medium text-muted-foreground">导演人数</span>
                      <Input
                        id="tavern-edit-director-speakers"
                        type="number"
                        min={1}
                        max={6}
                        value={editingRoom.settings.directorMaxSpeakers}
                        onChange={(event) => patchEditingRoomSettings({
                          directorMaxSpeakers: Math.min(6, Math.max(1, Number(event.target.value) || 1)),
                        })}
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">入席角色</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        这里只管理当前酒馆使用哪些全局角色。
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatCount(editingRoomCharacters.length, "角色")}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {editingRoomCharacters.map((character) => {
                      const isActiveCharacter = editingRoom.activeCharacterId === character.id;

                      return (
                        <div
                          key={character.id}
                          className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-2"
                        >
                          <img
                            src={resolveAgentAvatar(character.avatar).src}
                            alt=""
                            className="size-8 rounded-md border bg-muted/20"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{character.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {character.speakingStyle}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="xs"
                            variant={isActiveCharacter ? "secondary" : "outline"}
                            disabled={isActiveCharacter}
                            onClick={() => onPatchRoom(editingRoom.id, {
                              activeCharacterId: character.id,
                            })}
                          >
                            {isActiveCharacter && <Check className="size-3.5" />}
                            默认
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            title="移出酒馆"
                            aria-label="移出酒馆"
                            disabled={editingRoomCharacters.length <= 1}
                            onClick={() => onRemoveRoomCharacter(editingRoom.id, character.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                    {editingRoomCharacters.length === 0 && (
                      <div className="rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                        这个酒馆还没有角色入席。
                      </div>
                    )}
                  </div>

                  {editingRoomAvailableCharacters.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">可邀请</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {editingRoomAvailableCharacters.map((character) => (
                          <button
                            key={character.id}
                            type="button"
                            className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/45"
                            onClick={() => onAddRoomCharacter(editingRoom.id, character.id)}
                          >
                            <img
                              src={resolveAgentAvatar(character.avatar).src}
                              alt=""
                              className="size-7 rounded-md border bg-muted/20"
                            />
                            <span className="min-w-0 flex-1 truncate">{character.name}</span>
                            <UserPlus className="size-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {editingRoomCharacters.length > 0 && (
                  <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Brain className="size-3.5" />
                      角色房间记忆
                    </div>
                    <div className="space-y-3">
                      {editingRoomCharacters.map((character) => (
                        <label
                          key={character.id}
                          className="block space-y-1.5"
                          htmlFor={`tavern-edit-character-memory-${character.id}`}
                        >
                          <span className="text-xs font-medium text-muted-foreground">
                            {character.name}
                          </span>
                          <Textarea
                            id={`tavern-edit-character-memory-${character.id}`}
                            value={editingRoom.characterMemories[character.id] ?? ""}
                            className="min-h-[76px] resize-none bg-background text-sm leading-6"
                            onChange={(event) => onPatchRoom(editingRoom.id, {
                              characterMemories: {
                                ...editingRoom.characterMemories,
                                [character.id]: event.target.value,
                              },
                            })}
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Clock className="size-3.5" />
                      剧情时间线
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setIsAddingTimelineEvent((current) => !current)}
                    >
                      <Plus className="size-3.5" />
                      新增
                    </Button>
                  </div>

                  {isAddingTimelineEvent && (
                    <form className="space-y-2" onSubmit={handleAddTimelineEvent}>
                      <Input
                        value={timelineTitle}
                        placeholder="事件标题"
                        onChange={(event) => setTimelineTitle(event.target.value)}
                      />
                      <Textarea
                        value={timelineSummary}
                        placeholder="事件摘要"
                        className="min-h-[84px] resize-none bg-background text-sm leading-6"
                        onChange={(event) => setTimelineSummary(event.target.value)}
                      />
                      <Button type="submit" size="sm" className="w-full">
                        保存事件
                      </Button>
                    </form>
                  )}

                  <div className="space-y-2">
                    {editingRoom.timelineEvents.map((event, index) => (
                      <div key={event.id} className="space-y-2 rounded-md border bg-background p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          <Input
                            value={event.title}
                            className="h-8 flex-1"
                            onChange={(changeEvent) => onPatchRoom(editingRoom.id, {
                              timelineEvents: editingRoom.timelineEvents.map((item) =>
                                item.id === event.id
                                  ? {
                                      ...item,
                                      title: changeEvent.target.value,
                                      updatedAt: Date.now(),
                                    }
                                  : item
                              ),
                            })}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            title="删除剧情事件"
                            aria-label="删除剧情事件"
                            onClick={() => {
                              const eventLabel = event.title.trim() || `剧情事件 ${index + 1}`;
                              if (!confirmDangerousAction(
                                `删除剧情事件「${eventLabel}」？`,
                                "再次确认删除剧情事件？它会从当前酒馆的剧情时间线中移除。",
                              )) {
                                return;
                              }

                              onPatchRoom(editingRoom.id, {
                                timelineEvents: editingRoom.timelineEvents.filter((item) => item.id !== event.id),
                              });
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <Textarea
                          value={event.summary}
                          className="min-h-[76px] resize-none text-sm leading-6"
                          onChange={(changeEvent) => onPatchRoom(editingRoom.id, {
                            timelineEvents: editingRoom.timelineEvents.map((item) =>
                              item.id === event.id
                                ? {
                                    ...item,
                                    summary: changeEvent.target.value,
                                    updatedAt: Date.now(),
                                  }
                                : item
                            ),
                          })}
                        />
                      </div>
                    ))}
                    {editingRoom.timelineEvents.length === 0 && (
                      <div className="rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                        暂无剧情事件。
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <BookOpen className="size-3.5" />
                      世界书
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setIsAddingLoreEntry((current) => !current)}
                    >
                      <Plus className="size-3.5" />
                      新增
                    </Button>
                  </div>

                  {isAddingLoreEntry && (
                    <form className="space-y-2" onSubmit={handleAddLoreEntry}>
                      <Input
                        value={loreTitle}
                        placeholder="条目名称"
                        onChange={(event) => setLoreTitle(event.target.value)}
                      />
                      <Input
                        value={loreKeywords}
                        placeholder="关键词"
                        onChange={(event) => setLoreKeywords(event.target.value)}
                      />
                      <Textarea
                        value={loreContent}
                        placeholder="设定内容"
                        className="min-h-[92px] resize-none bg-background text-sm leading-6"
                        onChange={(event) => setLoreContent(event.target.value)}
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={loreAlwaysOn}
                          onChange={(event) => setLoreAlwaysOn(event.target.checked)}
                        />
                        常驻
                      </label>
                      <Button type="submit" size="sm" className="w-full">
                        保存条目
                      </Button>
                    </form>
                  )}

                  <div className="space-y-2">
                    {editingRoom.lorebookEntries.map((entry) => (
                      <div key={entry.id} className="space-y-2 rounded-md border bg-background p-3">
                        <div className="flex items-center gap-2">
                          <Input
                            value={entry.title}
                            className="h-8 flex-1"
                            onChange={(event) => onPatchRoom(editingRoom.id, {
                              lorebookEntries: editingRoom.lorebookEntries.map((item) =>
                                item.id === entry.id
                                  ? {
                                      ...item,
                                      title: event.target.value,
                                      updatedAt: Date.now(),
                                    }
                                  : item
                              ),
                            })}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            title="删除世界书"
                            aria-label="删除世界书"
                            onClick={() => {
                              const entryLabel = entry.title.trim() || "未命名世界书";
                              if (!confirmDangerousAction(
                                `删除世界书「${entryLabel}」？`,
                                "再次确认删除世界书？它会从当前酒馆的设定资料中移除。",
                              )) {
                                return;
                              }

                              onPatchRoom(editingRoom.id, {
                                lorebookEntries: editingRoom.lorebookEntries.filter((item) => item.id !== entry.id),
                              });
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <Input
                          value={entry.keywords.join("，")}
                          placeholder="关键词"
                          className="h-8"
                          onChange={(event) => onPatchRoom(editingRoom.id, {
                            lorebookEntries: editingRoom.lorebookEntries.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    keywords: parseKeywords(event.target.value),
                                    updatedAt: Date.now(),
                                  }
                                : item
                            ),
                          })}
                        />
                        <Textarea
                          value={entry.content}
                          className="min-h-[92px] resize-none text-sm leading-6"
                          onChange={(event) => onPatchRoom(editingRoom.id, {
                            lorebookEntries: editingRoom.lorebookEntries.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    content: event.target.value,
                                    updatedAt: Date.now(),
                                  }
                                : item
                            ),
                          })}
                        />
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={entry.enabled}
                              onChange={(event) => onPatchRoom(editingRoom.id, {
                                lorebookEntries: editingRoom.lorebookEntries.map((item) =>
                                  item.id === entry.id
                                    ? {
                                        ...item,
                                        enabled: event.target.checked,
                                        updatedAt: Date.now(),
                                      }
                                    : item
                                ),
                              })}
                            />
                            启用
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={entry.alwaysOn}
                              onChange={(event) => onPatchRoom(editingRoom.id, {
                                lorebookEntries: editingRoom.lorebookEntries.map((item) =>
                                  item.id === entry.id
                                    ? {
                                        ...item,
                                        alwaysOn: event.target.checked,
                                        updatedAt: Date.now(),
                                      }
                                    : item
                                ),
                              })}
                            />
                            常驻
                          </label>
                        </div>
                      </div>
                    ))}
                    {editingRoom.lorebookEntries.length === 0 && (
                      <div className="rounded-md border bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                        暂无世界书。
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-medium text-muted-foreground">房间操作</div>
                  <input
                    ref={roomImportInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleImportRoomFile}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onCopyRoom(editingRoom.id);
                        setEditingRoomId(null);
                      }}
                    >
                      <Copy className="size-4" />
                      复制酒馆
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => requestRoomLockChange(editingRoom.id, !editingRoom.locked)}
                    >
                      {editingRoom.locked ? (
                        <LockKeyhole className="size-4" />
                      ) : (
                        <UnlockKeyhole className="size-4" />
                      )}
                      {editingRoom.locked ? "解锁酒馆" : "锁定酒馆"}
                    </Button>
                    {editingRoom.systemPresetId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={editingRoom.locked}
                        onClick={() => requestRestoreSystemPresetRoom(editingRoom.id)}
                      >
                        <RotateCcw className="size-4" />
                        恢复默认
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={onExportRoom}>
                      <Copy className="size-4" />
                      导出
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRoomImportStatus("");
                        roomImportInputRef.current?.click();
                      }}
                    >
                      <FileUp className="size-4" />
                      导入
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={onClearRoomMessages}>
                      <RotateCcw className="size-4" />
                      清空对话
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={!canDeleteRoom || editingRoom.locked}
                      onClick={() => requestDeleteRoom(editingRoom.id)}
                    >
                      <Trash2 className="size-4" />
                      删除
                    </Button>
                  </div>
                  {roomImportStatus && (
                    <div className="text-xs text-muted-foreground">{roomImportStatus}</div>
                  )}
                </section>
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 border-t bg-popover px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingRoomId(null)}
              >
                完成
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
