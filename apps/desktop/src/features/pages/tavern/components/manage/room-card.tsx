import {
  ArrowRight,
  Copy,
  Download,
  LockKeyhole,
  Map,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Target,
  Trash2,
  UnlockKeyhole,
  UsersRound,
  Wine,
} from "lucide-react";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getVisualPreset } from "../../visual-presets";
import type { TavernCharacter, TavernRoom } from "../../types";
import { compactScene } from "../../utils";
import { useManagementContext } from "./context";
import type { PendingDangerAction } from "./room-editor/types";
import { emptyValueText } from "./room-editor/utils";

type RoomCardRuntimeValue = {
  openRoomEditor: (roomId: string) => void;
  onRequestDangerAction: (action: PendingDangerAction) => void;
  onOperationStatusChange?: (status: string) => void;
};

const RoomCardRuntimeContext = createContext<RoomCardRuntimeValue | null>(null);

export const RoomCardRuntimeProvider = ({
  value,
  children,
}: {
  value: RoomCardRuntimeValue;
  children: ReactNode;
}) => (
  <RoomCardRuntimeContext.Provider value={value}>
    {children}
  </RoomCardRuntimeContext.Provider>
);

const useRoomCardRuntime = () => {
  const value = useContext(RoomCardRuntimeContext);
  if (!value) {
    throw new Error("RoomCardRuntimeContext is missing.");
  }

  return value;
};

type RoomCardProps = {
  room: TavernRoom;
  onRoomRemove?: (roomId: string) => void;
  onRoomCopy?: (roomId: string) => void;
  onRoomChange?: (roomId: string) => void;
  onOpenRoom?: (room: TavernRoom) => void;
};

export const RoomCard = ({
  room,
  onRoomRemove,
  onRoomCopy,
  onRoomChange,
  onOpenRoom,
}: RoomCardProps) => {
  const {
    rooms,
    activeRoom,
    characterById,
    messagesByRoomId,
    selectRoom,
    copyRoom,
    restoreSystemPresetRoom,
    setRoomLocked,
    deleteRoom,
    clearRoomMessages,
    exportRoom,
  } = useManagementContext();
  const {
    openRoomEditor,
    onRequestDangerAction,
    onOperationStatusChange,
  } = useRoomCardRuntime();

  const isActive = room.id === activeRoom.id;
  const hasMultipleRooms = rooms.length > 1;
  const roomCharacters = room.characterIds
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is TavernCharacter => Boolean(character));
  const messages = messagesByRoomId[room.id] ?? [];
  const visualPreset = getVisualPreset(room.scenePresetId);
  const visibleCharacters = roomCharacters.slice(0, 4);
  const hiddenCharacterCount = Math.max(
    0,
    roomCharacters.length - visibleCharacters.length,
  );
  const sceneCount = Math.max(1, room.scenes?.length ?? 1);
  const roomBadgeClassName = room.systemPresetId
    ? "border border-amber-200/45 bg-amber-950/75 text-amber-100 ring-amber-200/30 shadow-[0_12px_28px_-18px_rgb(245_158_11_/_0.95)]"
    : "border border-teal-100/30 bg-slate-950/65 text-teal-50 ring-teal-100/24 shadow-[0_12px_28px_-18px_rgb(15_23_42_/_0.9)]";
  const coverStyle = {
    backgroundImage: `linear-gradient(180deg,rgba(8,13,12,0.18),rgba(8,13,12,0.26) 42%,rgba(8,13,12,0.46)), url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundSize: visualPreset.tavern.backgroundSize,
  };

  const setOperationStatus = (status: string) => {
    onOperationStatusChange?.(status);
  };

  const handleOpenRoom = () => {
    selectRoom(room.id);
    onOpenRoom?.(room);
  };

  const handleCopyRoom = () => {
    if (!copyRoom(room.id)) {
      const failureMessage = `复制「${room.title}」失败`;
      setOperationStatus(failureMessage);
      toast.error(failureMessage);
      return;
    }

    const successMessage = `已复制「${room.title}」`;
    setOperationStatus(successMessage);
    toast.success(successMessage);
    onRoomCopy?.(room.id);
  };

  const handleExportRoom = () => {
    const exported = exportRoom(room.id);
    const message = exported
      ? `已导出「${room.title}」`
      : `导出「${room.title}」失败`;

    setOperationStatus(message);
    if (exported) {
      toast.success(message);
    } else {
      toast.error(message);
    }
  };

  const handleClearRoomMessages = () => {
    if (room.locked) {
      return;
    }

    onRequestDangerAction({
      title: "清空对话",
      description:
        `清空「${room.title}」的对话记录？系统会先保存状态检查点，再把当前房间现有消息替换为一条重置提示。`,
      confirmLabel: "清空对话",
      onConfirm: () => {
        void clearRoomMessages(room.id).then((applied) => {
          if (!applied) {
            setOperationStatus(`清空「${room.title}」失败`);
            return;
          }

          setOperationStatus(`已清空「${room.title}」的对话`);
          onRoomChange?.(room.id);
        });
      },
    });
  };

  const handleRoomLockChange = () => {
    const nextLocked = !room.locked;
    const actionLabel = nextLocked ? "锁定酒馆" : "解锁酒馆";
    const consequence = nextLocked
      ? "锁定后将不能删除该酒馆、恢复系统默认或清空对话。"
      : "解锁后将重新允许删除该酒馆、恢复系统默认或清空对话。";

    onRequestDangerAction({
      title: actionLabel,
      description: `${actionLabel}「${room.title}」？${consequence}`,
      confirmLabel: actionLabel,
      onConfirm: () => {
        const applied = setRoomLocked(room.id, nextLocked);
        if (!applied) {
          setOperationStatus(`${actionLabel}「${room.title}」失败`);
          return;
        }

        setOperationStatus(nextLocked ? `已锁定「${room.title}」` : `已解锁「${room.title}」`);
        onRoomChange?.(room.id);
      },
    });
  };

  const handleRestoreSystemPresetRoom = () => {
    if (!room.systemPresetId || room.locked) {
      return;
    }

    onRequestDangerAction({
      title: "恢复默认",
      description:
        `恢复「${room.title}」为系统默认？当前场景、角色、记忆、剧情资产和对话记录都会被系统预设覆盖。`,
      confirmLabel: "恢复默认",
      onConfirm: () => {
        void restoreSystemPresetRoom(room.id).then((applied) => {
          if (!applied) {
            setOperationStatus(`恢复「${room.title}」默认内容失败`);
            return;
          }

          setOperationStatus(`已恢复「${room.title}」默认内容`);
          onRoomChange?.(room.id);
        });
      },
    });
  };

  const handleDeleteRoom = () => {
    if (!hasMultipleRooms || room.locked) {
      return;
    }

    onRequestDangerAction({
      title: "删除酒馆",
      description: `删除酒馆「${room.title}」？房间、对话记录和剧情资产都会被永久移除。`,
      confirmLabel: "删除酒馆",
      onConfirm: () => {
        if (!deleteRoom(room.id)) {
          setOperationStatus(`删除「${room.title}」失败`);
          return;
        }

        setOperationStatus(`已删除「${room.title}」`);
        onRoomRemove?.(room.id);
      },
    });
  };

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_18px_50px_-42px_rgb(15_23_42_/_0.55)] transition-colors",
        isActive && "border-primary/45 bg-primary/[0.035] shadow-[0_20px_58px_-38px_rgb(13_148_136_/_0.45)]",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-col text-left transition-colors hover:bg-accent/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => selectRoom(room.id)}
      >
        <div className="relative">
          <div
            className="h-[clamp(6.25rem,9vw,7.5rem)] w-full overflow-hidden rounded-t-lg bg-muted bg-cover bg-center shadow-inner"
            style={coverStyle}
          />
          <span
            className={cn(
              "absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full px-2.5 py-1 text-xs font-semibold leading-4 ring-1 backdrop-blur-md",
              roomBadgeClassName,
            )}
          >
            {room.systemPresetId ? "系统预设" : visualPreset.label}
          </span>
          <div className="absolute inset-x-0 -bottom-6 flex justify-start px-4">
            <div className="flex min-w-0 items-end overflow-hidden pb-px">
              {roomCharacters.length > 0 ? (
                <div className="flex min-w-0 items-end">
                  {visibleCharacters.map((character, index) => (
                    <img
                      key={character.id}
                      src={resolveAgentAvatar(character.avatar).src}
                      alt=""
                      className={cn(
                        "size-12 rounded-lg border-2 border-background bg-background object-cover shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]",
                        index > 0 && "-ml-3",
                      )}
                    />
                  ))}
                  {hiddenCharacterCount > 0 && (
                    <span className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-lg border-2 border-background bg-background/95 text-sm font-semibold text-muted-foreground shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                      +{hiddenCharacterCount}
                    </span>
                  )}
                </div>
              ) : (
                <span className="flex size-12 items-center justify-center rounded-lg border-2 border-background bg-background/90 text-primary shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                  <Wine className="size-5" />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col px-3.5 pt-8 pb-3">
          <h3 className="min-w-0 text-xl font-semibold leading-7 line-clamp-2">
            {room.title}
          </h3>
          <p className="mt-1.5 min-h-5 line-clamp-1 text-xs leading-5 text-muted-foreground">
            {compactScene(room.scene)}
          </p>

          <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px] text-foreground/80">
            <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5">
              <UsersRound className="size-3.5 shrink-0" />
              <span className="truncate">{roomCharacters.length} 角色</span>
            </span>
            <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5">
              <MessageCircle className="size-3.5 shrink-0" />
              <span className="truncate">{messages.length} 消息</span>
            </span>
            <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5">
              <Map className="size-3.5 shrink-0" />
              <span className="truncate">{sceneCount} 场景</span>
            </span>
          </div>

          <div className="mt-2.5">
            <div className="border-t pt-2.5">
              <div className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.055] px-3 py-2 text-xs leading-5 text-muted-foreground">
                <Target className="absolute -right-3 -bottom-4 size-14 text-primary/5" />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Target className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-5 text-foreground">
                    当前目标
                  </div>
                  <div className="line-clamp-1">
                    {room.sceneGoal.trim() || emptyValueText}
                  </div>
                </div>
              </div>
            </div>
            {room.locked && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5" />
                已锁定
              </div>
            )}
          </div>
        </div>
      </button>

      <div className="border-t bg-background/80 p-2.5">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_2.25rem] gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9 min-w-0 whitespace-nowrap text-sm shadow-[0_12px_28px_-22px_rgb(13_148_136_/_0.95)]"
            onClick={handleOpenRoom}
          >
            <ArrowRight className="size-4 shrink-0" />
            <span className="truncate">进入</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 min-w-0 whitespace-nowrap bg-background/80 text-sm"
            onClick={() => openRoomEditor(room.id)}
          >
            <Pencil className="size-4 shrink-0" />
            <span className="truncate">编辑</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-9 shrink-0 bg-background/80"
                title="更多操作"
                aria-label={`更多操作：${room.title}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-48 rounded-lg p-1.5 shadow-xl"
            >
              <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">
                房间操作
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="h-8 gap-2 rounded-md px-2 text-sm"
                onSelect={handleCopyRoom}
              >
                <Copy className="size-4" />
                复制酒馆
              </DropdownMenuItem>
              <DropdownMenuItem
                className="h-8 gap-2 rounded-md px-2 text-sm"
                onSelect={handleExportRoom}
              >
                <Download className="size-4" />
                导出酒馆
              </DropdownMenuItem>
              <DropdownMenuItem
                className="h-8 gap-2 rounded-md px-2 text-sm"
                onSelect={handleRoomLockChange}
              >
                {room.locked ? (
                  <LockKeyhole className="size-4" />
                ) : (
                  <UnlockKeyhole className="size-4" />
                )}
                {room.locked ? "解锁酒馆" : "锁定酒馆"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-2 my-1.5" />
              {room.systemPresetId && (
                <DropdownMenuItem
                  className="h-8 gap-2 rounded-md px-2 text-sm"
                  disabled={room.locked}
                  onSelect={handleRestoreSystemPresetRoom}
                >
                  <RotateCcw className="size-4" />
                  恢复默认
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                className="h-8 gap-2 rounded-md px-2 text-sm"
                disabled={room.locked}
                onSelect={handleClearRoomMessages}
              >
                <RotateCcw className="size-4" />
                清空对话
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="h-8 gap-2 rounded-md px-2 text-sm"
                disabled={!hasMultipleRooms || room.locked}
                onSelect={handleDeleteRoom}
              >
                <Trash2 className="size-4" />
                删除酒馆
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
};
