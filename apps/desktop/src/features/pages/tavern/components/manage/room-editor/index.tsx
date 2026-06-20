import {
  Pencil,
  Sparkles,
} from "lucide-react";
import type { MouseEvent, Ref } from "react";
import { useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import { normalizeTavernPromptStyleId } from "../../../prompt-styles";
import {
  getActiveTavernScene,
  projectTavernSceneOntoRoom,
} from "../../../storage";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
  TavernRoomSettings,
} from "../../../types";
import type { TavernTextFieldAgentRequest } from "../../../runtime/field-polish-agent";
import { Header } from "./header";
import { BasicSection } from "./modules/basic";
import { CharactersSection } from "./modules/characters";
import { LoreSection } from "./modules/lore";
import { ProgressSection } from "./modules/progress";
import { ScenesSection } from "./modules/scenes";
import { SettingsSection } from "./modules/settings";
import { TimelineSection } from "./modules/timeline";
import type { TextFieldAgentActionRenderer } from "./modules/types";
import type { PendingDangerAction } from "./types";
import {
  cloneTavernRoom,
  getErrorMessage,
  prepareTavernRoomForSave,
} from "./utils";

export type RoomEditorHandle = (roomId: string) => void;

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
}: RoomEditorProps) => {
  const [data, setData] = useState<TavernRoom | null>(null);
  const [activeTextFieldAgentKey, setActiveTextFieldAgentKey] = useState("");
  const [textFieldAgentError, setTextFieldAgentError] = useState("");

  const openRoomEditor = (roomId: string) => {
    const room = rooms.find((item) => item.id === roomId);
    if (!room) {
      return;
    }

    onSelectRoom(roomId);
    setData(cloneTavernRoom(projectTavernSceneOntoRoom(room)));
    setActiveTextFieldAgentKey("");
    setTextFieldAgentError("");
  };

  useImperativeHandle(bind, () => openRoomEditor);

  const closeRoomEditor = () => {
    setData(null);
    setActiveTextFieldAgentKey("");
    setTextFieldAgentError("");
  };

  const onModuleSave = (patch: Partial<TavernRoom>) => {
    setData((current) => current ? { ...current, ...patch } : current);
  };

  const onSave = () => {
    if (!data) {
      return;
    }

    onPatchRoom(data.id, prepareTavernRoomForSave(data));
    closeRoomEditor();
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
            title: scene.title,
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
      timelineEvents: room.timelineEvents.map((event) => ({
        title: event.title,
        summary: event.summary,
      })),
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

  return (
    <div className="absolute inset-0 z-30 flex min-h-0 flex-col overflow-hidden bg-background">
      <Header
        data={data}
        characterById={characterById}
        messagesByRoomId={messagesByRoomId}
        textFieldAgentError={textFieldAgentError}
      />

      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-2 lg:px-6">
          <BasicSection
            data={data}
            onSave={onModuleSave}
            renderTextFieldAgentActions={renderTextFieldAgentActions}
          />
          <ScenesSection
            data={data}
            characterById={characterById}
            onSave={onModuleSave}
            onRequestDangerAction={onRequestDangerAction}
            renderTextFieldAgentActions={renderTextFieldAgentActions}
          />
          <SettingsSection
            data={data}
            globalRuntimeModel={globalRuntimeModel}
            onRegenerateDirectorProfile={onRegenerateDirectorProfile}
            onSave={onModuleSave}
          />
          <ProgressSection
            data={data}
            onSave={onModuleSave}
          />
          <CharactersSection
            data={data}
            globalRuntimeModel={globalRuntimeModel}
            onSave={onModuleSave}
            onRunTextFieldAgent={runCharacterTextFieldAgent}
          />
          <TimelineSection
            data={data}
            onSave={onModuleSave}
            onRequestDangerAction={onRequestDangerAction}
          />
          <LoreSection
            data={data}
            onSave={onModuleSave}
            onRequestDangerAction={onRequestDangerAction}
            renderTextFieldAgentActions={renderTextFieldAgentActions}
          />
        </div>
      </ScrollArea>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-5 py-3 lg:px-7">
        <Button
          type="button"
          variant="ghost"
          onClick={closeRoomEditor}
        >
          取消
        </Button>
        <Button
          type="button"
          onClick={onSave}
        >
          保存
        </Button>
      </footer>
    </div>
  );
};
