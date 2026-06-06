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
import { parseTavernCharacterCard } from "../character-card";
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
import { prepareTavernRuntimeContext } from "../runtime/context";
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
  const [newCharacterGoals, setNewCharacterGoals] = useState("");
  const [newCharacterRelationships, setNewCharacterRelationships] = useState("");
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

  const importCharacterCard = useCallback((raw: string) => {
    if (!activeRoom) {
      return "当前房间不可用";
    }

    try {
      const card = parseTavernCharacterCard(raw);
      const character = createTavernCharacter(card);
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
      setError("");
      return null;
    } catch (caught) {
      return getErrorMessage(caught);
    }
  }, [activeRoom]);

  const removeCharacterFromActiveRoom = useCallback((characterId: string) => {
    if (!activeRoom) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== activeRoom.id) {
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
  }, [activeRoom]);

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

  const deleteActiveRoom = useCallback(() => {
    if (!activeRoom || state.rooms.length <= 1 || !window.confirm("删除当前酒馆房间？")) {
      return;
    }

    setState((current) => {
      const nextRooms = current.rooms.filter((room) => room.id !== activeRoom.id);
      const nextMessagesByRoom = { ...current.messagesByRoom };
      delete nextMessagesByRoom[activeRoom.id];

      return {
        ...current,
        activeRoomId: nextRooms[0]?.id ?? current.activeRoomId,
        rooms: nextRooms,
        messagesByRoom: nextMessagesByRoom,
      };
    });
  }, [activeRoom, state.rooms.length]);

  const clearActiveRoomAutoMemory = useCallback(() => {
    if (!activeRoom) {
      return;
    }

    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === activeRoom.id
          ? {
              ...room,
              autoMemory: "",
              autoMemoryUpdatedAt: undefined,
              summarizedMessageIds: [],
              updatedAt: Date.now(),
            }
          : room,
      ),
    }));
  }, [activeRoom]);

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
      goals: newCharacterGoals,
      relationships: newCharacterRelationships,
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
    setNewCharacterGoals("");
    setNewCharacterRelationships("");
    setIsAddingCharacter(false);
    setError("");
  }, [
    activeRoom,
    newCharacterAvatar,
    newCharacterDescription,
    newCharacterGoals,
    newCharacterRelationships,
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

    if (!activeRoom) {
      setError("当前房间还没有可回应的角色。");
      return;
    }

    const replyMode = activeRoom.replyMode ?? "active";
    const speakers = replyMode === "round"
      ? orderRoundCharacters(roomCharacters, activeCharacter?.id)
      : activeCharacter ? [activeCharacter] : [];
    if (speakers.length === 0) {
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
    let runtimeRoom = activeRoom;
    let runtimeMessages = [...roomMessages, userMessage];
    let activeReplyMessage: TavernMessage | null = null;
    let activeReplyText = "";

    try {
      const preparedContext = await prepareTavernRuntimeContext({
        runtimeAgentId,
        provider,
        model,
        room: activeRoom,
        messages: runtimeMessages,
        characters: roomCharacters,
        references,
        currentUserText: text,
      });
      runtimeRoom = preparedContext.room;
      runtimeMessages = preparedContext.messages;
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

      setDraft("");
      setDraftCursor(0);
      appendMessagesToRoom(activeRoom.id, [userMessage]);

      for (const [speakerIndex, speaker] of speakers.entries()) {
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
          : undefined;

        const result = await runTavernReply({
          runtimeAgentId,
          provider,
          model,
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
        activeReplyMessage = null;
        activeReplyText = "";
      }
    } catch (runError) {
      const message = getErrorMessage(runError);
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
                  isSending={isSending}
                  onUpdateMessage={updateMessageContent}
                  onDeleteMessage={deleteMessage}
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

        <TavernSidePanel
          activeRoom={activeRoom}
          activeCharacter={activeCharacter}
          roomCharacters={roomCharacters}
          availableCharacters={availableCharacters}
          isAddingCharacter={isAddingCharacter}
          isSending={isSending}
          canDeleteRoom={state.rooms.length > 1}
          newCharacterName={newCharacterName}
          newCharacterDescription={newCharacterDescription}
          newCharacterStyle={newCharacterStyle}
          newCharacterGoals={newCharacterGoals}
          newCharacterRelationships={newCharacterRelationships}
          newCharacterAvatar={newCharacterAvatar}
          onPatchRoom={patchRoom}
          onToggleAddingCharacter={() => setIsAddingCharacter((current) => !current)}
          onAddCharacter={handleAddCharacter}
          onNewCharacterNameChange={setNewCharacterName}
          onNewCharacterDescriptionChange={setNewCharacterDescription}
          onNewCharacterStyleChange={setNewCharacterStyle}
          onNewCharacterGoalsChange={setNewCharacterGoals}
          onNewCharacterRelationshipsChange={setNewCharacterRelationships}
          onNewCharacterAvatarChange={setNewCharacterAvatar}
          onInviteCharacter={handleInviteCharacter}
          onUpdateCharacter={updateCharacter}
          onImportCharacterCard={importCharacterCard}
          onRemoveCharacterFromRoom={removeCharacterFromActiveRoom}
          onClearRoomMessages={clearActiveRoomMessages}
          onClearAutoMemory={clearActiveRoomAutoMemory}
          onDeleteRoom={deleteActiveRoom}
        />
      </div>
    </div>
  );
};
