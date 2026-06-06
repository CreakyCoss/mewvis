import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agentAvatarOptions } from "@/assets/agent-avatars";
import type { LlmProvider, ProviderModel } from "@/ai/llm/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { readWorkspaceFile } from "@/features/workspace-chat/api";
import type { WorkspaceFileEntry } from "@/features/workspace-chat/types";
import {
  getActiveReferenceToken,
  quoteReferencePath,
  resolveFileReferenceMatches,
  summarizeReferenceMatches,
} from "@/features/workspace-chat/utils/references";
import type { Workspace } from "@/features/workspaces/types";
import {
  createTavernCharacter,
  createTavernMessage,
  createTavernRoom,
  loadTavernState,
  saveTavernState,
} from "../storage";
import type {
  TavernCharacter,
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
  TavernState,
} from "../types";
import { runTavernReply } from "../runtime/tavern-runner";
import { uniqueFilesByPath } from "../utils";
import { TavernComposer } from "./tavern-composer";
import { TavernHeader } from "./tavern-header";
import { TavernMessageRow } from "./tavern-message-row";
import { TavernRoomSidebar } from "./tavern-room-sidebar";
import { TavernSidePanel } from "./tavern-side-panel";

const REFERENCE_SUGGESTION_LIMIT = 8;

type TavernPageProps = {
  workspace: Workspace;
  files: WorkspaceFileEntry[];
  provider: LlmProvider | null;
  model: ProviderModel | null;
  runtimeAgentId: string;
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

export const TavernPage = ({
  workspace,
  files,
  provider,
  model,
  runtimeAgentId,
}: TavernPageProps) => {
  const [state, setState] = useState<TavernState>(() => loadTavernState(workspace.id));
  const [draft, setDraft] = useState("");
  const [draftCursor, setDraftCursor] = useState(0);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isAddingCharacter, setIsAddingCharacter] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterDescription, setNewCharacterDescription] = useState("");
  const [newCharacterStyle, setNewCharacterStyle] = useState("");
  const [newCharacterAvatar, setNewCharacterAvatar] = useState(
    agentAvatarOptions[1]?.id ?? agentAvatarOptions[0]?.id ?? "",
  );
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
    setIsSending(false);
  }, [workspace.id]);

  useEffect(() => {
    if (state.rooms.some((room) => room.workspaceId === workspace.id)) {
      saveTavernState(workspace.id, state);
    }
  }, [state, workspace.id]);

  const activeRoom = useMemo(() => (
    state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null
  ), [state.activeRoomId, state.rooms]);
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
      ?? state.characters[0]
      ?? null
  ), [activeRoom?.activeCharacterId, roomCharacters, state.characters]);
  const availableCharacters = useMemo(() => {
    if (!activeRoom) {
      return [];
    }

    const roomCharacterIds = new Set(activeRoom.characterIds);
    return state.characters.filter((character) => !roomCharacterIds.has(character.id));
  }, [activeRoom, state.characters]);

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

  const handleInviteCharacter = useCallback((characterId: string) => {
    if (!activeRoom) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== activeRoom.id || room.characterIds.includes(characterId)) {
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
  }, [activeRoom]);

  const handleAddCharacter = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeRoom) {
      return;
    }

    const name = newCharacterName.trim();
    const description = newCharacterDescription.trim();
    const speakingStyle = newCharacterStyle.trim();
    if (!name || !description || !speakingStyle) {
      setError("请补全角色名称、设定和说话方式。");
      return;
    }

    const character = createTavernCharacter({
      name,
      avatar: newCharacterAvatar,
      description,
      speakingStyle,
    });
    setState((current) => ({
      ...current,
      characters: [...current.characters, character],
      rooms: current.rooms.map((room) =>
        room.id === activeRoom.id
          ? {
              ...room,
              characterIds: [...room.characterIds, character.id],
              activeCharacterId: character.id,
              updatedAt: Date.now(),
            }
          : room,
      ),
    }));
    setNewCharacterName("");
    setNewCharacterDescription("");
    setNewCharacterStyle("");
    setIsAddingCharacter(false);
    setError("");
  }, [
    activeRoom,
    newCharacterAvatar,
    newCharacterDescription,
    newCharacterName,
    newCharacterStyle,
  ]);

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

    if (!activeRoom || !activeCharacter) {
      setError("当前房间还没有可回应的角色。");
      return;
    }

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
    const replyMessage = createTavernMessage({
      roomId: activeRoom.id,
      role: "character",
      characterId: activeCharacter.id,
      content: "",
      status: "streaming",
    });
    const runtimeMessages = [...roomMessages, userMessage];

    setDraft("");
    setDraftCursor(0);
    appendMessagesToRoom(activeRoom.id, [userMessage, replyMessage]);

    let streamedText = "";
    try {
      const result = await runTavernReply({
        runtimeAgentId,
        provider,
        model,
        room: activeRoom,
        activeCharacter,
        characters: roomCharacters,
        messages: runtimeMessages,
        references,
        currentUserText: text,
        onTextDelta: (delta) => {
          streamedText += delta;
          patchMessage(replyMessage.id, {
            content: streamedText,
            status: "streaming",
          });
        },
      });
      const finalText = (result.text.trim() || streamedText.trim() || "（对方短暂沉默，杯沿映着灯光。）");
      patchMessage(replyMessage.id, {
        content: finalText,
        status: "done",
      });
    } catch (runError) {
      const message = getErrorMessage(runError);
      patchMessage(replyMessage.id, {
        content: `酒馆回应失败：${message}`,
        status: "error",
      });
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
    readReferencedFiles,
    referencedFilePreviews,
    roomCharacters,
    roomMessages,
    runtimeAgentId,
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

  return (
    <div className="flex h-full min-h-0 flex-1 bg-background text-foreground">
      <div className="grid h-full min-h-0 w-full grid-cols-1 lg:grid-cols-[228px_minmax(0,1fr)] xl:grid-cols-[228px_minmax(0,1fr)_324px]">
        <TavernRoomSidebar
          rooms={state.rooms}
          activeRoom={activeRoom}
          characterById={characterById}
          onCreateRoom={handleCreateRoom}
          onSelectRoom={(roomId) => setState((current) => ({
            ...current,
            activeRoomId: roomId,
          }))}
        />

        <main className="flex min-h-0 min-w-0 flex-col">
          <TavernHeader
            activeRoom={activeRoom}
            activeCharacter={activeCharacter}
            modelName={model?.modelName}
          />

          <ScrollArea className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_28%),linear-gradient(180deg,rgba(248,250,252,0.75),transparent_32%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.25),transparent_32%)]">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-5">
              {roomMessages.map((message) => (
                <TavernMessageRow
                  key={message.id}
                  message={message}
                  room={activeRoom}
                  character={message.characterId ? characterById.get(message.characterId) : null}
                />
              ))}
              <div ref={messageEndRef} />
            </div>
          </ScrollArea>

          <TavernComposer
            draft={draft}
            error={error}
            isSending={isSending}
            activeCharacter={activeCharacter}
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

        <TavernSidePanel
          activeRoom={activeRoom}
          activeCharacter={activeCharacter}
          roomCharacters={roomCharacters}
          availableCharacters={availableCharacters}
          isAddingCharacter={isAddingCharacter}
          newCharacterName={newCharacterName}
          newCharacterDescription={newCharacterDescription}
          newCharacterStyle={newCharacterStyle}
          newCharacterAvatar={newCharacterAvatar}
          onPatchRoom={patchRoom}
          onToggleAddingCharacter={() => setIsAddingCharacter((current) => !current)}
          onAddCharacter={handleAddCharacter}
          onNewCharacterNameChange={setNewCharacterName}
          onNewCharacterDescriptionChange={setNewCharacterDescription}
          onNewCharacterStyleChange={setNewCharacterStyle}
          onNewCharacterAvatarChange={setNewCharacterAvatar}
          onInviteCharacter={handleInviteCharacter}
        />
      </div>
    </div>
  );
};
