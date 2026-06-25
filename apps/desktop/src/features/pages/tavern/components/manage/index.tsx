import {
  ArrowLeft,
  Check,
  FileUp,
  GitBranch,
  Map,
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
  getTavernSceneDisplayTitle,
  getTavernSceneInstanceDisplayTitle,
} from "../../runtime/scene-selectors";
import type { TavernRoom } from "../../types";
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
  onBack?: () => void;
};

const pathPrefixEquals = (left: string[], right: string[]) =>
  left.length === right.length && left.every((nodeId, index) => nodeId === right[index]);

const getRunNodeSceneInstance = (
  room: TavernRoom,
  pathNodeIds: string[],
) => room.sceneInstances.find((instance) =>
  pathPrefixEquals(instance.pathNodeIds, pathNodeIds)
);

const getStoryNodeTitle = (
  room: TavernRoom,
  nodeId: string,
) => {
  const node = room.storyGraph.nodes.find((item) => item.id === nodeId);
  return node?.title.trim() ||
    getTavernSceneDisplayTitle(room, node?.sceneId, "未命名节点");
};

export const ManagementPage = ({
  tavernPage,
  onBack,
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
  const [pendingEntryRoomId, setPendingEntryRoomId] = useState("");
  const [selectedEntrySceneInstanceId, setSelectedEntrySceneInstanceId] = useState("");
  const [roomOperationStatus, setRoomOperationStatus] = useState("");
  const roomImportInputRef = useRef<HTMLInputElement | null>(null);
  const quickCreateRef = useRef<QuickCreateHandle>(null);
  const ordinaryCreateRef = useRef<OrdinaryCreateHandle>(null);
  const roomEditorRef = useRef<RoomEditorHandle>(null);

  const activeRoomMessages = activeRoom ? messagesByRoomId[activeRoom.id] ?? [] : [];
  const pendingEntryRoom = pendingEntryRoomId
    ? rooms.find((room) => room.id === pendingEntryRoomId) ?? null
    : null;
  const selectedEntrySceneInstance = pendingEntryRoom?.sceneInstances.find((instance) =>
    instance.id === selectedEntrySceneInstanceId
  ) ?? pendingEntryRoom?.sceneInstances[0] ?? null;
  const entryRunRows = pendingEntryRoom
    ? pendingEntryRoom.storyRuns.flatMap((run, runIndex) => {
        const options = run.pathNodeIds.flatMap((nodeId, nodeIndex) => {
          const pathNodeIds = run.pathNodeIds.slice(0, nodeIndex + 1);
          const instance = getRunNodeSceneInstance(pendingEntryRoom, pathNodeIds);
          if (!instance) {
            return [];
          }

          return [{
            instance,
            nodeId,
            index: nodeIndex,
            title: getStoryNodeTitle(pendingEntryRoom, nodeId),
          }];
        });

        return options.length > 0
          ? [{
              id: run.id,
              title: run.title.trim() || `分支 ${runIndex + 1}`,
              options,
            }]
          : [];
      })
    : [];
  const totalRoomCharacterCount = rooms.reduce(
    (sum, room) => sum + (room.localCharacters?.length ?? 0),
    0,
  );

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

  const openRoomEntrySelector = (room: TavernRoom) => {
    const nextSceneInstanceId = room.activeSceneInstanceId ?? room.sceneInstances[0]?.id ?? "";
    selectRoom(room.id);
    setPendingEntryRoomId(room.id);
    setSelectedEntrySceneInstanceId(nextSceneInstanceId);
  };

  const closeRoomEntrySelector = () => {
    setPendingEntryRoomId("");
    setSelectedEntrySceneInstanceId("");
  };

  const confirmRoomEntry = () => {
    if (!pendingEntryRoom) {
      return;
    }

    tavernPage?.current?.open(
      pendingEntryRoom,
      selectedEntrySceneInstance?.id ?? pendingEntryRoom.activeSceneInstanceId,
    );
    closeRoomEntrySelector();
  };

  const handleImportRoomFile = async (event: FormEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const error = importRoom(await file.text());
      setRoomOperationStatus(error ?? "运行快照已导入");
    } catch {
      setRoomOperationStatus("读取运行快照失败");
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full flex-col gap-4 px-5 py-5 lg:px-7">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {onBack && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0"
                  title="返回侧边栏"
                  aria-label="返回侧边栏"
                  onClick={onBack}
                >
                  <ArrowLeft className="size-4" />
                </Button>
              )}
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
                accept="application/json,.json,.tavern-runtime"
                className="hidden"
                onChange={handleImportRoomFile}
              />
              {activeRoom && (
                <QuickCreate
                  bind={quickCreateRef}
                  rooms={rooms}
                  activeRoom={activeRoom}
                  onQuickCreateRoom={quickCreateRoom}
                  onRunTextFieldAgent={runTextFieldAgent}
                  onOperationStatusChange={setRoomOperationStatus}
                />
              )}
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
                    导入运行快照
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <section className="space-y-3">
            <RoomCardRuntimeProvider
              value={{
                openRoomEditor: (roomId) => roomEditorRef.current?.(roomId),
                onRequestDangerAction: requestDangerAction,
                onOperationStatusChange: setRoomOperationStatus,
              }}
            >
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] items-start gap-5">
                {rooms.length > 0 ? (
                  rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onOpenRoom={openRoomEntrySelector}
                    />
                  ))
                ) : (
                  <div className="col-span-full rounded-md border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                    酒馆暂无房间。请从故事页选择节点进入酒馆，或手动创建一个空房间。
                  </div>
                )}
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
                {pendingDangerAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog
        open={Boolean(pendingEntryRoom)}
        onOpenChange={(open) => {
          if (!open) {
            closeRoomEntrySelector();
          }
        }}
      >
        {pendingEntryRoom && (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Map className="size-4" />
                </span>
                <DialogTitle>进入「{pendingEntryRoom.title}」</DialogTitle>
              </div>
              <DialogDescription>
                选择一个分支路径和节点后进入，对话、桥接会话和记忆都会落在对应节点实例。
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[56vh] pr-3">
              <div className="space-y-4">
                {entryRunRows.length > 0 ? (
                  entryRunRows.map((runRow) => (
                    <section key={runRow.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <GitBranch className="size-3.5" />
                        <span className="truncate">{runRow.title}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {runRow.options.map((option) => {
                          const isSelected = option.instance.id === selectedEntrySceneInstance?.id;
                          return (
                            <button
                              key={`${runRow.id}:${option.index}:${option.instance.id}`}
                              type="button"
                              className={[
                                "flex min-h-16 w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                                isSelected
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-background hover:border-primary/50 hover:bg-muted/40",
                              ].join(" ")}
                              onClick={() => setSelectedEntrySceneInstanceId(option.instance.id)}
                            >
                              <span
                                className={[
                                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                                  isSelected
                                    ? "border-primary/40 bg-primary/15"
                                    : "border-border bg-muted/35 text-muted-foreground",
                                ].join(" ")}
                              >
                                {option.index + 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {option.title}
                                </span>
                                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                  {getTavernSceneInstanceDisplayTitle(
                                    pendingEntryRoom,
                                    option.instance.id,
                                    option.title,
                                  )}
                                </span>
                              </span>
                              {isSelected && <Check className="mt-1 size-4 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    当前酒馆没有可进入的剧情节点。
                  </div>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeRoomEntrySelector}
              >
                取消
              </Button>
              <Button
                type="button"
                disabled={!selectedEntrySceneInstance}
                onClick={confirmRoomEntry}
              >
                进入节点
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {activeRoom && (
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
          onOpenRoom={openRoomEntrySelector}
        />
      )}
    </div>
  );
};
