import { Loader2, LogOut, ScrollText, Settings2, Wine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowDragRegion } from "@/components/window-drag-region";
import { useLlmSettingsStore } from "@/features/pages/settings/llm/store";
import type { StoryLibraryItem } from "../../storage";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import type { TavernRoomConfig } from "./model";
import { BasicSection } from "./modules/basic";
import { PromptSection } from "./modules/prompt";
import { SettingsSection } from "./modules/settings";
import { loadOrCreateStoryTavernConfig, saveStoryTavernConfig } from "./storage";
import { cloneTavernRoom, prepareTavernRoomForSave } from "./utils";

export type TavernManageHandle = {
  close: () => void;
  open: (item: StoryLibraryItem) => void;
};

type EditorModuleId = "basic" | "prompt" | "settings";

type EditorModuleGroupId = "runtime";

const editorModules: Array<{
  id: EditorModuleId;
  group: EditorModuleGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "basic",
    group: "runtime",
    label: "基础",
    description: "标题、视觉和发言方式",
    icon: Wine,
  },
  {
    id: "prompt",
    group: "runtime",
    label: "呈现与叙事",
    description: "呈现规则、系统叙事和房间文风",
    icon: ScrollText,
  },
  {
    id: "settings",
    group: "runtime",
    label: "运行设置",
    description: "模型和执行策略",
    icon: Settings2,
  },
];

const editorModuleGroups: Array<{
  id: EditorModuleGroupId;
  label: string;
  mobileLabel: string;
}> = [
  {
    id: "runtime",
    label: "故事酒馆配置",
    mobileLabel: "运行",
  },
];

const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none !bg-background p-0 text-foreground !ring-0";

type TavernManageContentProps = {
  bind: Ref<TavernManageHandle>;
  onBack: () => void;
};

export const TavernManageContent = ({ bind, onBack }: TavernManageContentProps) => {
  const [item, setItem] = useState<StoryLibraryItem | null>(null);
  const [data, setData] = useState<TavernRoomConfig | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<EditorModuleId>("basic");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const globalRuntimeModel = runtimeModels[0] ?? null;
  const openRequestIdRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const close = useCallback(() => {
    openRequestIdRef.current += 1;
    setItem(null);
    setData(null);
    setIsLoading(false);
    setLoadError("");
  }, []);

  const open = useCallback((nextItem: StoryLibraryItem) => {
    const requestId = openRequestIdRef.current + 1;
    openRequestIdRef.current = requestId;
    setItem(nextItem);
    setData(null);
    setActiveModuleId("basic");
    setIsLoading(true);
    setLoadError("");

    void loadOrCreateStoryTavernConfig(nextItem)
      .then((config) => {
        if (requestId !== openRequestIdRef.current) {
          return;
        }
        setData(cloneTavernRoom(config));
      })
      .catch((error) => {
        if (requestId !== openRequestIdRef.current) {
          return;
        }
        console.error("Failed to load story tavern config", error);
        setLoadError(error instanceof Error ? error.message : "故事酒馆配置加载失败。");
      })
      .finally(() => {
        if (requestId === openRequestIdRef.current) {
          setIsLoading(false);
        }
      });
  }, []);

  useImperativeHandle(bind, () => ({ close, open }), [bind, close, open]);

  const handleBack = () => {
    close();
    onBack();
  };

  const persistRoom = (room: TavernRoomConfig) => {
    if (!item) {
      return room;
    }

    const nextRoom = prepareTavernRoomForSave(room);
    setData(cloneTavernRoom(nextRoom));
    const workspace = item.workspace;
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await saveStoryTavernConfig(workspace, nextRoom);
      })
      .catch((error) => {
        console.error("Failed to save story tavern config", error);
        toast.error("酒馆配置保存失败。");
      });
    return nextRoom;
  };

  const onModuleSave = (patch: Partial<TavernRoomConfig>) => {
    if (!data) {
      return;
    }

    persistRoom({ ...data, ...patch });
  };

  const renderActiveModule = () => {
    if (!data) {
      return null;
    }

    switch (activeModuleId) {
      case "basic":
        return <BasicSection data={data} onSave={onModuleSave} />;
      case "prompt":
        return <PromptSection data={data} onSave={onModuleSave} />;
      case "settings":
        return <SettingsSection data={data} globalRuntimeModel={globalRuntimeModel} onSave={onModuleSave} />;
    }
  };

  return (
    <Dialog open={Boolean(item)} onOpenChange={(nextOpen) => !nextOpen && handleBack()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/5 backdrop-blur-none"
        className={fullScreenDialogContentClassName}
      >
        <DialogTitle className="sr-only">
          {item?.story.title ? `${item.story.title} · 酒馆配置` : "故事酒馆配置"}
        </DialogTitle>
        <WindowDragRegion className="h-10 shrink-0" />
        {isLoading || !data ? (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6">
            <div className="flex max-w-md flex-col items-center gap-4 rounded-md border bg-card px-6 py-5 text-center text-sm text-muted-foreground">
              {isLoading ? (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  <p>正在读取 story/tavern.json</p>
                </>
              ) : (
                <>
                  <p>{loadError || "当前故事酒馆配置不可用。"}</p>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={handleBack}>
                      返回故事
                    </Button>
                    {item ? (
                      <Button type="button" onClick={() => open(item)}>
                        重试
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
            <aside className="hidden w-20 shrink-0 flex-col border-r bg-muted/10 px-2 py-4 md:flex">
              <div className="mb-4 flex justify-center">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Wine className="size-5" />
                </span>
              </div>
              <nav className="flex min-h-0 flex-1 flex-col gap-1">
                {editorModuleGroups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-1">
                    <div className="px-1 pt-2 pb-1 text-center text-[10px] font-medium leading-4 text-muted-foreground/75">
                      {group.label}
                    </div>
                    {editorModules
                      .filter((module) => module.group === group.id)
                      .map(({ id, label, description, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          title={`${group.label} / ${label}：${description}`}
                          aria-label={`切换到${group.label}的${label}`}
                          onClick={() => setActiveModuleId(id)}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-md px-1.5 py-2 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                            activeModuleId === id && "bg-primary/10 text-primary",
                          )}
                        >
                          <Icon className="size-4" />
                          <span className="max-w-full truncate">{label}</span>
                        </button>
                      ))}
                  </div>
                ))}
              </nav>
              <div className="mt-3 border-t pt-3">
                <button
                  type="button"
                  className="flex h-12 w-full flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  title="返回故事"
                  aria-label="返回故事"
                  onClick={handleBack}
                >
                  <LogOut className="size-4 rotate-180" />
                </button>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <Header data={data} onBack={handleBack} />

              <ScrollArea className="min-h-0 flex-1 bg-muted/10">
                <div className="flex w-full flex-col gap-4 px-4 py-4 lg:px-6">
                  <nav className="flex gap-2 overflow-x-auto pb-1 md:hidden">
                    <Button
                      type="button"
                      title="返回故事"
                      aria-label="返回故事"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                      onClick={handleBack}
                    >
                      <LogOut className="size-3.5 rotate-180" />
                    </Button>
                    {editorModuleGroups.map((group) => (
                      <div key={group.id} className="flex shrink-0 items-center gap-1">
                        <span className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] font-medium leading-5 text-muted-foreground">
                          {group.mobileLabel}
                        </span>
                        {editorModules
                          .filter((module) => module.group === group.id)
                          .map(({ id, label, description, icon: Icon }) => (
                            <Button
                              key={id}
                              type="button"
                              title={`${group.label} / ${label}：${description}`}
                              aria-label={`切换到${group.label}的${label}`}
                              size="sm"
                              variant={activeModuleId === id ? "default" : "outline"}
                              className="h-8 shrink-0 gap-1.5 px-3 text-xs"
                              onClick={() => setActiveModuleId(id)}
                            >
                              <Icon className="size-3.5" />
                              {label}
                            </Button>
                          ))}
                      </div>
                    ))}
                  </nav>

                  <div className="mx-auto w-full max-w-7xl">{renderActiveModule()}</div>
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
