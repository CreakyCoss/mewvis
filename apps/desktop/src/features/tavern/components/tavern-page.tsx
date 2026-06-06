import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agentAvatarOptions } from "@/assets/agent-avatars";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { readWorkspaceFile } from "@/features/workspace-chat/api";
import type { WorkspaceFileEntry } from "@/features/workspace-chat/types";
import { getVisualPreset, normalizeVisualPresetId } from "@/features/visual-presets";
import {
  getActiveReferenceToken,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "@/features/workspace-chat/utils/references";
import type { Workspace } from "@/features/workspaces/types";
import { cn } from "@/lib/utils";
import {
  createTavernAssetDraft,
  createTavernCharacter,
  createTavernLorebookEntry,
  createTavernMessage,
  createTavernRoom,
  createTavernTimelineEvent,
  DEFAULT_TAVERN_ROOM_SETTINGS,
  loadTavernState,
  saveTavernState,
} from "../storage";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
  TavernRoomSettings,
  TavernState,
} from "../types";
import { runTavernReply } from "../runtime/tavern-runner";
import { runTavernDirector } from "../runtime/director";
import { runTavernAssetExtraction } from "../runtime/asset-extractor";
import { prepareTavernRuntimeContext } from "../runtime/context";
import { resolveTavernCharacterModel } from "../runtime/model-selection";
import { uniqueFilesByPath } from "../utils";
import { TavernComposer } from "./tavern-composer";
import {
  TavernExecutionTrace,
  type TavernExecutionStep,
} from "./tavern-execution-trace";
import { TavernHeader } from "./tavern-header";
import { TavernManagementPage } from "./tavern-management-page";
import type { TavernCharacterFormValue } from "./tavern-character-form-dialog";
import { TavernMessageRow } from "./tavern-message-row";
import { TavernSidePanel } from "./tavern-side-panel";

const REFERENCE_SUGGESTION_LIMIT = 8;
const TAVERN_ROOM_EXPORT_SCHEMA = "novel-claw.tavern-room";

type TavernPageProps = {
  workspace: Workspace;
  files: WorkspaceFileEntry[];
  providers: LlmProvider[];
  provider: LlmProvider | null;
  model: ProviderModel | null;
  runtimeAgentId: string;
  onRoomImmersiveChange?: (isImmersive: boolean) => void;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const orderRoundCharacters = (
  characters: TavernCharacter[],
  activeCharacterId?: string,
) => {
  if (!activeCharacterId) {
    return characters;
  }

  const activeIndex = characters.findIndex((character) => character.id === activeCharacterId);
  if (activeIndex <= 0) {
    return characters;
  }

  return [
    ...characters.slice(activeIndex),
    ...characters.slice(0, activeIndex),
  ];
};

const invalidateRoomAutoMemory = (room: TavernRoom): TavernRoom => ({
  ...room,
  autoMemory: "",
  autoMemoryUpdatedAt: undefined,
  summarizedMessageIds: [],
  updatedAt: Date.now(),
});

const hasAssetDraftItems = (draft: TavernAssetDraft) =>
  draft.timelineEvents.some((event) => event.title.trim() && event.summary.trim()) ||
  draft.characterMemories.some((memory) => memory.characterId.trim() && memory.note.trim()) ||
  draft.lorebookEntries.some((entry) => entry.title.trim() && entry.content.trim());

type TavernRoomExportV1 = {
  schema: typeof TAVERN_ROOM_EXPORT_SCHEMA;
  version: 1;
  exportedAt: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
};

const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const sanitizeFileName = (value: string) =>
  value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "tavern-room";

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

const normalizeImportedRoomSettings = (value: unknown): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_TAVERN_ROOM_SETTINGS };
  }

  const candidate = value as Partial<TavernRoomSettings>;
  return {
    showExecutionTrace: Boolean(candidate.showExecutionTrace),
    autoAssetExtractionEnabled: Boolean(candidate.autoAssetExtractionEnabled),
    assetExtractionIntervalTurns: clampInteger(
      candidate.assetExtractionIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.assetExtractionIntervalTurns,
      1,
      10,
    ),
    maxAssetDrafts: clampInteger(
      candidate.maxAssetDrafts,
      DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts,
      1,
      20,
    ),
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
  };
};

export const TavernPage = ({
  workspace,
  files,
  providers,
  provider,
  model,
  runtimeAgentId,
  onRoomImmersiveChange,
}: TavernPageProps) => {
  const [state, setState] = useState<TavernState>(() => loadTavernState(workspace.id));
  const [draft, setDraft] = useState("");
  const [draftCursor, setDraftCursor] = useState(0);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"home" | "room">("home");
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isExtractingAssets, setIsExtractingAssets] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<TavernExecutionStep[]>([]);
  const [executionTraceAnchorMessageId, setExecutionTraceAnchorMessageId] = useState("");
  const workspaceIdRef = useRef(workspace.id);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (workspaceIdRef.current === workspace.id) {
      return;
    }

    workspaceIdRef.current = workspace.id;
    setState(loadTavernState(workspace.id));
    setDraft("");
    setDraftCursor(0);
    setError("");
    setViewMode("home");
    setIsSidePanelOpen(false);
    setIsSending(false);
    setIsExtractingAssets(false);
    setExecutionSteps([]);
    setExecutionTraceAnchorMessageId("");
  }, [workspace.id]);

  useEffect(() => {
    if (state.rooms.some((room) => room.workspaceId === workspace.id)) {
      saveTavernState(workspace.id, state);
    }
  }, [state, workspace.id]);

  useEffect(() => {
    onRoomImmersiveChange?.(viewMode === "room");

    return () => onRoomImmersiveChange?.(false);
  }, [onRoomImmersiveChange, viewMode]);

  const activeRoom = useMemo(() => (
    state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null
  ), [state.activeRoomId, state.rooms]);
  const visualPreset = useMemo(
    () => getVisualPreset(activeRoom?.scenePresetId),
    [activeRoom?.scenePresetId],
  );
  const roomMessages = useMemo(() => (
    activeRoom ? state.messagesByRoom[activeRoom.id] ?? [] : []
  ), [activeRoom, state.messagesByRoom]);
  const latestMessage = roomMessages[roomMessages.length - 1] ?? null;
  const characterById = useMemo(() => (
    new Map(state.characters.map((character) => [character.id, character]))
  ), [state.characters]);
  const roomCharacters = useMemo(() => {
    if (!activeRoom) {
      return [];
    }

    return activeRoom.characterIds
      .map((characterId) => characterById.get(characterId))
      .filter((character): character is TavernCharacter => Boolean(character));
  }, [activeRoom, characterById]);
  const activeCharacter = useMemo(() => (
    roomCharacters.find((character) => character.id === activeRoom?.activeCharacterId)
      ?? roomCharacters[0]
      ?? null
  ), [activeRoom?.activeCharacterId, roomCharacters]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeRoom?.id, latestMessage?.content, roomMessages.length]);

  const selectableFiles = useMemo(() => files.filter((file) => !file.isDirectory), [files]);
  const activeReferenceToken = useMemo(
    () => getActiveReferenceToken(draft, draftCursor),
    [draft, draftCursor],
  );
  const referenceSuggestions = useMemo(() => {
    if (!activeReferenceToken) {
      return [];
    }

    const query = activeReferenceToken.query.toLowerCase();
    return selectableFiles
      .filter((file) => {
        if (!query) {
          return true;
        }

        const path = file.path.toLowerCase();
        const name = file.name.toLowerCase();
        return path.includes(query) || name.includes(query);
      })
      .slice(0, REFERENCE_SUGGESTION_LIMIT);
  }, [activeReferenceToken, selectableFiles]);
  const fileReferenceMatches = useMemo(
    () => resolveFileReferenceMatches(draft, files),
    [draft, files],
  );
  const referencedFilePreviews = useMemo(
    () => uniqueFilesByPath(summarizeReferenceMatches(fileReferenceMatches)),
    [fileReferenceMatches],
  );
  const unresolvedFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length === 0),
    [fileReferenceMatches],
  );
  const ambiguousFileReferences = useMemo(
    () => fileReferenceMatches.filter((match) => match.matches.length > 1),
    [fileReferenceMatches],
  );

  const resetExecutionTrace = useCallback((steps: TavernExecutionStep[]) => {
    setExecutionSteps(steps);
  }, []);

  const patchExecutionStep = useCallback((
    stepId: string,
    patch: Partial<Omit<TavernExecutionStep, "id">>,
  ) => {
    setExecutionSteps((current) => current.map((step) =>
      step.id === stepId ? { ...step, ...patch } : step
    ));
  }, []);

  const appendExecutionStep = useCallback((step: TavernExecutionStep) => {
    setExecutionSteps((current) => [...current, step]);
  }, []);

  const shouldAutoExtractAssets = useCallback((
    room: TavernRoom,
    messagesAfterUser: TavernMessage[],
  ) => {
    if (!room.settings.autoAssetExtractionEnabled) {
      return false;
    }

    if (room.assetDrafts.length >= room.settings.maxAssetDrafts) {
      return false;
    }

    const userTurnCount = messagesAfterUser.filter((message) => message.role === "user").length;
    return userTurnCount > 0 &&
      userTurnCount % room.settings.assetExtractionIntervalTurns === 0;
  }, []);

  const patchRoom = useCallback((roomId: string, patch: Partial<TavernRoom>) => {
    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              ...patch,
              updatedAt: Date.now(),
            }
          : room,
      ),
    }));
  }, []);

  const appendMessagesToRoom = useCallback((roomId: string, messages: TavernMessage[]) => {
    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === roomId ? { ...room, updatedAt: Date.now() } : room,
      ),
      messagesByRoom: {
        ...current.messagesByRoom,
        [roomId]: [
          ...(current.messagesByRoom[roomId] ?? []),
          ...messages,
        ],
      },
    }));
  }, []);

  const patchMessage = useCallback((messageId: string, patch: Partial<TavernMessage>) => {
    setState((current) => {
      let patchedRoomId = "";
      const nextMessagesByRoom = Object.fromEntries(
        Object.entries(current.messagesByRoom).map(([roomId, messages]) => {
          const nextMessages = messages.map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            patchedRoomId = roomId;
            return {
              ...message,
              ...patch,
            };
          });
          return [roomId, nextMessages];
        }),
      );

      if (!patchedRoomId) {
        return current;
      }

      return {
        ...current,
        messagesByRoom: nextMessagesByRoom,
      };
    });
  }, []);

  const updateMessageContent = useCallback((messageId: string, content: string) => {
    const nextContent = content.trim();
    if (!nextContent) {
      return;
    }

    setState((current) => {
      let updatedRoomId = "";
      const messagesByRoom = Object.fromEntries(
        Object.entries(current.messagesByRoom).map(([roomId, messages]) => {
          const nextMessages = messages.map((message) => {
            if (message.id !== messageId) {
              return message;
            }

            updatedRoomId = roomId;
            return {
              ...message,
              content: nextContent,
              status: message.status === "error" ? "done" : message.status,
            };
          });

          return [roomId, nextMessages];
        }),
      );

      if (!updatedRoomId) {
        return current;
      }

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === updatedRoomId ? invalidateRoomAutoMemory(room) : room,
        ),
        messagesByRoom,
      };
    });
  }, []);

  const deleteMessage = useCallback((messageId: string) => {
    if (!window.confirm("删除这条消息？")) {
      return;
    }

    setState((current) => {
      let updatedRoomId = "";
      const messagesByRoom = Object.fromEntries(
        Object.entries(current.messagesByRoom).map(([roomId, messages]) => {
          const nextMessages = messages.filter((message) => {
            if (message.id === messageId) {
              updatedRoomId = roomId;
              return false;
            }

            return true;
          });

          return [roomId, nextMessages];
        }),
      );

      if (!updatedRoomId) {
        return current;
      }

      return {
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === updatedRoomId ? invalidateRoomAutoMemory(room) : room,
        ),
        messagesByRoom,
      };
    });
  }, []);

  const updateCharacter = useCallback((
    characterId: string,
    patch: Partial<TavernCharacter>,
  ) => {
    setState((current) => ({
      ...current,
      characters: current.characters.map((character) =>
        character.id === characterId
          ? {
              ...character,
              ...patch,
              updatedAt: Date.now(),
            }
          : character,
      ),
    }));
    setError("");
  }, []);

  const createGlobalCharacter = useCallback((value: TavernCharacterFormValue) => {
    const character = createTavernCharacter(value);

    setState((current) => ({
      ...current,
      characters: [...current.characters, character],
    }));
    setError("");
  }, []);

  const deleteCharacter = useCallback((characterId: string) => {
    const character = state.characters.find((item) => item.id === characterId);
    if (!character || state.characters.length <= 1) {
      return;
    }

    const usedRoomCount = state.rooms.filter((room) => room.characterIds.includes(characterId)).length;
    const confirmMessage = usedRoomCount > 0
      ? `删除角色「${character.name}」？它会同时从 ${usedRoomCount} 个酒馆的入席角色中移除。`
      : `删除角色「${character.name}」？`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setState((current) => ({
      ...current,
      characters: current.characters.filter((item) => item.id !== characterId),
      rooms: current.rooms.map((room) => {
        if (
          !room.characterIds.includes(characterId) &&
          room.activeCharacterId !== characterId &&
          !(characterId in room.characterMemories)
        ) {
          return room;
        }

        const nextCharacterIds = room.characterIds.filter((id) => id !== characterId);
        const nextCharacterMemories = { ...room.characterMemories };
        delete nextCharacterMemories[characterId];

        return {
          ...room,
          characterIds: nextCharacterIds,
          activeCharacterId: room.activeCharacterId === characterId
            ? nextCharacterIds[0] ?? ""
            : room.activeCharacterId,
          characterMemories: nextCharacterMemories,
          updatedAt: Date.now(),
        };
      }),
    }));
    setError("");
  }, [state.characters, state.rooms]);

  const addCharacterToRoom = useCallback((roomId: string, characterId: string) => {
    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== roomId || room.characterIds.includes(characterId)) {
          return room;
        }

        return {
          ...room,
          characterIds: [...room.characterIds, characterId],
          activeCharacterId: room.activeCharacterId || characterId,
          updatedAt: Date.now(),
        };
      }),
    }));
  }, []);

  const removeCharacterFromRoom = useCallback((roomId: string, characterId: string) => {
    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== roomId) {
          return room;
        }

        const nextCharacterIds = room.characterIds.filter((id) => id !== characterId);
        return {
          ...room,
          characterIds: nextCharacterIds,
          activeCharacterId: room.activeCharacterId === characterId
            ? nextCharacterIds[0] ?? ""
            : room.activeCharacterId,
          updatedAt: Date.now(),
        };
      }),
    }));
  }, []);

  const clearActiveRoomMessages = useCallback(() => {
    if (!activeRoom || !window.confirm("清空当前房间的对话记录？")) {
      return;
    }

    const resetMessage = createTavernMessage({
      roomId: activeRoom.id,
      role: "narrator",
      content: "桌面被重新擦亮，旧谈话暂时收进抽屉。",
      status: "done",
    });
    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === activeRoom.id ? invalidateRoomAutoMemory(room) : room,
      ),
      messagesByRoom: {
        ...current.messagesByRoom,
        [activeRoom.id]: [resetMessage],
      },
    }));
  }, [activeRoom]);

  const deleteRoom = useCallback((roomId: string) => {
    if (state.rooms.length <= 1) {
      return;
    }

    setState((current) => {
      const nextRooms = current.rooms.filter((room) => room.id !== roomId);
      const nextMessagesByRoom = { ...current.messagesByRoom };
      delete nextMessagesByRoom[roomId];
      const activeRoomId = current.activeRoomId === roomId
        ? nextRooms[0]?.id ?? current.activeRoomId
        : current.activeRoomId;

      return {
        ...current,
        activeRoomId,
        rooms: nextRooms,
        messagesByRoom: nextMessagesByRoom,
      };
    });
    if (activeRoom?.id === roomId) {
      setIsSidePanelOpen(false);
      setViewMode("home");
    }
  }, [activeRoom?.id, state.rooms.length]);

  const applyAssetDraft = useCallback((draftId: string) => {
    if (!activeRoom) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== activeRoom.id) {
          return room;
        }

        const draft = room.assetDrafts.find((item) => item.id === draftId);
        if (!draft) {
          return room;
        }

        const timelineEvents = draft.timelineEvents.filter((event) =>
          event.title.trim() && event.summary.trim()
        );
        const memoryDrafts = draft.characterMemories.filter((memory) =>
          memory.characterId.trim() && memory.note.trim()
        );
        const lorebookEntries = draft.lorebookEntries.filter((entry) =>
          entry.title.trim() && entry.content.trim()
        );
        const characterMemories = { ...room.characterMemories };
        for (const memory of memoryDrafts) {
          const existing = characterMemories[memory.characterId]?.trim() ?? "";
          const nextNote = memory.note.trim();
          characterMemories[memory.characterId] = existing
            ? [existing, nextNote].join("\n")
            : nextNote;
        }

        return {
          ...room,
          characterMemories,
          timelineEvents: [
            ...room.timelineEvents,
            ...timelineEvents.map((event) => createTavernTimelineEvent(event)),
          ],
          lorebookEntries: [
            ...room.lorebookEntries,
            ...lorebookEntries.map((entry) => createTavernLorebookEntry(entry)),
          ],
          assetDrafts: room.assetDrafts.filter((item) => item.id !== draftId),
          updatedAt: Date.now(),
        };
      }),
    }));
  }, [activeRoom]);

  const deleteAssetDraft = useCallback((draftId: string) => {
    if (!activeRoom) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === activeRoom.id
          ? {
              ...room,
              assetDrafts: room.assetDrafts.filter((draft) => draft.id !== draftId),
              updatedAt: Date.now(),
            }
          : room,
      ),
    }));
  }, [activeRoom]);

  const exportActiveRoom = useCallback(() => {
    if (!activeRoom) {
      return;
    }

    const payload: TavernRoomExportV1 = {
      schema: TAVERN_ROOM_EXPORT_SCHEMA,
      version: 1,
      exportedAt: new Date().toISOString(),
      room: activeRoom,
      characters: roomCharacters,
      messages: roomMessages,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFileName(activeRoom.title)}.tavern-room.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [activeRoom, roomCharacters, roomMessages]);

  const importRoomExport = useCallback((raw: string) => {
    let parsed: TavernRoomExportV1;
    try {
      parsed = JSON.parse(raw) as TavernRoomExportV1;
    } catch {
      return "房间文件不是有效 JSON。";
    }

    if (
      parsed.schema !== TAVERN_ROOM_EXPORT_SCHEMA ||
      parsed.version !== 1 ||
      !parsed.room ||
      !Array.isArray(parsed.characters)
    ) {
      return "房间文件格式不受支持。";
    }

    const createdAt = Date.now();
    const roomId = createLocalId("room");
    const characterIdMap = new Map<string, string>();
    const importedCharacters = parsed.characters
      .flatMap((character) => {
        const name = typeof character.name === "string" ? character.name.trim() : "";
        const description = typeof character.description === "string" ? character.description.trim() : "";
        const speakingStyle = typeof character.speakingStyle === "string" ? character.speakingStyle.trim() : "";
        if (!character.id || !name || !description || !speakingStyle) {
          return [];
        }

        const nextId = createLocalId("character");
        characterIdMap.set(character.id, nextId);
        return [{
          id: nextId,
          name,
          avatar: character.avatar || agentAvatarOptions[0]?.id || "",
          description,
          speakingStyle,
          goals: character.goals?.trim() || undefined,
          relationships: character.relationships?.trim() || undefined,
          modelConfig: character.modelConfig,
          createdAt,
          updatedAt: createdAt,
        } satisfies TavernCharacter];
      });

    if (importedCharacters.length === 0) {
      return "房间文件里没有可导入的角色。";
    }

    const importedCharacterIds = parsed.room.characterIds
      .flatMap((characterId) => {
        const mappedId = characterIdMap.get(characterId);
        return mappedId ? [mappedId] : [];
      });
    const characterIds = importedCharacterIds.length > 0
      ? importedCharacterIds
      : importedCharacters.map((character) => character.id);
    const activeCharacterId = characterIdMap.get(parsed.room.activeCharacterId) ?? characterIds[0] ?? "";
    const characterMemories = Object.fromEntries(
      Object.entries(parsed.room.characterMemories ?? {})
        .flatMap(([characterId, memory]) => {
          const mappedId = characterIdMap.get(characterId);
          return mappedId && typeof memory === "string" && memory.trim()
            ? [[mappedId, memory.trim()]]
            : [];
        }),
    );
    const importedTimelineEvents = (parsed.room.timelineEvents ?? [])
      .flatMap((event) => (
        event.title?.trim() && event.summary?.trim()
          ? [createTavernTimelineEvent({
              title: event.title,
              summary: event.summary,
            })]
          : []
      ));
    const importedLorebookEntries = (parsed.room.lorebookEntries ?? [])
      .flatMap((entry) => (
        entry.title?.trim() && entry.content?.trim()
          ? [createTavernLorebookEntry({
              title: entry.title,
              content: entry.content,
              keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
              alwaysOn: Boolean(entry.alwaysOn),
            })]
          : []
      ));
    const importedAssetDrafts = (parsed.room.assetDrafts ?? [])
      .flatMap((draft) => {
        const assetDraft = createTavernAssetDraft({
          sourceMessageIds: [],
          timelineEvents: draft.timelineEvents,
          characterMemories: draft.characterMemories.flatMap((memory) => {
            const mappedId = characterIdMap.get(memory.characterId);
            return mappedId
              ? [{
                  characterId: mappedId,
                  note: memory.note,
                }]
              : [];
          }),
          lorebookEntries: draft.lorebookEntries,
        });
        return hasAssetDraftItems(assetDraft) ? [assetDraft] : [];
      });
    const title = parsed.room.title?.trim() || "导入酒馆";
    const importedRoom: TavernRoom = {
      id: roomId,
      workspaceId: workspace.id,
      title: `${title}（导入）`,
      scenePresetId: normalizeVisualPresetId(parsed.room.scenePresetId),
      scene: parsed.room.scene?.trim() || "一间刚被导入的酒馆房间。",
      sceneGoal: parsed.room.sceneGoal?.trim() || "",
      memory: parsed.room.memory?.trim() || "",
      autoMemory: parsed.room.autoMemory?.trim() || "",
      autoMemoryUpdatedAt: typeof parsed.room.autoMemoryUpdatedAt === "number"
        ? parsed.room.autoMemoryUpdatedAt
        : undefined,
      summarizedMessageIds: [],
      characterMemories,
      lorebookEntries: importedLorebookEntries,
      timelineEvents: importedTimelineEvents,
      assetDrafts: importedAssetDrafts.slice(0, DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts),
      characterIds,
      activeCharacterId,
      replyMode: parsed.room.replyMode === "round" || parsed.room.replyMode === "director"
        ? parsed.room.replyMode
        : "active",
      userPersonaName: parsed.room.userPersonaName?.trim() || "我",
      settings: normalizeImportedRoomSettings(parsed.room.settings),
      createdAt,
      updatedAt: createdAt,
    };
    const importedMessages = Array.isArray(parsed.messages)
      ? parsed.messages.flatMap((message) => {
          if (!message.content?.trim()) {
            return [];
          }

          if (message.role === "character") {
            const mappedCharacterId = message.characterId
              ? characterIdMap.get(message.characterId)
              : undefined;
            if (!mappedCharacterId) {
              return [];
            }

            return [createTavernMessage({
              roomId,
              role: "character",
              characterId: mappedCharacterId,
              content: message.content,
              status: "done",
              referencedFiles: message.referencedFiles,
            })];
          }

          return [createTavernMessage({
            roomId,
            role: message.role === "user" ? "user" : "narrator",
            content: message.content,
            status: "done",
            referencedFiles: message.referencedFiles,
          })];
        })
      : [];
    const messages = importedMessages.length > 0
      ? importedMessages
      : [
          createTavernMessage({
            roomId,
            role: "narrator",
            content: "这个房间从外部文件导入，灯光重新亮起。",
            status: "done",
          }),
        ];

    setState((current) => ({
      ...current,
      activeRoomId: roomId,
      rooms: [...current.rooms, importedRoom],
      characters: [...current.characters, ...importedCharacters],
      messagesByRoom: {
        ...current.messagesByRoom,
        [roomId]: messages,
      },
    }));
    setError("");
    return null;
  }, [workspace.id]);

  const handleCreateRoom = useCallback(() => {
    setState((current) => {
      const room = createTavernRoom(workspace.id, current.rooms.length + 1);
      const characterIds = current.characters
        .slice(0, Math.min(current.characters.length, 3))
        .map((character) => character.id);
      const nextRoom = {
        ...room,
        characterIds,
        activeCharacterId: characterIds[0] ?? "",
      };
      const openingMessage = createTavernMessage({
        roomId: nextRoom.id,
        role: "narrator",
        content: "新的桌边留出空位，灯光落在还没有写下的第一行。",
        status: "done",
      });

      return {
        ...current,
        activeRoomId: nextRoom.id,
        rooms: [...current.rooms, nextRoom],
        messagesByRoom: {
          ...current.messagesByRoom,
          [nextRoom.id]: [openingMessage],
        },
      };
    });
  }, [workspace.id]);

  const insertReference = useCallback((file: WorkspaceFileEntry) => {
    const reference = `${quoteReferencePath(file.path)} `;
    const start = activeReferenceToken?.start ?? draftCursor;
    const end = activeReferenceToken?.end ?? draftCursor;
    const nextCursor = start + reference.length;

    setDraft((current) => `${current.slice(0, start)}${reference}${current.slice(end)}`);
    setDraftCursor(nextCursor);
    window.setTimeout(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }, [activeReferenceToken, draftCursor]);

  const readReferencedFiles = useCallback(async (): Promise<TavernReferencedFile[]> => {
    return Promise.all(
      referencedFilePreviews.map(async (file) => {
        const workspaceFile = await readWorkspaceFile(workspace.path, file.path);
        return {
          path: file.path,
          content: workspaceFile.content,
        };
      }),
    );
  }, [referencedFilePreviews, workspace.path]);

  const extractRecentAssets = useCallback(async () => {
    if (isSending || isExtractingAssets) {
      return;
    }

    if (!provider || !model) {
      setError("请先在设置中选择模型，再整理剧情资产。");
      return;
    }

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (!activeRoom || roomCharacters.length === 0) {
      setError("当前房间还没有可整理的角色。");
      return;
    }

    if (activeRoom.assetDrafts.length >= activeRoom.settings.maxAssetDrafts) {
      setError("待确认草稿已达上限，请先应用或忽略一部分草稿。");
      return;
    }

    const availableMessages = roomMessages.filter((message) =>
      message.status !== "streaming" && message.status !== "error"
    );
    const contextMessages = availableMessages.slice(-30);
    const sourceMessages = availableMessages.slice(-12);
    if (sourceMessages.length === 0) {
      setError("当前房间还没有可整理的对话。");
      return;
    }

    setIsExtractingAssets(true);
    setError("");
    if (activeRoom.settings.showExecutionTrace) {
      setExecutionTraceAnchorMessageId(roomMessages.at(-1)?.id ?? "");
      resetExecutionTrace([{
        id: "manual-asset-extraction",
        label: "整理最近对话",
        detail: "从最近对话中提取待确认剧情资产。",
        status: "running",
      }]);
    }
    try {
      const extractedDraft = await runTavernAssetExtraction({
        runtimeAgentId,
        provider,
        model,
        room: activeRoom,
        characters: roomCharacters,
        messages: contextMessages,
        sourceMessages,
        references: [],
        currentUserText: "手动整理最近对话中值得沉淀的剧情资产。",
      });
      const assetDraft = createTavernAssetDraft(extractedDraft);
      if (!hasAssetDraftItems(assetDraft)) {
        patchExecutionStep("manual-asset-extraction", {
          status: "done",
          detail: "没有发现新的稳定剧情资产。",
        });
        setError("最近对话没有整理出新的剧情资产。");
        return;
      }

      setState((current) => ({
        ...current,
        rooms: current.rooms.map((room) =>
          room.id === activeRoom.id
            ? {
                ...room,
                assetDrafts: [...room.assetDrafts, assetDraft].slice(-room.settings.maxAssetDrafts),
                updatedAt: Date.now(),
              }
          : room,
        ),
      }));
      patchExecutionStep("manual-asset-extraction", {
        status: "done",
        detail: "已生成待确认草稿。",
      });
    } catch (assetError) {
      patchExecutionStep("manual-asset-extraction", {
        status: "error",
        detail: getErrorMessage(assetError),
      });
      setError(`剧情资产整理失败：${getErrorMessage(assetError)}`);
    } finally {
      setIsExtractingAssets(false);
    }
  }, [
    activeRoom,
    isExtractingAssets,
    isSending,
    model,
    patchExecutionStep,
    provider,
    resetExecutionTrace,
    roomCharacters,
    roomMessages,
    runtimeAgentId,
  ]);

  const handleSubmit = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isSending) {
      return;
    }

    if (!provider || !model) {
      setError("请先在设置中选择模型，再进入酒馆对话。");
      return;
    }

    if (!runtimeAgentId) {
      setError("请先选择可用的 Agent 运行配置。");
      return;
    }

    if (!activeRoom) {
      setError("当前房间还没有可回应的角色。");
      return;
    }

    const replyMode = activeRoom.replyMode ?? "active";
    const candidateSpeakers = replyMode === "round" || replyMode === "director"
      ? orderRoundCharacters(roomCharacters, activeCharacter?.id)
      : activeCharacter ? [activeCharacter] : [];
    if (candidateSpeakers.length === 0) {
      setError("当前房间还没有可回应的角色。");
      return;
    }
    const candidateSpeakerModels = candidateSpeakers.map((speaker) => ({
      speaker,
      resolvedModel: resolveTavernCharacterModel({
        character: speaker,
        providers,
        fallbackProvider: provider,
        fallbackModel: model,
      }),
    }));
    const missingModelSpeaker = candidateSpeakerModels.find((item) => !item.resolvedModel);
    if (missingModelSpeaker) {
      setError(`角色 ${missingModelSpeaker.speaker.name} 还没有可用模型。`);
      return;
    }
    let speakers = candidateSpeakers;
    let resolvedSpeakerModels = candidateSpeakerModels.map((item) => item.resolvedModel!);

    if (unresolvedFileReferences.length > 0) {
      setError(`未找到引用文件：${unresolvedFileReferences.map((match) => `@${match.token}`).join("、")}`);
      return;
    }

    if (ambiguousFileReferences.length > 0) {
      setError(`引用文件不唯一：${ambiguousFileReferences.map((match) => `@${match.token}`).join("、")}`);
      return;
    }

    setIsSending(true);
    setError("");

    let references: TavernReferencedFile[] = [];
    try {
      references = await readReferencedFiles();
    } catch (readError) {
      setError(`读取引用文件失败：${getErrorMessage(readError)}`);
      setIsSending(false);
      return;
    }

    const referencedFiles = referencedFilePreviews.map((file) => ({ path: file.path }));
    const userMessage = createTavernMessage({
      roomId: activeRoom.id,
      role: "user",
      content: text,
      status: "done",
      referencedFiles,
    });
    let runtimeRoom = activeRoom;
    let runtimeMessages = [...roomMessages, userMessage];
    const turnMessages: TavernMessage[] = [userMessage];
    const shouldRunAssetExtraction = shouldAutoExtractAssets(activeRoom, runtimeMessages);
    let activeReplyMessage: TavernMessage | null = null;
    let activeReplyText = "";

    try {
      if (activeRoom.settings.showExecutionTrace) {
        setExecutionTraceAnchorMessageId(userMessage.id);
        resetExecutionTrace([
          {
            id: "context",
            label: "整理上下文",
            detail: "检查上下文窗口、必要时压缩自动记忆。",
            status: "running",
          },
        ]);
      } else {
        setExecutionTraceAnchorMessageId("");
        resetExecutionTrace([]);
      }
      setDraft("");
      setDraftCursor(0);
      appendMessagesToRoom(activeRoom.id, [userMessage]);

      const preparedContext = await prepareTavernRuntimeContext({
        runtimeAgentId,
        provider,
        model,
        room: activeRoom,
        messages: runtimeMessages,
        characters: roomCharacters,
        references,
        currentUserText: text,
        replyModels: resolvedSpeakerModels.map((resolvedModel) => ({
          provider: resolvedModel.provider,
          model: resolvedModel.model,
        })),
      });
      runtimeRoom = preparedContext.room;
      runtimeMessages = preparedContext.messages;
      patchExecutionStep("context", {
        status: "done",
        detail: preparedContext.didCompress
          ? `已压缩 ${preparedContext.stats.summarizedMessageCount} 条旧消息。`
          : "最近上下文在预算内。",
      });
      if (preparedContext.didCompress) {
        setState((current) => ({
          ...current,
          rooms: current.rooms.map((room) =>
            room.id === runtimeRoom.id
              ? {
                  ...room,
                  autoMemory: runtimeRoom.autoMemory,
                  autoMemoryUpdatedAt: runtimeRoom.autoMemoryUpdatedAt,
                  summarizedMessageIds: runtimeRoom.summarizedMessageIds,
                  updatedAt: runtimeRoom.updatedAt,
                }
              : room,
          ),
        }));
      }
      if (preparedContext.warning) {
        setError(`自动记忆压缩失败，已使用最近上下文继续：${preparedContext.warning}`);
      }

      let directorReason = "";
      if (replyMode === "director") {
        appendExecutionStep({
          id: "director",
          label: "导演调度",
          detail: "根据场景、记忆、时间线决定本轮发言顺序。",
          status: "running",
        });
        const directorDecision = await runTavernDirector({
          runtimeAgentId,
          provider,
          model,
          room: runtimeRoom,
          characters: roomCharacters,
          messages: runtimeMessages,
          references,
          currentUserText: text,
          maxSpeakers: Math.min(
            activeRoom.settings.directorMaxSpeakers,
            Math.max(1, roomCharacters.length),
          ),
        });
        const characterById = new Map(roomCharacters.map((character) => [character.id, character]));
        const directedSpeakers = directorDecision.speakerIds
          .map((characterId) => characterById.get(characterId))
          .filter((character): character is TavernCharacter => Boolean(character));
        speakers = directedSpeakers.length > 0
          ? directedSpeakers
          : activeCharacter ? [activeCharacter] : roomCharacters.slice(0, 1);
        const directedSpeakerModels = speakers.map((speaker) => ({
          speaker,
          resolvedModel: resolveTavernCharacterModel({
            character: speaker,
            providers,
            fallbackProvider: provider,
            fallbackModel: model,
          }),
        }));
        const missingDirectedModel = directedSpeakerModels.find((item) => !item.resolvedModel);
        if (missingDirectedModel) {
          throw new Error(`角色 ${missingDirectedModel.speaker.name} 还没有可用模型。`);
        }
        resolvedSpeakerModels = directedSpeakerModels.map((item) => item.resolvedModel!);
        directorReason = directorDecision.reason ?? "";
        patchExecutionStep("director", {
          status: "done",
          detail: speakers.map((speaker) => speaker.name).join(" -> "),
        });

        const narratorText = directorDecision.narrator?.trim();
        if (narratorText) {
          const narratorMessage = createTavernMessage({
            roomId: activeRoom.id,
            role: "narrator",
            content: narratorText,
            status: "done",
          });
          appendMessagesToRoom(activeRoom.id, [narratorMessage]);
          runtimeMessages = [...runtimeMessages, narratorMessage];
          turnMessages.push(narratorMessage);
        }
      }

      for (const [speakerIndex, speaker] of speakers.entries()) {
        const speakerStepId = `speaker-${speaker.id}-${speakerIndex}`;
        appendExecutionStep({
          id: speakerStepId,
          label: `${speaker.name} 回复`,
          detail: `${speakerIndex + 1}/${speakers.length}`,
          status: "running",
        });
        const replyMessage = createTavernMessage({
          roomId: activeRoom.id,
          role: "character",
          characterId: speaker.id,
          content: "",
          status: "streaming",
        });
        activeReplyMessage = replyMessage;
        activeReplyText = "";
        appendMessagesToRoom(activeRoom.id, [replyMessage]);

        let streamedText = "";
        const turnInstruction = replyMode === "round"
          ? [
              `这是全员轮流回应的第 ${speakerIndex + 1}/${speakers.length} 位。`,
              speakerIndex === 0
                ? "你先回应用户，给后续角色留下可承接的信息。"
                : "前面角色已经回应，请承接他们的信息，不要重复复述。",
              "只输出你自己的回应，不要替其他角色总结。",
            ].join("\n")
          : replyMode === "director"
            ? [
                `导演调度选择你作为第 ${speakerIndex + 1}/${speakers.length} 位发言者。`,
                directorReason ? `导演意图：${directorReason}` : "",
                speakerIndex === 0
                  ? "回应用户输入，并顺着当前场景目标推进。"
                  : "前面角色已经回应，请承接他们的信息，不要重复复述。",
                "只输出你自己的回应，不要替其他角色总结。",
              ].filter(Boolean).join("\n")
            : undefined;

        const result = await runTavernReply({
          runtimeAgentId,
          provider: resolvedSpeakerModels[speakerIndex].provider,
          model: resolvedSpeakerModels[speakerIndex].model,
          room: runtimeRoom,
          activeCharacter: speaker,
          characters: roomCharacters,
          messages: runtimeMessages,
          references,
          currentUserText: text,
          turnInstruction,
          onTextDelta: (delta) => {
            streamedText += delta;
            activeReplyText = streamedText;
            patchMessage(replyMessage.id, {
              content: streamedText,
              status: "streaming",
            });
          },
        });
        const finalText = (result.text.trim() || streamedText.trim() || "（对方短暂沉默，杯沿映着灯光。）");
        const finalizedMessage: TavernMessage = {
          ...replyMessage,
          content: finalText,
          status: "done",
        };
        patchMessage(replyMessage.id, {
          content: finalText,
          status: "done",
        });
        runtimeMessages = [...runtimeMessages, finalizedMessage];
        turnMessages.push(finalizedMessage);
        patchExecutionStep(speakerStepId, {
          status: "done",
          detail: finalText.slice(0, 120),
        });
        activeReplyMessage = null;
        activeReplyText = "";
      }

      if (shouldRunAssetExtraction) {
        appendExecutionStep({
          id: "asset-extraction",
          label: "整理剧情资产",
          detail: "从本轮对话提取待确认草稿。",
          status: "running",
        });
        try {
          const extractedDraft = await runTavernAssetExtraction({
            runtimeAgentId,
            provider,
            model,
            room: runtimeRoom,
            characters: roomCharacters,
            messages: runtimeMessages,
            sourceMessages: turnMessages,
            references,
            currentUserText: text,
          });
          const assetDraft = createTavernAssetDraft(extractedDraft);
          if (hasAssetDraftItems(assetDraft)) {
            setState((current) => ({
              ...current,
              rooms: current.rooms.map((room) =>
                room.id === activeRoom.id
                  ? {
                      ...room,
                      assetDrafts: [...room.assetDrafts, assetDraft].slice(-room.settings.maxAssetDrafts),
                      updatedAt: Date.now(),
                    }
                  : room,
              ),
            }));
            patchExecutionStep("asset-extraction", {
              status: "done",
              detail: "已生成待确认草稿。",
            });
          } else {
            patchExecutionStep("asset-extraction", {
              status: "done",
              detail: "没有发现新的稳定剧情资产。",
            });
          }
        } catch (assetError) {
          patchExecutionStep("asset-extraction", {
            status: "error",
            detail: getErrorMessage(assetError),
          });
          setError(`剧情资产整理失败：${getErrorMessage(assetError)}`);
        }
      }
    } catch (runError) {
      const message = getErrorMessage(runError);
      setExecutionSteps((current) => current.map((step) =>
        step.status === "running" ? { ...step, status: "error", detail: message } : step
      ));
      if (activeReplyMessage) {
        patchMessage(activeReplyMessage.id, {
          content: activeReplyText.trim()
            ? `${activeReplyText}\n\n酒馆回应失败：${message}`
            : `酒馆回应失败：${message}`,
          status: "error",
        });
      } else {
        appendMessagesToRoom(activeRoom.id, [
          createTavernMessage({
            roomId: activeRoom.id,
            role: "narrator",
            content: `酒馆回应失败：${message}`,
            status: "error",
          }),
        ]);
      }
      setError(message);
    } finally {
      setIsSending(false);
    }
  }, [
    activeCharacter,
    activeRoom,
    ambiguousFileReferences,
    appendMessagesToRoom,
    draft,
    isSending,
    model,
    patchMessage,
    provider,
    providers,
    resetExecutionTrace,
    patchExecutionStep,
    appendExecutionStep,
    readReferencedFiles,
    referencedFilePreviews,
    roomCharacters,
    roomMessages,
    runtimeAgentId,
    shouldAutoExtractAssets,
    unresolvedFileReferences,
  ]);

  const handleComposerKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSubmit();
    }
  }, [handleSubmit]);

  if (!activeRoom) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background px-6">
        <div className="rounded-md border bg-card px-5 py-4 text-sm text-muted-foreground">
          酒馆初始化失败，请重新进入工作区。
        </div>
      </div>
    );
  }

  if (viewMode === "home") {
    return (
      <TavernManagementPage
        rooms={state.rooms}
        characters={state.characters}
        activeRoom={activeRoom}
        characterById={characterById}
        messagesByRoom={state.messagesByRoom}
        providers={providers}
        globalProvider={provider}
        globalModel={model}
        canDeleteRoom={state.rooms.length > 1}
        onCreateRoom={handleCreateRoom}
        onSelectRoom={(roomId) => setState((current) => ({
          ...current,
          activeRoomId: roomId,
        }))}
        onOpenRoom={(roomId) => {
          setState((current) => ({
            ...current,
            activeRoomId: roomId,
          }));
          setIsSidePanelOpen(false);
          setViewMode("room");
        }}
        onPatchRoom={patchRoom}
        onDeleteRoom={deleteRoom}
        onClearRoomMessages={clearActiveRoomMessages}
        onExportRoom={exportActiveRoom}
        onImportRoom={importRoomExport}
        onCreateCharacter={createGlobalCharacter}
        onUpdateCharacter={updateCharacter}
        onDeleteCharacter={deleteCharacter}
        onAddRoomCharacter={addCharacterToRoom}
        onRemoveRoomCharacter={removeCharacterFromRoom}
      />
    );
  }

  const shouldShowExecutionTrace = activeRoom.settings.showExecutionTrace && executionSteps.length > 0;
  const hasExecutionTraceAnchor = shouldShowExecutionTrace && roomMessages.some((message) =>
    message.id === executionTraceAnchorMessageId
  );
  const backgroundStyle = {
    backgroundImage: `${visualPreset.tavern.backgroundOverlay}, url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: visualPreset.tavern.backgroundSize,
  } satisfies CSSProperties;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 text-foreground",
        visualPreset.tavern.page,
      )}
    >
      <div
        className={[
          "grid h-full min-h-0 w-full grid-cols-1",
          isSidePanelOpen ? "xl:grid-cols-[minmax(0,1fr)_324px]" : "xl:grid-cols-1",
        ].join(" ")}
      >
        <main className="flex min-h-0 min-w-0 flex-col">
          <TavernHeader
            activeRoom={activeRoom}
            visualPreset={visualPreset}
            isSidePanelOpen={isSidePanelOpen}
            onBack={() => {
              setIsSidePanelOpen(false);
              setViewMode("home");
            }}
            onToggleSidePanel={() => setIsSidePanelOpen((current) => !current)}
          />

          <ScrollArea
            className={cn(
              "min-h-0 flex-1",
              visualPreset.tavern.scrollArea,
            )}
            style={backgroundStyle}
          >
            <div
              className={cn(
                "mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-5",
                visualPreset.tavern.messageList,
              )}
            >
              <section
                className={cn(
                  "rounded-md border px-4 py-3 sm:px-5",
                  visualPreset.tavern.sceneCard,
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span
                    className={cn(
                      "rounded-md px-2 py-1 text-xs",
                      visualPreset.tavern.sceneBadge,
                    )}
                  >
                    {visualPreset.label}
                  </span>
                  <span>{activeRoom.title}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-80">
                  {activeRoom.scene.trim() || "这个房间还没有场景描述。"}
                </p>
                {activeRoom.sceneGoal.trim() && (
                  <p className="mt-2 text-xs leading-5 opacity-65">
                    {activeRoom.sceneGoal}
                  </p>
                )}
              </section>
              {roomMessages.map((message) => (
                <Fragment key={message.id}>
                  <TavernMessageRow
                    message={message}
                    room={activeRoom}
                    visualPreset={visualPreset}
                    character={message.characterId ? characterById.get(message.characterId) : null}
                    isSending={isSending}
                    onUpdateMessage={updateMessageContent}
                    onDeleteMessage={deleteMessage}
                  />
                  {shouldShowExecutionTrace && message.id === executionTraceAnchorMessageId && (
                    <TavernExecutionTrace steps={executionSteps} />
                  )}
                </Fragment>
              ))}
              {shouldShowExecutionTrace && !hasExecutionTraceAnchor && (
                <TavernExecutionTrace steps={executionSteps} />
              )}
              <div ref={messageEndRef} />
            </div>
          </ScrollArea>

          <TavernComposer
            draft={draft}
            error={error}
            isSending={isSending}
            visualPreset={visualPreset}
            activeCharacter={activeCharacter}
            replyMode={activeRoom.replyMode ?? "active"}
            speakerCount={roomCharacters.length}
            referencedFilePreviews={referencedFilePreviews}
            referenceSuggestions={referenceSuggestions}
            inputRef={draftInputRef}
            onDraftChange={(value, cursor) => {
              setDraft(value);
              setDraftCursor(cursor);
            }}
            onCursorChange={setDraftCursor}
            onInsertReference={insertReference}
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
            onKeyDown={handleComposerKeyDown}
          />
        </main>

        {isSidePanelOpen && (
          <TavernSidePanel
            activeRoom={activeRoom}
            visualPreset={visualPreset}
            activeCharacter={activeCharacter}
            roomCharacters={roomCharacters}
            isSending={isSending}
            isExtractingAssets={isExtractingAssets}
            onPatchRoom={patchRoom}
            onApplyAssetDraft={applyAssetDraft}
            onDeleteAssetDraft={deleteAssetDraft}
            onExtractRecentAssets={extractRecentAssets}
          />
        )}
      </div>
    </div>
  );
};
