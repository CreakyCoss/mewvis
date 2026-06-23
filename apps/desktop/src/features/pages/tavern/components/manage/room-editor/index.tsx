import {
  Activity,
  BookOpen,
  Clapperboard,
  GitBranch,
  House,
  LogOut,
  Pencil,
  ScrollText,
  Settings2,
  Sparkles,
  UsersRound,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, Ref } from "react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import { cn } from "@/lib/utils";
import { normalizeTavernPromptStyleId } from "../../../prompt-styles";
import {
  getActiveTavernScene,
  getTavernSceneDisplayTitle,
  projectTavernSceneOntoRoom,
} from "../../../storage";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
  TavernRoomSettings,
} from "../../../types";
import type { TavernTextFieldAgentRequest } from "../../../runtime/assistants";
import { Header } from "./header";
import { BasicSection } from "./modules/basic";
import { CharactersSection } from "./modules/characters";
import { LoreSection } from "./modules/lore";
import { OverviewSection } from "./modules/overview";
import { PromptSection } from "./modules/prompt";
import { ProgressSection } from "./modules/progress";
import { ScenesSection } from "./modules/scenes";
import { ScenesEdit, type ScenesEditHandle } from "./modules/scenes/edit";
import { SettingsSection } from "./modules/settings";
import { StoryGraphSection } from "./modules/story-graph";
import type { TextFieldAgentActionRenderer } from "./modules/types";
import type { PendingDangerAction } from "./types";
import {
  cloneTavernRoom,
  getErrorMessage,
  getRoomCharacterById,
  prepareTavernRoomForSave,
} from "./utils";

export type RoomEditorHandle = (roomId: string) => void;

type EditorModuleId =
  | "overview"
  | "basic"
  | "prompt"
  | "characters"
  | "scenes"
  | "story-graph"
  | "lore"
  | "settings"
  | "progress";

type SceneEditRequest = {
  sceneId: string;
  requestId: number;
};

const editorModules: Array<{
  id: EditorModuleId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "overview",
    label: "总览",
    description: "核心故事资源概览",
    icon: House,
  },
  {
    id: "basic",
    label: "基础信息",
    description: "标题、称呼和故事目标",
    icon: Wine,
  },
  {
    id: "prompt",
    label: "提示词",
    description: "层级、呈现结构和写作规则",
    icon: ScrollText,
  },
  {
    id: "characters",
    label: "角色",
    description: "酒馆角色库",
    icon: UsersRound,
  },
  {
    id: "scenes",
    label: "场景",
    description: "场景内容和场景目标",
    icon: Clapperboard,
  },
  {
    id: "story-graph",
    label: "剧情结构",
    description: "节点和分支",
    icon: GitBranch,
  },
  {
    id: "lore",
    label: "世界书",
    description: "共享设定资料",
    icon: BookOpen,
  },
  {
    id: "settings",
    label: "运行设置",
    description: "模型和执行策略",
    icon: Settings2,
  },
  {
    id: "progress",
    label: "进度系统",
    description: "状态追踪和进度面板",
    icon: Activity,
  },
];

type RoomEditorProps = {
  bind: Ref<RoomEditorHandle>;
  rooms: TavernRoom[];
  activeRoom: TavernRoom;
  characterById: Map<string, TavernCharacter>;
  messagesByRoomId: Record<string, TavernMessage[]>;
  globalRuntimeModel: RuntimeModelOption | null;
  onSelectRoom: (roomId: string) => void;
  onPatchRoom: (roomId: string, patch: Partial<TavernRoom>) => void;
  onRunTextFieldAgent: (request: TavernTextFieldAgentRequest) => Promise<string>;
  onRegenerateDirectorProfile: (
    room: TavernRoom,
  ) => Promise<NonNullable<TavernRoomSettings["directorScheduling"]["profile"]>>;
  onRequestDangerAction: (action: PendingDangerAction) => void;
  onOpenRoom: (room: TavernRoom) => void;
};

export const RoomEditor = ({
  bind,
  rooms,
  activeRoom,
  characterById,
  messagesByRoomId,
  globalRuntimeModel,
  onSelectRoom,
  onPatchRoom,
  onRunTextFieldAgent,
  onRegenerateDirectorProfile,
  onRequestDangerAction,
  onOpenRoom,
}: RoomEditorProps) => {
  const [data, setData] = useState<TavernRoom | null>(null);
  const [activeTextFieldAgentKey, setActiveTextFieldAgentKey] = useState("");
  const [textFieldAgentError, setTextFieldAgentError] = useState("");
  const [activeModuleId, setActiveModuleId] = useState<EditorModuleId>("overview");
  const [sceneEditRequest, setSceneEditRequest] = useState<SceneEditRequest | null>(null);
  const sceneEditRef = useRef<ScenesEditHandle>(null);

  const openRoomEditor = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room) {
      return;
    }

    onSelectRoom(roomId);
    setData(cloneTavernRoom(projectTavernSceneOntoRoom(room)));
    setActiveModuleId("overview");
    setSceneEditRequest(null);
    setActiveTextFieldAgentKey("");
    setTextFieldAgentError("");
  };

  useImperativeHandle(bind, () => openRoomEditor);

  useEffect(() => {
    const sceneId = sceneEditRequest?.sceneId;
    if (!sceneId) {
      return;
    }

    sceneEditRef.current?.(sceneId);
  }, [sceneEditRequest?.requestId, sceneEditRequest?.sceneId]);

  const closeRoomEditor = () => {
    setData(null);
    setSceneEditRequest(null);
    setActiveTextFieldAgentKey("");
    setTextFieldAgentError("");
  };

  const persistRoom = (room: TavernRoom) => {
    const nextRoom = prepareTavernRoomForSave(room);
    setData(cloneTavernRoom(projectTavernSceneOntoRoom(nextRoom)));
    onPatchRoom(nextRoom.id, nextRoom);
    return nextRoom;
  };

  const onModuleSave = (patch: Partial<TavernRoom>) => {
    if (!data) {
      return;
    }

    persistRoom({ ...data, ...patch });
  };

  const enterRoom = () => {
    if (!data) {
      return;
    }

    const nextRoom = persistRoom(data);
    onSelectRoom(nextRoom.id);
    onOpenRoom(nextRoom);
  };

  const buildTextFieldAgentContext = () => {
    const room = data ?? activeRoom;
    const scene = getActiveTavernScene(room);

    return {
      room: {
        title: room.title,
        promptStyleId: room.promptStyleId,
        storyOutline: room.storyOutline,
        storyGoal: room.storyGoal,
        userPersonaName: room.userPersonaName,
      },
      scene: scene
        ? {
            title: getTavernSceneDisplayTitle(room, scene.id),
            scene: scene.scene,
            sceneGoal: scene.sceneGoal,
            plot: scene.plot,
            storyDirection: scene.storyDirection,
            transition: scene.transition,
            memory: scene.memory,
          }
        : null,
      characters: (room.localCharacters ?? []).map((character) => ({
        name: character.name,
        description: character.description,
        speakingStyle: character.speakingStyle,
        writingStyle: character.writingStyle,
        replyStylePrompt: character.replyStylePrompt,
        goals: character.goals,
        relationships: character.relationships,
      })),
      lorebookEntries: room.lorebookEntries.map((entry) => ({
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
      })),
      storyGraph: room.storyGraph,
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
    const room = data ?? activeRoom;
    setActiveTextFieldAgentKey(`${fieldKey}:${mode}`);
    setTextFieldAgentError("");
    try {
      const text = await onRunTextFieldAgent({
        mode,
        fieldLabel,
        currentText,
        promptStyleId: normalizeTavernPromptStyleId(room.promptStyleId),
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

  const requestSceneEdit = (sceneId: string) => {
    setSceneEditRequest({
      sceneId,
      requestId: Date.now(),
    });
  };

  const runCharacterTextFieldAgent = async (
    request: TavernTextFieldAgentRequest,
  ) => {
    const room = data ?? activeRoom;
    return onRunTextFieldAgent({
      ...request,
      promptStyleId: normalizeTavernPromptStyleId(room.promptStyleId),
      context: {
        ...buildTextFieldAgentContext(),
        ...(request.context ?? {}),
      },
    });
  };

  if (!data) {
    return null;
  }

  const roomCharacterById = getRoomCharacterById(data, characterById);

  const renderActiveModule = () => {
    switch (activeModuleId) {
      case "overview":
        return (
          <OverviewSection
            data={data}
            characterById={characterById}
            onOpenModule={(moduleId) => setActiveModuleId(moduleId)}
          />
        );
      case "basic":
        return (
          <BasicSection
            data={data}
            onSave={onModuleSave}
            renderTextFieldAgentActions={renderTextFieldAgentActions}
          />
        );
      case "prompt":
        return (
          <PromptSection
            data={data}
            messages={messagesByRoomId[data.id] ?? []}
            onSave={onModuleSave}
          />
        );
      case "characters":
        return (
          <CharactersSection
            data={data}
            globalRuntimeModel={globalRuntimeModel}
            onSave={onModuleSave}
            onRunTextFieldAgent={runCharacterTextFieldAgent}
          />
        );
      case "scenes":
        return (
          <ScenesSection
            data={data}
            characterById={characterById}
            onSave={onModuleSave}
            onEditScene={requestSceneEdit}
            onRequestDangerAction={onRequestDangerAction}
          />
        );
      case "story-graph":
        return (
          <StoryGraphSection
            data={data}
            characterById={characterById}
            onSave={onModuleSave}
            onRequestDangerAction={onRequestDangerAction}
            onEditScene={requestSceneEdit}
          />
        );
      case "lore":
        return (
          <LoreSection
            data={data}
            onSave={onModuleSave}
            onRequestDangerAction={onRequestDangerAction}
            renderTextFieldAgentActions={renderTextFieldAgentActions}
          />
        );
      case "settings":
        return (
          <SettingsSection
            data={data}
            globalRuntimeModel={globalRuntimeModel}
            onRegenerateDirectorProfile={onRegenerateDirectorProfile}
            onSave={onModuleSave}
          />
        );
      case "progress":
        return (
          <ProgressSection
            data={data}
            onSave={onModuleSave}
          />
        );
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex min-h-0 overflow-hidden bg-background">
      <aside className="hidden w-20 shrink-0 flex-col border-r bg-muted/10 px-2 py-4 md:flex">
        <div className="mb-4 flex justify-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Wine className="size-5" />
          </span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1">
          {editorModules.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={`${label}：${description}`}
              aria-label={`切换到${label}`}
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
        <Header
          data={data}
          characterById={characterById}
          messagesByRoomId={messagesByRoomId}
          textFieldAgentError={textFieldAgentError}
          onEnterRoom={enterRoom}
        />

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
              {editorModules.map(({ id, label, description, icon: Icon }) => (
                <Button
                  key={id}
                  type="button"
                  title={`${label}：${description}`}
                  aria-label={`切换到${label}`}
                  size="sm"
                  variant={activeModuleId === id ? "default" : "outline"}
                  className="h-8 shrink-0 gap-1.5 px-3 text-xs"
                  onClick={() => setActiveModuleId(id)}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Button>
              ))}
            </nav>

            <div className="mx-auto w-full max-w-7xl">
              {renderActiveModule()}
            </div>
          </div>
        </ScrollArea>
      </div>

      <ScenesEdit
        bind={sceneEditRef}
        data={data}
        onSave={onModuleSave}
        renderTextFieldAgentActions={renderTextFieldAgentActions}
        roomCharacterById={roomCharacterById}
      />
    </div>
  );
};
