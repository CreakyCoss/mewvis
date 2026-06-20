import {
  FileUp,
  MoreHorizontal,
  Plus,
  TriangleAlertIcon,
  Wine,
} from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { useRef, useState } from "react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  OrdinaryCreate,
  type OrdinaryCreateHandle,
} from "./ordinary-create";
import {
  QuickCreate,
  type QuickCreateHandle,
} from "./quick-create";
import {
  RoomCard,
  RoomCardRuntimeProvider,
} from "./room-card";
import { RoomEditor, type RoomEditorHandle } from "./room-editor";
import type { PendingDangerAction } from "./room-editor/types";
import { formatCount } from "./room-editor/utils";
import {
  type PageNavigationHandle,
  useManagementContext,
} from "./context";

type ManagementPageProps = {
  tavernPage?: RefObject<PageNavigationHandle | null>;
};

export const ManagementPage = ({
  tavernPage,
}: ManagementPageProps) => {
  const {
    rooms,
    activeRoom,
    characterById,
    messagesByRoomId,
    createRoom,
    quickCreateRoom,
    patchRoom,
    selectRoom,
    importRoom,
    globalRuntimeModel,
    runTextFieldAgent,
    regenerateDirectorProfile,
  } = useManagementContext();
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  const [dangerConfirmStep, setDangerConfirmStep] = useState<1 | 2>(1);
  const [roomOperationStatus, setRoomOperationStatus] = useState("");
  const roomImportInputRef = useRef<HTMLInputElement | null>(null);
  const quickCreateRef = useRef<QuickCreateHandle>(null);
  const ordinaryCreateRef = useRef<OrdinaryCreateHandle>(null);
  const roomEditorRef = useRef<RoomEditorHandle>(null);

  const activeRoomMessages = messagesByRoomId[activeRoom.id] ?? [];
  const totalRoomCharacterCount = rooms.reduce(
    (sum, room) => sum + (room.localCharacters?.length ?? 0),
    0,
  );

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

  const handleImportRoomFile = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const error = importRoom(await file.text());
      setRoomOperationStatus(error ?? "房间已导入");
    } catch {
      setRoomOperationStatus("读取房间文件失败");
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full flex-col gap-4 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/35">
                <Wine className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold leading-7">酒馆管理</h1>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{formatCount(rooms.length, "房间")}</span>
                  <span>{formatCount(totalRoomCharacterCount, "角色")}</span>
                  <span>{formatCount(activeRoomMessages.length, "消息")}</span>
                  {roomOperationStatus && (
                    <span aria-live="polite">{roomOperationStatus}</span>
                  )}
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
              <QuickCreate
                bind={quickCreateRef}
                rooms={rooms}
                activeRoom={activeRoom}
                onQuickCreateRoom={quickCreateRoom}
                onRunTextFieldAgent={runTextFieldAgent}
                onOperationStatusChange={setRoomOperationStatus}
              />
              <OrdinaryCreate
                bind={ordinaryCreateRef}
                onCreateRoom={createRoom}
                onOpenRoomEditor={(roomId) => roomEditorRef.current?.(roomId)}
                onOperationStatusChange={setRoomOperationStatus}
                showTrigger={false}
              />
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
                    onSelect={() => ordinaryCreateRef.current?.()}
                  >
                    <Plus className="size-4" />
                    普通创建
                  </DropdownMenuItem>
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
            <RoomCardRuntimeProvider
              value={{
                openRoomEditor: (roomId) => roomEditorRef.current?.(roomId),
                onOperationStatusChange: setRoomOperationStatus,
              }}
            >
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-5">
                {rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onOpenRoom={(nextRoom) => tavernPage?.current?.open(nextRoom)}
                  />
                ))}
              </div>
            </RoomCardRuntimeProvider>
          </section>
        </div>
      </ScrollArea>

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

      <RoomEditor
        bind={roomEditorRef}
        rooms={rooms}
        activeRoom={activeRoom}
        characterById={characterById}
        messagesByRoomId={messagesByRoomId}
        globalRuntimeModel={globalRuntimeModel}
        onSelectRoom={selectRoom}
        onPatchRoom={patchRoom}
        onRunTextFieldAgent={runTextFieldAgent}
        onRegenerateDirectorProfile={regenerateDirectorProfile}
        onRequestDangerAction={requestDangerAction}
      />
    </div>
  );
};
