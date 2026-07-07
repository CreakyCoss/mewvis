import type { TavernRoomSessionState, TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { CSSProperties, FormEvent, KeyboardEvent, Ref } from "react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getActiveReferenceToken,
  loadContextResources,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "@/features/ai/components/context-tools";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
  useLlmSettingsStore,
} from "@/features/pages/settings/llm/store";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WindowDragRegion } from "@/components/window-drag-region";
import { listWorkspaceFiles, readWorkspaceFile, type WorkspaceFileEntry } from "@/features/pages/workspace/files-api";
import type { Workspace } from "@/features/pages/workspace/types";
import { cn } from "@/lib/utils";
import { getVisualPreset } from "../tavern/visual-presets";
import {
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
  switchTavernRoomScene,
  switchTavernRoomSceneInstance,
} from "../tavern/runtime/active-scene-runtime";
import { buildTavernMessageSegments, createTavernMessage, inferTavernMessageKind } from "../tavern/message";
import { getTavernSceneInstanceDisplayTitle } from "../tavern/runtime/scene-selectors";
import type { TavernRuntimeScope } from "../storage";
import { getTavernPresentationProfile } from "../tavern/prompt-registry/presentation-rules";
import { createTavernRenderableMessages } from "../tavern/message";
import { deleteTavernBridgeSession } from "../tavern/runtime/conversation";
import type { TavernMessage, TavernReferencedFile } from "../tavern/types";
import type { TavernReplyOption } from "@/features/pages/taverns/manage/model";
import { runTavernUserReplySuggestions } from "../tavern/runtime/assistants";
import { uniqueFilesByPath } from "../tavern/utils";
import { Composer } from "./composer";
import { TavernRoomProvider, type TavernRoomContextValue } from "./context";
import { Header } from "./header";
import { resolveTavernConversationRenderer } from "../tavern/message/renderers";
import { SceneBriefCard } from "./scene-brief-card";
import { SceneSelector } from "./scene-selector";
import { SidePanel, type SidePanelHandle } from "./side-panel";
import { loadTavernRoomSessionState, saveTavernRoomSessionState } from "./storage";
import { submitRoomTurn } from "./turn/submit";

const REFERENCE_SUGGESTION_LIMIT = 8;
const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";
const TAVERN_SCENE_DRIVE_AUTO_INTERVAL_MS = 900;
const TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS = 20;
const fullScreenDialogContentClassName =
  "!fixed !inset-0 !left-0 !top-0 !flex !h-screen !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden !rounded-none p-0 !ring-0";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "未知错误";
};

const getTavernSceneText = (value: string, fallback: string) => value.trim() || fallback;

const getSceneDriveAutoPauseReason = (room: TavernRoom) => {
  const hasUserTargetedInteraction = room.pendingInteractions.some(
    (interaction) =>
      interaction.status === "open" && interaction.requiresResponse && interaction.target.type === "user",
  );
  if (hasUserTargetedInteraction) {
    return "自动自推已暂停：有角色正在等待你的回应。";
  }

  return "";
};

export type TavernRoomOpenOptions = {
  workspace: Workspace;
  runtimeScope?: TavernRuntimeScope;
  room: TavernRoom;
  initialMessages?: TavernMessage[];
  sceneInstanceId?: string;
  onClose?: () => void;
};

export type TavernRoomHandle = (options: TavernRoomOpenOptions) => void;

type TavernRoomDialogProps = {
  bind: Ref<TavernRoomHandle>;
};

const EMPTY_WORKSPACE: Workspace = {
  id: "",
  name: "",
  description: null,
  path: "",
  isDefault: false,
  isPinned: false,
  order: 0,
  groupId: null,
  createdAt: 0,
  updatedAt: 0,
};

const createEmptyTavernSessionState = (): TavernRoomSessionState => ({
  room: null,
  messages: [],
});

const createTavernRoomInitialState = ({
  room,
  initialMessages = [],
  sceneInstanceId,
}: {
  room: TavernRoom;
  initialMessages?: TavernMessage[];
  sceneInstanceId?: string;
}) => {
  const nextRoom = sceneInstanceId
    ? switchTavernRoomSceneInstance(room, sceneInstanceId)
    : syncTavernRoomActiveScene(room);
  const messages = initialMessages.map((message) => ({
    ...message,
    roomId: message.roomId || nextRoom.id,
    status: message.status === "streaming" ? ("done" as const) : message.status,
  }));

  return {
    room: nextRoom,
    messages,
  } satisfies TavernRoomSessionState;
};

const getSessionStateRoom = (state: TavernRoomSessionState, roomId?: string) =>
  state.room && (!roomId || state.room.id === roomId) ? state.room : null;

const replaceSessionStateRoom = (state: TavernRoomSessionState, room: TavernRoom): TavernRoomSessionState => ({
  ...state,
  room,
});

export const TavernRoomDialog = ({ bind }: TavernRoomDialogProps) => {
  const [openOptions, setOpenOptions] = useState<TavernRoomOpenOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isTavernStateHydrated, setIsTavernStateHydrated] = useState(false);
  const [state, setState] = useState<TavernRoomSessionState>(() => createEmptyTavernSessionState());
  const workspace = openOptions?.workspace ?? EMPTY_WORKSPACE;
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const runtimeModel = runtimeModels[0] ?? null;
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [draftCursor, setDraftCursor] = useState(0);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingReplySuggestions, setIsGeneratingReplySuggestions] = useState(false);
  const [replySuggestions, setReplySuggestions] = useState<TavernReplyOption[]>([]);
  const [turnStatus, setTurnStatus] = useState("");
  const activeRoom = useMemo(() => {
    const stateRoom = getSessionStateRoom(state, openOptions?.room.id);
    const sourceRoom = stateRoom ?? openOptions?.room ?? null;
    return sourceRoom ? projectTavernSceneOntoRoom(sourceRoom) : null;
  }, [openOptions?.room, state.room]);
  const visualPreset = getVisualPreset(activeRoom?.scenePresetId);
  const characterById = useMemo(
    () => new Map((activeRoom?.localCharacters ?? []).map((character) => [character.id, character] as const)),
    [activeRoom?.localCharacters],
  );
  const roomCharacters = useMemo(
    () =>
      activeRoom
        ? activeRoom.characterIds
            .map((characterId) => characterById.get(characterId))
            .filter((character): character is NonNullable<typeof character> => Boolean(character))
        : [],
    [activeRoom, characterById],
  );
  const roomMessages = useMemo(() => {
    return activeRoom ? state.messages : [];
  }, [activeRoom, state.messages]);
  const activeCharacter =
    roomCharacters.find((character) => character.id === activeRoom?.activeCharacterId) ?? roomCharacters[0] ?? null;
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isSceneDriveAutoRunning, setIsSceneDriveAutoRunning] = useState(false);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const sceneDriveAutoTimerRef = useRef<number | null>(null);
  const sceneDriveAutoRunCountRef = useRef(0);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const sidePanelRef = useRef<SidePanelHandle | null>(null);
  const openRequestIdRef = useRef(0);

  const open = useCallback((options: TavernRoomOpenOptions) => {
    openRequestIdRef.current += 1;
    setOpenOptions(options);
    setState(createEmptyTavernSessionState());
    setIsOpen(true);
    setIsTavernStateHydrated(false);
    setDraft("");
    setDraftCursor(0);
    setError("");
    setIsSending(false);
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions([]);
    setTurnStatus("");
    setIsSidePanelOpen(false);
    setIsSceneDriveAutoRunning(false);
    sceneDriveAutoRunCountRef.current = 0;
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
  }, []);

  useImperativeHandle(bind, () => open, [bind, open]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!openOptions) {
      return;
    }

    let isCancelled = false;
    const requestId = openRequestIdRef.current;
    setIsTavernStateHydrated(false);

    const nextState = createTavernRoomInitialState({
      room: openOptions.room,
      initialMessages: openOptions.initialMessages,
      sceneInstanceId: openOptions.sceneInstanceId,
    });

    void loadTavernRoomSessionState(workspace.path, openOptions.runtimeScope, nextState)
      .then((sessionState) => {
        if (isCancelled || requestId !== openRequestIdRef.current) {
          return;
        }

        setState(sessionState ?? nextState);
        setIsTavernStateHydrated(true);
      })
      .catch((loadError) => {
        if (isCancelled || requestId !== openRequestIdRef.current) {
          return;
        }

        console.error("Failed to load tavern room session state", loadError);
        setState(
          createTavernRoomInitialState({
            room: openOptions.room,
            initialMessages: openOptions.initialMessages,
            sceneInstanceId: openOptions.sceneInstanceId,
          }),
        );
        setIsTavernStateHydrated(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [openOptions, workspace.path]);

  useEffect(() => {
    if (!openOptions || !isTavernStateHydrated) {
      return;
    }

    void saveTavernRoomSessionState(workspace.path, openOptions.runtimeScope, state).catch((saveError) => {
      console.error("Failed to save tavern room session state", saveError);
    });
  }, [isTavernStateHydrated, openOptions, state, workspace.path]);

  useEffect(() => {
    let isCancelled = false;

    void listWorkspaceFiles(workspace.path)
      .then((nextFiles) => {
        if (!isCancelled) {
          setFiles(nextFiles);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setFiles([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [workspace.path]);

  const patchRoom = useCallback<TavernRoomContextValue["patchRoom"]>(
    (roomId, patch) => {
      setState((current) => {
        const room = getSessionStateRoom(current, roomId);
        if (!room) {
          return current;
        }

        const patchedRoom = syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(room),
          ...patch,
          updatedAt: Date.now(),
        });

        return replaceSessionStateRoom(current, patchedRoom);
      });
    },
    [setState],
  );

  const appendMessagesToRoom = useCallback<TavernRoomContextValue["appendMessagesToRoom"]>(
    (roomId, messages) => {
      setState((current) => {
        const room = getSessionStateRoom(current, roomId);
        if (!room) {
          return current;
        }

        const nextMessages = [...current.messages, ...messages];
        const nextRoom = {
          ...room,
          updatedAt: Date.now(),
        };

        return {
          ...replaceSessionStateRoom(current, nextRoom),
          messages: nextMessages,
        };
      });
    },
    [setState],
  );

  const patchMessage = useCallback<TavernRoomContextValue["patchMessage"]>(
    (messageId, patch) => {
      setState((current) => {
        let didPatch = false;
        const nextMessages = current.messages.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          didPatch = true;
          const nextMessage = {
            ...message,
            ...patch,
          };
          const shouldRebuildSegments =
            !patch.segments &&
            (patch.content !== undefined ||
              patch.thought !== undefined ||
              patch.presentationProfileId !== undefined ||
              patch.role !== undefined ||
              patch.characterId !== undefined);
          return {
            ...nextMessage,
            kind:
              nextMessage.kind ??
              inferTavernMessageKind({
                role: nextMessage.role,
                presentationProfileId: nextMessage.presentationProfileId,
              }),
            segments: shouldRebuildSegments ? buildTavernMessageSegments(nextMessage) : nextMessage.segments,
          };
        });

        if (!didPatch) {
          return current;
        }

        return {
          ...current,
          messages: nextMessages,
        };
      });
    },
    [setState],
  );

  const removeMessage = useCallback<TavernRoomContextValue["removeMessage"]>(
    (messageId) => {
      setState((current) => {
        let didRemove = false;
        const nextMessages = current.messages.filter((message) => {
          const shouldKeep = message.id !== messageId;
          if (!shouldKeep) {
            didRemove = true;
          }
          return shouldKeep;
        });

        if (!didRemove) {
          return current;
        }
        const room = current.room;
        const nextRoom = room ? { ...room, updatedAt: Date.now() } : null;

        return {
          ...(nextRoom ? replaceSessionStateRoom(current, nextRoom) : current),
          messages: nextMessages,
        };
      });
    },
    [setState],
  );

  const reportError = useCallback((message: string) => {
    setError(message);
  }, []);

  const ctx = useMemo<TavernRoomContextValue>(
    () => ({
      workspace,
      runtimeModel,
      state,
      setState,
      draft,
      setDraft,
      draftCursor,
      setDraftCursor,
      error,
      setError,
      isSending,
      setIsSending,
      isGeneratingReplySuggestions,
      setIsGeneratingReplySuggestions,
      replySuggestions,
      setReplySuggestions,
      turnStatus,
      setTurnStatus,
      activeRoom,
      visualPreset,
      characterById,
      roomCharacters,
      roomMessages,
      activeCharacter,
      patchRoom,
      appendMessagesToRoom,
      patchMessage,
      removeMessage,
      reportError,
    }),
    [
      activeCharacter,
      activeRoom,
      appendMessagesToRoom,
      characterById,
      draft,
      draftCursor,
      error,
      isGeneratingReplySuggestions,
      isSending,
      patchMessage,
      patchRoom,
      removeMessage,
      replySuggestions,
      reportError,
      roomCharacters,
      roomMessages,
      runtimeModel,
      setState,
      state,
      turnStatus,
      visualPreset,
      workspace,
    ],
  );

  useEffect(() => {
    return () => {
      if (sceneDriveAutoTimerRef.current !== null) {
        window.clearTimeout(sceneDriveAutoTimerRef.current);
        sceneDriveAutoTimerRef.current = null;
      }
    };
  }, []);

  const renderableRoomMessages = useMemo(
    () =>
      activeRoom
        ? createTavernRenderableMessages({
            messages: roomMessages,
            characters: roomCharacters,
            userPersonaName: activeRoom.userPersonaName,
          })
        : [],
    [activeRoom, roomCharacters, roomMessages],
  );
  const latestMessage = renderableRoomMessages[renderableRoomMessages.length - 1] ?? null;
  const presentationProfile = getTavernPresentationProfile(activeRoom?.presentation?.profileId);
  const conversationRenderer = resolveTavernConversationRenderer(presentationProfile.renderStyle);
  const Conversation = conversationRenderer.Conversation;

  useEffect(() => {
    setIsGeneratingReplySuggestions(false);
    setReplySuggestions(activeRoom?.replyOptions ?? []);
    setIsSceneDriveAutoRunning(false);
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
    sceneDriveAutoRunCountRef.current = 0;
  }, [activeRoom?.id, activeRoom?.activeSceneInstanceId]);

  const scrollMessagesToBottom = useCallback(() => {
    const viewport = messageViewportRef.current;
    if (!viewport) {
      messageEndRef.current?.scrollIntoView({ block: "end" });
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "auto",
    });
  }, []);

  useLayoutEffect(() => {
    scrollMessagesToBottom();

    const firstFrame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
      window.requestAnimationFrame(scrollMessagesToBottom);
    });

    return () => window.cancelAnimationFrame(firstFrame);
  }, [
    activeRoom?.id,
    activeRoom?.activeSceneInstanceId,
    latestMessage?.content,
    latestMessage?.id,
    renderableRoomMessages.length,
    scrollMessagesToBottom,
    isOpen,
  ]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      scrollMessagesToBottom();
    });
    resizeObserver.observe(messageList);

    return () => resizeObserver.disconnect();
  }, [activeRoom?.id, activeRoom?.activeSceneInstanceId, scrollMessagesToBottom, isOpen]);

  const selectableFiles = useMemo(() => files.filter((file) => !file.isDirectory), [files]);
  const activeReferenceToken = useMemo(() => getActiveReferenceToken(draft, draftCursor), [draft, draftCursor]);
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
  const fileReferenceMatches = useMemo(() => resolveFileReferenceMatches(draft, files), [draft, files]);
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

  const selectRoomSceneInstance = useCallback((roomId: string, sceneInstanceId: string) => {
    setState((current) => {
      const targetRoom = getSessionStateRoom(current, roomId);
      if (!targetRoom) {
        return current;
      }

      const nextRoom = targetRoom.sceneInstances.some((instance) => instance.id === sceneInstanceId)
        ? switchTavernRoomSceneInstance(targetRoom, sceneInstanceId)
        : switchTavernRoomScene(targetRoom, sceneInstanceId);
      return replaceSessionStateRoom(current, nextRoom);
    });
    setReplySuggestions([]);
  }, []);

  const insertReference = useCallback(
    (file: WorkspaceFileEntry) => {
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
    },
    [activeReferenceToken, draftCursor],
  );

  const readReferencedFiles = useCallback(async (): Promise<TavernReferencedFile[]> => {
    const resources = await loadContextResources({
      references: referencedFilePreviews.map((file) => ({ path: file.path })),
      loadFile: async ({ path }) => {
        const workspaceFile = await readWorkspaceFile(workspace.path, path);
        return {
          path: workspaceFile.path,
          content: workspaceFile.content,
          updatedAt: workspaceFile.updatedAt,
        };
      },
    });
    return resources.references.map((file) => ({
      path: file.path,
      content: file.content,
    }));
  }, [referencedFilePreviews, workspace.path]);

  const handleGenerateReplySuggestions = useCallback(async () => {
    if (isSending || isGeneratingReplySuggestions) {
      return;
    }

    if (!runtimeModel) {
      setError("请先在设置中选择模型，再生成候选回复。");
      return;
    }

    if (!activeRoom) {
      setError("当前房间还没有可生成回复的场景。");
      return;
    }

    setError("");
    setIsGeneratingReplySuggestions(true);
    try {
      const suggestions = await runTavernUserReplySuggestions({
        workspacePath: workspace.path,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room: activeRoom,
        characters: roomCharacters,
        messages: roomMessages,
        currentDraft: draft,
      });
      setReplySuggestions(suggestions);
      patchRoom(activeRoom.id, {
        replyOptions: suggestions,
      });
      if (suggestions.length === 0) {
        setError("暂时没有生成可用候选回复，请再试一次。");
      }
    } catch (suggestionError) {
      setError(`生成候选回复失败：${getErrorMessage(suggestionError)}`);
    } finally {
      setIsGeneratingReplySuggestions(false);
    }
  }, [
    activeRoom,
    draft,
    isGeneratingReplySuggestions,
    isSending,
    patchRoom,
    roomCharacters,
    roomMessages,
    runtimeModel,
    workspace.path,
  ]);

  const handleFillReplySuggestion = useCallback(
    (suggestion: TavernReplyOption) => {
      const nextDraft = suggestion.text.trim();
      if (!nextDraft) {
        return;
      }

      setDraft(nextDraft);
      setDraftCursor(nextDraft.length);
      setReplySuggestions([]);
      if (activeRoom) {
        patchRoom(activeRoom.id, {
          replyOptions: [],
        });
      }
      window.setTimeout(() => {
        draftInputRef.current?.focus();
        draftInputRef.current?.setSelectionRange(nextDraft.length, nextDraft.length);
      }, 0);
    },
    [activeRoom, patchRoom],
  );

  const handleSubmit = useCallback(
    async (
      event?: FormEvent,
      submittedText?: string,
      selectedReplyOption?: TavernReplyOption,
      trigger?: { type: "user" | "scene_drive"; directive?: string },
    ) => {
      await submitRoomTurn({
        ctx,
        event,
        submittedText,
        selectedReplyOption,
        trigger,
        ambiguousFileReferences,
        readReferencedFiles,
        referencedFilePreviews,
        unresolvedFileReferences,
      });
    },
    [ambiguousFileReferences, ctx, readReferencedFiles, referencedFilePreviews, unresolvedFileReferences],
  );

  const handleSceneDriveTurn = useCallback(async () => {
    await handleSubmit(undefined, undefined, undefined, {
      type: "scene_drive",
      directive: draft,
    });
  }, [draft, handleSubmit]);

  const clearSceneDriveAutoTimer = useCallback(() => {
    if (sceneDriveAutoTimerRef.current !== null) {
      window.clearTimeout(sceneDriveAutoTimerRef.current);
      sceneDriveAutoTimerRef.current = null;
    }
  }, []);

  const clearActiveSceneMessages = useCallback(async () => {
    if (!activeRoom) {
      return;
    }

    const sceneTitle = getTavernSceneInstanceDisplayTitle(activeRoom, activeRoom.activeSceneInstanceId, "当前节点");
    const confirmed = window.confirm(
      `清空当前节点「${sceneTitle}」的对话记录？当前节点场景实例的消息会被替换为一条重置提示。`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteTavernBridgeSession({ workspacePath: workspace.path, room: activeRoom });
    } catch (error) {
      const message = getErrorMessage(error);
      setError(`无法清理当前节点底层会话：${message}`);
      toast.error("清空当前节点失败");
      return;
    }

    const resetMessage = createTavernMessage({
      roomId: activeRoom.id,
      role: "narrator",
      content: "这个节点的桌面被重新擦亮，旧谈话暂时收进抽屉。",
      status: "done",
    });

    setState((current) => {
      const currentRoom = getSessionStateRoom(current, activeRoom.id);
      const nextRoom = currentRoom
        ? syncTavernRoomActiveScene({
            ...currentRoom,
            updatedAt: Date.now(),
          })
        : null;

      return {
        ...(nextRoom ? replaceSessionStateRoom(current, nextRoom) : current),
        messages: [resetMessage],
      };
    });
    setReplySuggestions([]);
    setIsSceneDriveAutoRunning(false);
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
    setError("");
    toast.success("已清空当前节点对话");
  }, [activeRoom, clearSceneDriveAutoTimer, setState, workspace.path]);

  const stopSceneDriveAuto = useCallback(
    (statusText?: string) => {
      clearSceneDriveAutoTimer();
      sceneDriveAutoRunCountRef.current = 0;
      setIsSceneDriveAutoRunning(false);
      if (statusText) {
        setTurnStatus(statusText);
      }
    },
    [clearSceneDriveAutoTimer, setTurnStatus],
  );

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleToggleSceneDriveAuto = useCallback(() => {
    if (isSceneDriveAutoRunning) {
      stopSceneDriveAuto("自动自推已停止。");
      return;
    }

    if (isSending) {
      return;
    }

    if (!activeRoom) {
      setError("当前房间还没有可推进的场景。");
      return;
    }

    const pauseReason = getSceneDriveAutoPauseReason(activeRoom);
    if (pauseReason) {
      setTurnStatus(pauseReason);
      return;
    }

    setError("");
    setIsSceneDriveAutoRunning(true);
    sceneDriveAutoRunCountRef.current = 1;
    void handleSceneDriveTurn();
  }, [
    activeRoom,
    handleSceneDriveTurn,
    isSceneDriveAutoRunning,
    isSending,
    setError,
    setTurnStatus,
    stopSceneDriveAuto,
  ]);

  useEffect(() => {
    if (!isSceneDriveAutoRunning) {
      clearSceneDriveAutoTimer();
      return;
    }

    if (!isOpen || !activeRoom) {
      stopSceneDriveAuto();
      return;
    }

    if (error) {
      stopSceneDriveAuto();
      return;
    }

    if (isSending) {
      clearSceneDriveAutoTimer();
      return;
    }

    const latestRoomMessage = roomMessages[roomMessages.length - 1] ?? null;
    if (latestRoomMessage?.status === "streaming") {
      return;
    }

    if (latestRoomMessage?.status === "error") {
      stopSceneDriveAuto("自动自推已暂停：上一轮回应失败。");
      return;
    }

    const pauseReason = getSceneDriveAutoPauseReason(activeRoom);
    if (pauseReason) {
      stopSceneDriveAuto(pauseReason);
      return;
    }

    if (sceneDriveAutoRunCountRef.current >= TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS) {
      stopSceneDriveAuto(`自动自推已暂停：已连续推进 ${TAVERN_SCENE_DRIVE_AUTO_MAX_TURNS} 轮。`);
      return;
    }

    clearSceneDriveAutoTimer();
    sceneDriveAutoTimerRef.current = window.setTimeout(() => {
      sceneDriveAutoTimerRef.current = null;
      sceneDriveAutoRunCountRef.current += 1;
      void handleSceneDriveTurn();
    }, TAVERN_SCENE_DRIVE_AUTO_INTERVAL_MS);

    return clearSceneDriveAutoTimer;
  }, [
    activeRoom,
    clearSceneDriveAutoTimer,
    error,
    handleSceneDriveTurn,
    isSceneDriveAutoRunning,
    isSending,
    roomMessages,
    stopSceneDriveAuto,
    isOpen,
  ]);

  const closeRoomSurface = () => {
    sidePanelRef.current?.hide();
    setIsSceneDriveAutoRunning(false);
    clearSceneDriveAutoTimer();
    sceneDriveAutoRunCountRef.current = 0;
    setIsOpen(false);
    openOptions?.onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  if (!isTavernStateHydrated || !activeRoom) {
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
          <div className="rounded-md border bg-card px-5 py-4 text-sm text-muted-foreground">
            {!isTavernStateHydrated ? "正在加载酒馆房间" : "当前没有可进入的酒馆房间，请先从故事节点打开酒馆。"}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const backgroundStyle = {
    backgroundImage: `${visualPreset.tavern.backgroundOverlay}, url(${visualPreset.tavern.backgroundImage})`,
    backgroundPosition: visualPreset.tavern.backgroundPosition,
    backgroundRepeat: "no-repeat",
    backgroundSize: visualPreset.tavern.backgroundSize,
  } satisfies CSSProperties;
  const activeSceneTitle = getTavernSceneInstanceDisplayTitle(activeRoom, activeRoom.activeSceneInstanceId);
  const sceneInstanceOptions = activeRoom.sceneInstances.map((instance) => ({
    id: instance.id,
    label: getTavernSceneInstanceDisplayTitle(activeRoom, instance.id),
  }));
  const sceneDescription = getTavernSceneText(activeRoom.scene, "这个房间还没有场景描述。");
  const sceneMechanism = getTavernSceneText(
    activeRoom.scenePlot,
    getTavernSceneText(activeRoom.storyOutline, "剧情会根据角色行动与明确事件推进。"),
  );
  const sceneGoal = getTavernSceneText(
    activeRoom.sceneGoal,
    getTavernSceneText(activeRoom.storyGoal, "完成当前场景目标。"),
  );
  const sceneEnding = getTavernSceneText(activeRoom.sceneTransition, "达成目标或触发关键条件时结算。");
  const sceneBriefLines = Array.from(
    new Set(
      [
        activeRoom.storyOutline.trim() || sceneDescription,
        activeRoom.storyGoal.trim() || activeRoom.sceneGoal.trim(),
      ].filter(Boolean),
    ),
  );
  const sceneDirectionNote = activeRoom.sceneDirection.trim();
  const sceneBriefContent = {
    themeLabel: visualPreset.label,
    title: activeRoom.title,
    sceneTitle: activeSceneTitle,
    briefLines: sceneBriefLines,
    description: sceneDescription,
    mechanism: sceneMechanism,
    goal: sceneGoal,
    ending: sceneEnding,
    footerNote: sceneDirectionNote,
  };
  return (
    <TavernRoomProvider value={ctx}>
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
          <DialogTitle className="sr-only">{activeRoom.title ? `${activeRoom.title} · 酒馆` : "酒馆房间"}</DialogTitle>
          <WindowDragRegion className="h-10 shrink-0" />
          <div
            className={[
              "grid min-h-0 w-full flex-1 grid-cols-1",
              isSidePanelOpen ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "lg:grid-cols-1",
            ].join(" ")}
          >
            <main className="flex min-h-0 min-w-0 flex-col">
              <Header
                isSceneDriveAutoRunning={isSceneDriveAutoRunning}
                isSidePanelOpen={isSidePanelOpen}
                onBack={closeRoomSurface}
                onClearCurrentSceneMessages={() => {
                  void clearActiveSceneMessages();
                }}
                onRebuildRuntime={undefined}
                onSelectSceneInstance={(sceneInstanceId) => selectRoomSceneInstance(activeRoom.id, sceneInstanceId)}
                onSceneDriveTurn={() => {
                  void handleSceneDriveTurn();
                }}
                onToggleSceneDriveAuto={handleToggleSceneDriveAuto}
                onToggleSidePanel={() => {
                  sidePanelRef.current?.toggle();
                }}
              />

              <ScrollArea
                viewportRef={messageViewportRef}
                className={cn("min-h-0 flex-1", visualPreset.tavern.scrollArea)}
                style={backgroundStyle}
              >
                <div
                  ref={messageListRef}
                  className={cn(
                    "mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-5",
                    visualPreset.tavern.messageList,
                  )}
                >
                  <SceneBriefCard
                    className={cn("w-full self-center", isSidePanelOpen ? "max-w-[44rem]" : "max-w-[46rem]")}
                    visualPreset={visualPreset}
                    content={sceneBriefContent}
                    sceneSelector={
                      <SceneSelector
                        options={sceneInstanceOptions}
                        activeValue={activeRoom.activeSceneInstanceId}
                        label="节点："
                        onSelectScene={(sceneInstanceId) => selectRoomSceneInstance(activeRoom.id, sceneInstanceId)}
                      />
                    }
                  />
                  <Conversation
                    messages={renderableRoomMessages}
                    isSidePanelOpen={isSidePanelOpen}
                    messageEndRef={messageEndRef}
                  />
                </div>
              </ScrollArea>

              <Composer
                referencedFilePreviews={referencedFilePreviews}
                referenceSuggestions={referenceSuggestions}
                inputRef={draftInputRef}
                onInsertReference={insertReference}
                onGenerateReplySuggestions={handleGenerateReplySuggestions}
                onSelectReplySuggestion={(suggestion) => {
                  void handleSubmit(undefined, suggestion.text, suggestion);
                }}
                onFillReplySuggestion={handleFillReplySuggestion}
                onSubmit={(event) => {
                  void handleSubmit(event);
                }}
                onKeyDown={handleComposerKeyDown}
              />
            </main>

            <SidePanel bind={sidePanelRef} isOpen={isSidePanelOpen} onOpenChange={setIsSidePanelOpen} />
          </div>

        </DialogContent>
      </Dialog>
    </TavernRoomProvider>
  );
};
