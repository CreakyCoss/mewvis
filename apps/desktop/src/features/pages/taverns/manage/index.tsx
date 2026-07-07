import { LogOut, Pencil, ScrollText, Settings2, Sparkles, Wine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, Ref } from "react";
import { useCallback, useImperativeHandle, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowDragRegion } from "@/components/window-drag-region";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import { cn } from "@/lib/utils";
import type { TavernTextFieldAgentRequest } from "../tavern/runtime/assistants/field-polish-agent";
import type { TavernRoom } from "@/features/pages/taverns/manage/model";
import { Header } from "./header";
import { BasicSection } from "./modules/basic";
import { PromptSection } from "./modules/prompt";
import type { TavernPromptWarningNavigationRequest } from "./modules/prompt/warning-navigation";
import { SettingsSection } from "./modules/settings";
import type { TextFieldAgentActionRenderer } from "./modules/types";
import { cloneTavernRoom, getErrorMessage, prepareTavernRoomForSave } from "./utils";

export type RoomEditorHandle = (room: TavernRoom) => void;

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
    label: "提示词",
    description: "酒馆呈现结构和写作规则",
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
    label: "酒馆运行配置",
    mobileLabel: "运行",
  },
];

const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none !bg-background p-0 text-foreground !ring-0";

type RoomEditorProps = {
  bind: Ref<RoomEditorHandle>;
  globalRuntimeModel: RuntimeModelOption | null;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onRunTextFieldAgent: (request: TavernTextFieldAgentRequest) => Promise<string>;
};

export const RoomEditor = ({ bind, globalRuntimeModel, onPatchRoom, onRunTextFieldAgent }: RoomEditorProps) => {
  const navigate = useNavigate();
  const [data, setData] = useState<TavernRoom | null>(null);
  const [activeTextFieldAgentKey, setActiveTextFieldAgentKey] = useState("");
  const [textFieldAgentError, setTextFieldAgentError] = useState("");
  const [activeModuleId, setActiveModuleId] = useState<EditorModuleId>("basic");

  const open = useCallback((room: TavernRoom) => {
    setData(cloneTavernRoom(room));
    setActiveModuleId("basic");
    setActiveTextFieldAgentKey("");
    setTextFieldAgentError("");
  }, []);

  useImperativeHandle(bind, () => open, [bind, open]);

  const closeRoomEditor = () => {
    setData(null);
    setActiveTextFieldAgentKey("");
    setTextFieldAgentError("");
  };

  const persistRoom = (room: TavernRoom) => {
    const nextRoom = prepareTavernRoomForSave(room);
    setData(cloneTavernRoom(nextRoom));
    onPatchRoom(nextRoom.id, nextRoom);
    return nextRoom;
  };

  const onModuleSave = (patch: Partial<TavernRoom>) => {
    if (!data) {
      return;
    }

    persistRoom({ ...data, ...patch });
  };

  const openStoryConfig = () => {
    navigate({
      pathname: "/stories",
      search: "",
    });
  };

  const buildTextFieldAgentContext = () => {
    if (!data) {
      throw new Error("Room editor is not open.");
    }

    return {
      room: {
        title: data.title,
        scenePresetId: data.scenePresetId,
        replyMode: data.replyMode,
        promptBlocks: data.prompt.blocks
          .filter((block) => block.enabled && block.text.trim())
          .map((block) => ({
            target: block.target,
            label: block.label,
            source: block.source,
            text: block.text,
          })),
      },
    };
  };

  const runTextFieldAgentForDraft = async ({
    mode,
    fieldKey,
    fieldLabel,
    currentText,
    applyText,
    context,
  }: {
    mode: "polish" | "inspire";
    fieldKey: string;
    fieldLabel: string;
    currentText: string;
    applyText: (text: string) => void;
    context?: Record<string, unknown>;
  }) => {
    setActiveTextFieldAgentKey(`${fieldKey}:${mode}`);
    setTextFieldAgentError("");
    try {
      const text = await onRunTextFieldAgent({
        mode,
        fieldLabel,
        currentText,
        context: {
          ...buildTextFieldAgentContext(),
          ...(context ?? {}),
        },
      });
      if (text.trim()) {
        applyText(text);
      }
    } catch (error) {
      setTextFieldAgentError(getErrorMessage(error));
    } finally {
      setActiveTextFieldAgentKey("");
    }
  };

  const renderTextFieldAgentActions: TextFieldAgentActionRenderer = ({
    fieldKey,
    fieldLabel,
    currentText,
    applyText,
    context,
  }) => {
    const isPolishing = activeTextFieldAgentKey === `${fieldKey}:polish`;
    const isInspiring = activeTextFieldAgentKey === `${fieldKey}:inspire`;
    const isBusy = Boolean(activeTextFieldAgentKey);
    const run = (mode: "polish" | "inspire") => (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      void runTextFieldAgentForDraft({
        mode,
        fieldKey,
        fieldLabel,
        currentText,
        applyText,
        context,
      });
    };

    return (
      <span className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={isBusy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={run("polish")}
        >
          <Pencil className="size-3" />
          {isPolishing ? "处理中" : "润色"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={isBusy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={run("inspire")}
        >
          <Sparkles className="size-3" />
          {isInspiring ? "处理中" : "灵感"}
        </Button>
      </span>
    );
  };

  const requestPromptWarningNavigation = (request: TavernPromptWarningNavigationRequest) => {
    if (request.target === "runtimeBasic") {
      setActiveModuleId("basic");
      return;
    }

    openStoryConfig();
  };

  const renderActiveModule = () => {
    if (!data) {
      return null;
    }

    switch (activeModuleId) {
      case "basic":
        return (
          <BasicSection data={data} onSave={onModuleSave} renderTextFieldAgentActions={renderTextFieldAgentActions} />
        );
      case "prompt":
        return (
          <PromptSection
            data={data}
            onSave={onModuleSave}
            onOpenWarningNavigation={requestPromptWarningNavigation}
            renderTextFieldAgentActions={renderTextFieldAgentActions}
          />
        );
      case "settings":
        return <SettingsSection data={data} globalRuntimeModel={globalRuntimeModel} onSave={onModuleSave} />;
    }
  };

  return (
    <Dialog open={Boolean(data)} onOpenChange={(open) => !open && closeRoomEditor()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/5 backdrop-blur-none"
        className={fullScreenDialogContentClassName}
      >
        <DialogTitle className="sr-only">{data?.title ? `${data.title} · 酒馆编辑` : "酒馆编辑"}</DialogTitle>
        <WindowDragRegion className="h-10 shrink-0" />
        {data ? (
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
                  title="退出编辑"
                  aria-label="退出编辑"
                  onClick={closeRoomEditor}
                >
                  <LogOut className="size-4 rotate-180" />
                </button>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <Header data={data} textFieldAgentError={textFieldAgentError} onOpenStoryConfig={openStoryConfig} />

              <ScrollArea className="min-h-0 flex-1 bg-muted/10">
                <div className="flex w-full flex-col gap-4 px-4 py-4 lg:px-6">
                  <nav className="flex gap-2 overflow-x-auto pb-1 md:hidden">
                    <Button
                      type="button"
                      title="退出编辑"
                      aria-label="退出编辑"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                      onClick={closeRoomEditor}
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
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
