import {
  ArrowRight,
  Copy,
  Download,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  UnlockKeyhole,
  UsersRound,
  Wine,
} from "lucide-react";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { resolveAgentAvatar } from "@/assets/agent-avatars";
import { Badge } from "@/components/ui/badge";
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
import type { TavernCharacter, TavernRoom } from "../../types";
import { compactScene } from "../../utils";
import { useManagementContext } from "./context";
import { emptyValueText } from "./room-editor/utils";

type RoomCardRuntimeValue = {
  openRoomEditor: (roomId: string) => void;
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

const confirmDangerousRoomAction = (
  firstMessage: string,
  secondMessage: string,
) => window.confirm(firstMessage) && window.confirm(secondMessage);

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
    onOperationStatusChange,
  } = useRoomCardRuntime();

  const isActive = room.id === activeRoom.id;
  const hasMultipleRooms = rooms.length > 1;
  const roomCharacters = room.characterIds
    .map((characterId) => characterById.get(characterId))
    .filter((character): character is TavernCharacter => Boolean(character));
  const messages = messagesByRoomId[room.id] ?? [];
  const draftCount = room.assetDrafts.length;

  const setOperationStatus = (status: string) => {
    onOperationStatusChange?.(status);
  };

  const handleOpenRoom = () => {
    selectRoom(room.id);
    onOpenRoom?.(room);
  };

  const handleCopyRoom = () => {
    if (!copyRoom(room.id)) {
      setOperationStatus(`复制「${room.title}」失败`);
      return;
    }

    setOperationStatus(`已复制「${room.title}」`);
    onRoomCopy?.(room.id);
  };

  const handleExportRoom = () => {
    const exported = exportRoom(room.id);
    setOperationStatus(
      exported
        ? `已导出「${room.title}」`
        : `导出「${room.title}」失败`,
    );
  };

  const handleClearRoomMessages = () => {
    if (room.locked) {
      return;
    }

    if (!confirmDangerousRoomAction(
      `清空「${room.title}」的对话记录？`,
      "再次确认清空对话？系统会先保存状态检查点，再把当前房间现有消息替换为一条重置提示。",
    )) {
      return;
    }

    void clearRoomMessages(room.id).then((applied) => {
      if (!applied) {
        setOperationStatus(`清空「${room.title}」失败`);
        return;
      }

      setOperationStatus(`已清空「${room.title}」的对话`);
      onRoomChange?.(room.id);
    });
  };

  const handleRoomLockChange = () => {
    const nextLocked = !room.locked;
    const applied = setRoomLocked(room.id, nextLocked);
    if (!applied) {
      return;
    }

    setOperationStatus(nextLocked ? `已锁定「${room.title}」` : `已解锁「${room.title}」`);
    onRoomChange?.(room.id);
  };

  const handleRestoreSystemPresetRoom = () => {
    if (!room.systemPresetId || room.locked) {
      return;
    }

    void restoreSystemPresetRoom(room.id).then((applied) => {
      if (!applied) {
        return;
      }

      setOperationStatus(`已恢复「${room.title}」默认内容`);
      onRoomChange?.(room.id);
    });
  };

  const handleDeleteRoom = () => {
    if (!hasMultipleRooms || room.locked) {
      return;
    }

    if (!confirmDangerousRoomAction(
      `删除酒馆「${room.title}」？房间、对话记录和剧情资产都会被永久移除。`,
      `再次确认删除酒馆「${room.title}」？`,
    )) {
      return;
    }

    if (!deleteRoom(room.id)) {
      setOperationStatus(`删除「${room.title}」失败`);
      return;
    }

    setOperationStatus(`已删除「${room.title}」`);
    onRoomRemove?.(room.id);
  };

  return (
    <article
      className={cn(
        "flex min-h-[24rem] flex-col overflow-hidden rounded-md border bg-card shadow-sm transition-colors",
        isActive && "border-primary/50 bg-primary/[0.04] shadow-md",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col text-left transition-colors hover:bg-accent/20 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        onClick={() => selectRoom(room.id)}
      >
        <div className="relative flex aspect-[4/5] min-h-[12rem] flex-col justify-between overflow-hidden border-b bg-muted/35 p-3">
          <div className="relative flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {room.systemPresetId && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  系统预设
                </Badge>
              )}
              {draftCount > 0 && (
                <Badge variant="outline" className="h-5 bg-background/70 px-1.5 text-[11px]">
                  {draftCount} 草稿
                </Badge>
              )}
            </div>
            {room.locked && (
              <Badge
                variant="outline"
                className="h-6 w-6 shrink-0 justify-center bg-background/80 p-0"
                title="已锁定"
                aria-label="已锁定"
              >
                <LockKeyhole className="size-3" />
              </Badge>
            )}
          </div>

          <div className="relative mt-auto space-y-3">
            <div className="flex min-h-14 items-end">
              {roomCharacters.length > 0 ? (
                <div className="flex min-w-0 items-end">
                  {roomCharacters.slice(0, 4).map((character, index) => (
                    <img
                      key={character.id}
                      src={resolveAgentAvatar(character.avatar).src}
                      alt=""
                      className={cn(
                        "size-14 rounded-md border-2 border-background bg-background object-cover shadow-sm",
                        index > 0 && "-ml-4",
                      )}
                    />
                  ))}
                </div>
              ) : (
                <span className="flex size-14 items-center justify-center rounded-md border-2 border-background bg-background/85 text-primary shadow-sm">
                  <Wine className="size-6" />
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-background/75 px-2">
                <UsersRound className="size-3.5" />
                {roomCharacters.length}
              </span>
              <span className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-background/75 px-2">
                <MessageCircle className="size-3.5" />
                {messages.length}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="min-w-0 text-base font-semibold leading-6 line-clamp-2">
            {room.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
            {compactScene(room.scene)}
          </p>
          <div className="mt-auto pt-3">
            <div className="min-h-14 rounded-md bg-muted/35 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
              <div className="mb-0.5 font-medium text-foreground/70">场景目标</div>
              <div className="line-clamp-2">
                {room.sceneGoal.trim() || emptyValueText}
              </div>
            </div>
          </div>
        </div>
      </button>

      <div className="border-t bg-background/70 p-2.5">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 min-w-0 whitespace-nowrap px-2"
            onClick={handleOpenRoom}
          >
            <ArrowRight className="size-3.5 shrink-0" />
            <span className="truncate">进入</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 min-w-0 whitespace-nowrap px-2"
            onClick={() => openRoomEditor(room.id)}
          >
            <Pencil className="size-3.5 shrink-0" />
            <span className="truncate">编辑</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                title="更多操作"
                aria-label={`更多操作：${room.title}`}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>房间操作</DropdownMenuLabel>
              <DropdownMenuItem onSelect={handleCopyRoom}>
                <Copy className="size-4" />
                复制酒馆
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportRoom}>
                <Download className="size-4" />
                导出酒馆
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={room.locked}
                onSelect={handleClearRoomMessages}
              >
                <RotateCcw className="size-4" />
                清空对话
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleRoomLockChange}>
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
                  onSelect={handleRestoreSystemPresetRoom}
                >
                  <RotateCcw className="size-4" />
                  恢复默认
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
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
