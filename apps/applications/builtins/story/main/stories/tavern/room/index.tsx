import { confirm } from "@/platform/confirm";
import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { buildRuntimeModelInputs } from "@/platform/models";
import { listModels } from "@/platform/models";
import { Button } from "design-system/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "design-system/components/ui/dialog";
import { cn } from "design-system/lib/utils";
import { TavernAgentFlow } from "./agent-flow";
import { TavernRoomContent } from "./content";
import { useTavernRoomContext } from "./context";
import { Header } from "./header";
import type { TavernStoryData } from "./model";
import { SidePanel } from "./side-panel";
import { deleteTavernRoom, loadTavernRoom, saveTavernRoom } from "./storage";

const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none p-0 !ring-0";

export type TavernRoomOpenOptions = {
  workspacePath: string;
  story: TavernStoryData;
};

export type TavernRoomHandle = (options: TavernRoomOpenOptions) => void;

type TavernRoomDialogProps = {
  bind: Ref<TavernRoomHandle>;
};

export const TavernRoomDialog = ({ bind }: TavernRoomDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRoomLoaded, setIsRoomLoaded] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [openError, setOpenError] = useState("");
  const workspacePath = useTavernRoomContext((store) => store.workspacePath);
  const initializeRoom = useTavernRoomContext((store) => store.initializeRoom);
  const setRuntimeModel = useTavernRoomContext((store) => store.setRuntimeModel);
  const story = useTavernRoomContext((store) => store.story);
  const messages = useTavernRoomContext((store) => store.messages);
  const visualPreset = useTavernRoomContext((store) => store.visualPreset);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const openRequestIdRef = useRef(0);
  const openOptionsRef = useRef<TavernRoomOpenOptions | null>(null);

  const open = useCallback(
    (options: TavernRoomOpenOptions) => {
      openRequestIdRef.current += 1;
      const requestId = openRequestIdRef.current;
      const nextWorkspacePath = options.workspacePath.trim();
      openOptionsRef.current = {
        workspacePath: nextWorkspacePath,
        story: options.story,
      };
      setIsOpen(true);
      setIsRoomLoaded(false);
      setIsResetting(false);
      setOpenError("");
      setIsSidePanelOpen(false);
      setRuntimeModel(null);

      void listModels()
        .then((settings) => {
          if (requestId !== openRequestIdRef.current) {
            return;
          }

          const defaultModel = settings[0];
          const runtimeModelInputs = buildRuntimeModelInputs(settings);
          setRuntimeModel(defaultModel ? (runtimeModelInputs[defaultModel.id] ?? null) : null);
        })
        .catch((error) => {
          if (requestId === openRequestIdRef.current) {
            console.error("Failed to load runtime model", error);
            setRuntimeModel(null);
          }
        });

      void loadTavernRoom(nextWorkspacePath)
        .then((storedRoom) => {
          if (requestId !== openRequestIdRef.current) {
            return;
          }

          initializeRoom({
            workspacePath: nextWorkspacePath,
            story: options.story,
            messages: storedRoom?.messages ?? [],
          });
          setIsRoomLoaded(true);
        })
        .catch((loadError) => {
          if (requestId !== openRequestIdRef.current) {
            return;
          }

          console.error("Failed to open tavern room", loadError);
          setOpenError("酒馆房间数据加载失败，请检查运行文件后重试。");
        });
    },
    [initializeRoom, setRuntimeModel],
  );

  useImperativeHandle(bind, () => open, [bind, open]);

  useEffect(() => {
    if (!workspacePath || !isRoomLoaded || !story) {
      return;
    }

    void saveTavernRoom(workspacePath, messages).catch((saveError) => {
      console.error("Failed to save tavern room", saveError);
    });
  }, [story, messages, isRoomLoaded, workspacePath]);

  const resetRoomData = async () => {
    const openOptions = openOptionsRef.current;
    if (
      !openOptions ||
      !(await confirm(
        `清空章节「${openOptions.story.context.target?.label || openOptions.story.chapterId}」的酒馆运行数据？下次会按故事页传入的最新上下文重新初始化。`,
      )
    )) {
      return;
    }

    const wasRoomLoaded = isRoomLoaded && !openError && Boolean(story);
    const requestId = openRequestIdRef.current + 1;
    openRequestIdRef.current = requestId;
    setIsResetting(true);

    try {
      await TavernAgentFlow.deleteSession({
        workspacePath: openOptions.workspacePath,
      });
      await deleteTavernRoom(openOptions.workspacePath);
      if (requestId !== openRequestIdRef.current) {
        return;
      }

      initializeRoom({
        workspacePath: openOptions.workspacePath,
        story: openOptions.story,
        messages: [],
      });
      setOpenError("");
      setIsRoomLoaded(true);
      toast.success("已按最新故事数据重建当前章节酒馆");
    } catch (resetError) {
      if (requestId !== openRequestIdRef.current) {
        return;
      }

      console.error("Failed to reset tavern room", resetError);
      if (wasRoomLoaded) {
        const message = resetError instanceof Error ? resetError.message : "未知错误";
        useTavernRoomContext.getState().setError(`无法清理当前章节运行数据：${message}`);
        toast.error("清空当前章节失败");
      } else {
        setOpenError("酒馆房间数据重置失败，请重试。");
        toast.error("重置酒馆房间数据失败");
      }
    } finally {
      if (requestId === openRequestIdRef.current) {
        setIsResetting(false);
      }
    }
  };

  const closeRoomSurface = () => {
    openRequestIdRef.current += 1;
    setIsSidePanelOpen(false);
    setIsResetting(false);
    setIsOpen(false);
    setRuntimeModel(null);
  };

  if (!isOpen) {
    return null;
  }

  if (!isRoomLoaded || openError || !story) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeRoomSurface();
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/5 backdrop-blur-none"
          className={cn(fullScreenDialogContentClassName, "items-center justify-center bg-background text-foreground")}
        >
          <DialogTitle className="sr-only">酒馆房间</DialogTitle>
          <div className="app-empty-state flex max-w-md flex-col items-center gap-4 rounded-2xl px-6 py-5 text-center text-sm text-muted-foreground">
            <p>
              {openError || (!isRoomLoaded ? "正在加载酒馆房间" : "当前没有可进入的酒馆房间，请先从故事章节打开酒馆。")}
            </p>
            {openError ? (
              <Button type="button" disabled={isResetting} onClick={() => void resetRoomData()}>
                {isResetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                {isResetting ? "正在重置" : "重置数据"}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeRoomSurface();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/5 backdrop-blur-none"
        className={cn(fullScreenDialogContentClassName, "text-foreground", visualPreset.tavern.page)}
      >
        <DialogTitle className="sr-only">{story.roomConfig.title || "酒馆房间"}</DialogTitle>
        <div
          className={[
            "grid min-h-0 w-full flex-1 grid-cols-1",
            isSidePanelOpen ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1",
          ].join(" ")}
        >
          <main className="flex min-h-0 min-w-0 flex-col">
            <Header
              isSidePanelOpen={isSidePanelOpen}
              isResetting={isResetting}
              onBack={closeRoomSurface}
              onReset={resetRoomData}
              onToggleSidePanel={() => {
                setIsSidePanelOpen((current) => !current);
              }}
            />

            <TavernRoomContent isOpen={isOpen} isSidePanelOpen={isSidePanelOpen} />
          </main>

          <SidePanel isOpen={isSidePanelOpen} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
