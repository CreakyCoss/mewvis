import {
  Activity,
  Copy,
  Download,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ScrollText,
  Trash2,
  TriangleAlertIcon,
  UnlockKeyhole,
  Wine,
} from "lucide-react";
import { useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TavernManagementValue } from "../store";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { getVisualPreset } from "../tavern/visual-presets";

type PendingDangerAction = {
  title: string;
  description: string;
  confirmLabel: string;
  summary?: string;
  onConfirm: () => void;
};

type RoomCardProps = {
  management: Pick<
    TavernManagementValue,
    "copyRoom" | "restoreSystemPresetRoom" | "setRoomLocked" | "deleteRoom" | "exportRoom"
  >;
  room: TavernRoom;
  openRoomEditor: (room: TavernRoom) => void;
  onOperationStatusChange?: (status: string) => void;
};

export const RoomCard = ({ management, room, openRoomEditor, onOperationStatusChange }: RoomCardProps) => {
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  const { copyRoom, restoreSystemPresetRoom, setRoomLocked, deleteRoom, exportRoom } = management;
  const visualPreset = getVisualPreset(room.scenePresetId);
  const enabledPromptBlockCount = room.prompt.blocks.filter((block) => block.enabled && block.text.trim()).length;
  const progressConfigCount = room.statusDefinitions.length + room.taskDefinitions.length + room.sceneOutcomes.length;
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

  const requestDangerAction = (action: PendingDangerAction) => {
    setPendingDangerAction(action);
  };

  const closeDangerAction = () => {
    setPendingDangerAction(null);
  };

  const confirmDangerAction = () => {
    if (!pendingDangerAction) {
      return;
    }

    pendingDangerAction.onConfirm();
    closeDangerAction();
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
  };

  const handleExportRoom = () => {
    const exported = exportRoom(room.id);
    const message = exported ? `已导出「${room.title}」房间配置` : `导出「${room.title}」房间配置失败`;

    setOperationStatus(message);
    if (exported) {
      toast.success(message);
    } else {
      toast.error(message);
    }
  };

  const handleRoomLockChange = () => {
    const nextLocked = !room.locked;
    const actionLabel = nextLocked ? "锁定酒馆" : "解锁酒馆";
    const consequence = nextLocked
      ? "锁定后将不能删除该酒馆或恢复系统默认。"
      : "解锁后将重新允许删除该酒馆或恢复系统默认。";

    requestDangerAction({
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
      },
    });
  };

  const handleRestoreSystemPresetRoom = () => {
    if (!room.systemPresetId || room.locked) {
      return;
    }

    requestDangerAction({
      title: "恢复默认",
      description: `恢复「${room.title}」为系统默认？当前房间配置会被系统预设覆盖。`,
      confirmLabel: "恢复默认",
      onConfirm: () => {
        void restoreSystemPresetRoom(room.id).then((applied) => {
          if (!applied) {
            setOperationStatus(`恢复「${room.title}」默认内容失败`);
            return;
          }

          setOperationStatus(`已恢复「${room.title}」默认内容`);
        });
      },
    });
  };

  const handleDeleteRoom = () => {
    if (room.locked) {
      return;
    }

    requestDangerAction({
      title: "删除酒馆",
      description: `删除酒馆「${room.title}」？该房间配置会被永久移除。`,
      confirmLabel: "删除酒馆",
      onConfirm: () => {
        if (!deleteRoom(room.id)) {
          setOperationStatus(`删除「${room.title}」失败`);
          return;
        }

        setOperationStatus(`已删除「${room.title}」`);
      },
    });
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-[0_18px_50px_-42px_rgb(15_23_42_/_0.55)]">
      <div className="flex min-w-0 flex-col text-left">
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
              <span className="flex size-12 items-center justify-center rounded-lg border-2 border-background bg-background/90 text-primary shadow-[0_10px_26px_-18px_rgb(15_23_42_/_0.8)]">
                <Wine className="size-5" />
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col px-3.5 pt-8 pb-3">
          <h3 className="min-w-0 text-xl font-semibold leading-7 line-clamp-2">{room.title}</h3>
          <p className="mt-1.5 min-h-5 line-clamp-1 text-xs leading-5 text-muted-foreground">{visualPreset.label}</p>

          <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px] text-foreground/80">
            <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5">
              <Wine className="size-3.5 shrink-0" />
              <span className="truncate">{room.replyMode === "director" ? "导演调度" : "运行"}</span>
            </span>
            <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5">
              <ScrollText className="size-3.5 shrink-0" />
              <span className="truncate">{enabledPromptBlockCount} 提示词</span>
            </span>
            <span className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border bg-muted/20 px-1.5">
              <Activity className="size-3.5 shrink-0" />
              <span className="truncate">{progressConfigCount} 进度</span>
            </span>
          </div>

          <div className="mt-2.5">
            <div className="border-t pt-2.5">
              <div className="relative flex h-14 items-center gap-2.5 overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.055] px-3 py-2 text-xs leading-5 text-muted-foreground">
                <Activity className="absolute -right-3 -bottom-4 size-14 text-primary/5" />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Activity className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold leading-5 text-foreground">状态追踪</div>
                  <div className="line-clamp-1">{room.progressTracker.enabled ? "已开启" : "未开启"}</div>
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
      </div>

      <div className="border-t bg-background/80 p-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9 min-w-0 whitespace-nowrap text-sm shadow-[0_12px_28px_-22px_rgb(13_148_136_/_0.95)]"
            onClick={() => openRoomEditor(room)}
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
            <DropdownMenuContent align="end" sideOffset={8} className="w-48 rounded-lg p-1.5 shadow-xl">
              <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">房间操作</DropdownMenuLabel>
              <DropdownMenuItem className="h-8 gap-2 rounded-md px-2 text-sm" onSelect={handleCopyRoom}>
                <Copy className="size-4" />
                复制酒馆
              </DropdownMenuItem>
              <DropdownMenuItem className="h-8 gap-2 rounded-md px-2 text-sm" onSelect={handleExportRoom}>
                <Download className="size-4" />
                导出房间配置
              </DropdownMenuItem>
              <DropdownMenuItem className="h-8 gap-2 rounded-md px-2 text-sm" onSelect={handleRoomLockChange}>
                {room.locked ? <LockKeyhole className="size-4" /> : <UnlockKeyhole className="size-4" />}
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
                onSelect={handleDeleteRoom}
              >
                <Trash2 className="size-4" />
                删除酒馆
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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
                <DialogTitle>{pendingDangerAction.title}</DialogTitle>
              </div>
              <DialogDescription>{pendingDangerAction.description}</DialogDescription>
            </DialogHeader>

            {pendingDangerAction.summary && (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {pendingDangerAction.summary}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDangerAction}>
                取消
              </Button>
              <Button type="button" variant="destructive" onClick={confirmDangerAction}>
                {pendingDangerAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </article>
  );
};
