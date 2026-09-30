import { Info, Loader2 } from "lucide-react";
import type { Ref } from "react";
import { useCallback, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { ApplicationForm } from "@/platform/form";
import { Button } from "design-system/components/ui/button";
import { Dialog, DialogContent } from "design-system/components/ui/dialog";
import { cn } from "design-system/lib/utils";
import type { StoryLibraryItem } from "../../storage";
import { Header } from "./header";
import type { TavernRoomConfig } from "./model";
import { BasicSection } from "./modules/basic";
import { PromptSection } from "./modules/prompt";
import { SettingsSection } from "./modules/settings";
import { TavernSettingsPreview } from "./preview";
import {
  loadOrCreateStoryTavernConfig,
  saveStoryTavernConfig,
} from "./storage";
import { cloneTavernRoom, prepareTavernRoomForSave } from "./utils";
import "./compact.css";

export type TavernManageHandle = {
  close: () => void;
  open: (item: Pick<StoryLibraryItem, "id" | "workspace">) => void;
};
const editorModules = [
  { id: "basic", label: "基础与场景" },
  { id: "prompt", label: "呈现与叙事" },
  { id: "settings", label: "互动与调度" },
] as const;
type EditorModuleId = (typeof editorModules)[number]["id"];

export const TavernManageContent = ({
  bind,
}: {
  bind: Ref<TavernManageHandle>;
}) => {
  const [item, setItem] = useState<Pick<
    StoryLibraryItem,
    "id" | "workspace"
  > | null>(null);
  const [data, setData] = useState<TavernRoomConfig | null>(null);
  const [savedData, setSavedData] = useState<TavernRoomConfig | null>(null);
  const [activeModuleId, setActiveModuleId] = useState<EditorModuleId>("basic");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const openRequestIdRef = useRef(0);
  const savingRef = useRef(false);

  const close = useCallback(() => {
    if (savingRef.current) return;
    openRequestIdRef.current += 1;
    setItem(null);
    // Keep the current frame during the dialog's exit animation; open reloads a fresh draft.
  }, []);
  const open = useCallback(
    (nextItem: Pick<StoryLibraryItem, "id" | "workspace">) => {
      if (savingRef.current) return;
      const requestId = ++openRequestIdRef.current;
      setItem(nextItem);
      setData(null);
      setSavedData(null);
      setActiveModuleId("basic");
      setIsLoading(true);
      setLoadError("");
      setSaveError("");
      void loadOrCreateStoryTavernConfig(nextItem)
        .then((config) => {
          if (requestId !== openRequestIdRef.current) return;
          setData(cloneTavernRoom(config));
          setSavedData(cloneTavernRoom(config));
        })
        .catch((error) => {
          if (requestId !== openRequestIdRef.current) return;
          console.error("Failed to load story tavern config", error);
          setLoadError(
            error instanceof Error ? error.message : "酒馆设置加载失败。",
          );
        })
        .finally(() => {
          if (requestId === openRequestIdRef.current) setIsLoading(false);
        });
    },
    [],
  );
  useImperativeHandle(bind, () => ({ close, open }), [close, open]);

  const hasChanges = Boolean(
    data && savedData && JSON.stringify(data) !== JSON.stringify(savedData),
  );
  const onChange = (patch: Partial<TavernRoomConfig>) => {
    setSaveError("");
    setData((current) => (current ? { ...current, ...patch } : current));
  };
  const save = async () => {
    if (!item || !data || !hasChanges || savingRef.current) return;
    const requestId = openRequestIdRef.current;
    const nextRoom = prepareTavernRoomForSave(data);
    savingRef.current = true;
    setIsSaving(true);
    setSaveError("");
    try {
      await saveStoryTavernConfig(item.workspace, nextRoom);
      if (requestId !== openRequestIdRef.current) return;
      setData(cloneTavernRoom(nextRoom));
      setSavedData(cloneTavernRoom(nextRoom));
      toast.success("酒馆设置已保存。");
    } catch (error) {
      console.error("Failed to save story tavern config", error);
      if (requestId === openRequestIdRef.current)
        setSaveError("保存失败，修改仍保留在当前页面，请重试。");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(nextOpen) => !nextOpen && close()}
    >
      <DialogContent
        showCloseButton={false}
        className="tavern-settings-dialog !flex !h-[min(800px,calc(100dvh-24px))] !w-[min(1120px,calc(100vw-24px))] !max-w-none flex-col gap-0 overflow-hidden bg-card p-0"
      >
        <Header
          title={data?.title ?? item?.workspace.name ?? ""}
          onClose={close}
          disabled={isSaving}
        />
        {isLoading || !data ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted-foreground">
            {isLoading ? (
              <>
                <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
                <p>正在加载酒馆设置…</p>
              </>
            ) : (
              <>
                <p role="alert">{loadError || "当前酒馆设置不可用。"}</p>
                {item && <Button onClick={() => open(item)}>重试</Button>}
              </>
            )}
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="酒馆设置分类"
              className="flex shrink-0 gap-2 overflow-x-auto border-b px-4 sm:gap-5 sm:px-[var(--tavern-content-padding,1.5rem)]"
            >
              {editorModules.map(({ id, label }, index) => (
                <button
                  key={id}
                  id={`tavern-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeModuleId === id}
                  aria-controls={`tavern-panel-${id}`}
                  tabIndex={activeModuleId === id ? 0 : -1}
                  disabled={isSaving}
                  onClick={() => setActiveModuleId(id)}
                  onKeyDown={(event) => {
                    let nextIndex = index;
                    if (event.key === "ArrowRight")
                      nextIndex = (index + 1) % editorModules.length;
                    else if (event.key === "ArrowLeft")
                      nextIndex =
                        (index + editorModules.length - 1) %
                        editorModules.length;
                    else if (event.key === "Home") nextIndex = 0;
                    else if (event.key === "End")
                      nextIndex = editorModules.length - 1;
                    else return;
                    event.preventDefault();
                    const nextId = editorModules[nextIndex].id;
                    setActiveModuleId(nextId);
                    document.getElementById(`tavern-tab-${nextId}`)?.focus();
                  }}
                  className={cn(
                    "shrink-0 border-b-2 border-transparent px-3 py-[var(--tavern-tab-padding-y,0.875rem)] text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring disabled:opacity-50",
                    activeModuleId === id && "border-primary text-primary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <ApplicationForm
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div
                key={activeModuleId}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                <div className="grid min-h-full gap-6 p-4 sm:p-[var(--tavern-content-padding,1.5rem)] sm:py-[var(--tavern-content-padding-y,1.5rem)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2.15fr)]">
                  <fieldset disabled={isSaving} className="min-w-0">
                    <div
                      id={`tavern-panel-${activeModuleId}`}
                      role="tabpanel"
                      aria-labelledby={`tavern-tab-${activeModuleId}`}
                      tabIndex={0}
                      className="outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      {activeModuleId === "basic" && (
                        <BasicSection data={data} onChange={onChange} />
                      )}
                      {activeModuleId === "prompt" && (
                        <PromptSection data={data} onChange={onChange} />
                      )}
                      {activeModuleId === "settings" && (
                        <SettingsSection
                          data={data}
                          onChange={onChange}
                        />
                      )}
                    </div>
                  </fieldset>
                  <TavernSettingsPreview data={data} />
                </div>
              </div>
              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-4 py-[var(--tavern-footer-padding-y,1rem)] sm:px-[var(--tavern-content-padding,1.5rem)]">
                <p
                  role={saveError ? "alert" : "status"}
                  className={cn(
                    "flex min-w-0 items-center gap-2 text-xs leading-5 text-muted-foreground",
                    saveError && "text-destructive",
                  )}
                >
                  <Info className="size-4 shrink-0" aria-hidden="true" />
                  {saveError ||
                    (hasChanges ? "修改后点击保存生效。" : "当前设置已保存。")}
                </p>
                <div className="ml-auto flex shrink-0 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-20"
                    disabled={isSaving}
                    onClick={close}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    className="min-w-24"
                    disabled={isSaving || !hasChanges}
                  >
                    {isSaving && (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    )}
                    {isSaving ? "正在保存…" : "保存设置"}
                  </Button>
                </div>
              </footer>
            </ApplicationForm>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
