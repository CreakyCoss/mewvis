import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  requireRuntimeModelInput,
  type RuntimeModelOption,
  useLlmSettingsStore,
} from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";
import { projectTavernSceneOntoRoom, syncTavernRoomActiveScene } from "../../runtime/active-scene-runtime";
import { createTavernRoom } from "../../factories/manual-factories";
import { getTavernSystemPreset } from "../../system-preset-registry";
import { createTavernRoomFromSystemPreset } from "../../factories/system-preset-room";
import { createTavernMessage } from "../../message";
import { deleteTavernBridgeSessionsForRoom } from "../../runtime/conversation";
import { runTavernDirectorProfileAgent } from "../../runtime/director";
import { runTavernTextFieldAgent } from "../../runtime/assistants";
import type { TavernTextFieldAgentRequest } from "../../runtime/assistants";
import { createTavernRuntimeRoomSnapshot } from "../../adapters/runtime-room-snapshot";
import type { TavernCharacter, TavernMessage, TavernRoom, TavernScene, TavernState } from "../../types";
import { sanitizeFileName } from "../room/quick-summary/utils";
import { syncManagementStore, type ManagementContextValue } from "./context";

const TAVERN_RUNTIME_MODEL_UNAVAILABLE = "当前模型配置已不可用，请重新选择模型。";

const requireTavernRuntimeModelInput = (runtimeModel: RuntimeModelOption) =>
  requireRuntimeModelInput(runtimeModel, TAVERN_RUNTIME_MODEL_UNAVAILABLE);

const createLocalId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const getRoomActiveSceneId = (room: TavernRoom) => room.activeSceneId ?? room.scenes?.[0]?.id ?? room.id;

const getRoomActiveSceneInstanceId = (room: TavernRoom) => room.activeSceneInstanceId ?? getRoomActiveSceneId(room);

type ManagementProviderProps = {
  workspace: Workspace;
  state: TavernState;
  setState: Dispatch<SetStateAction<TavernState>>;
  onError?: (message: string) => void;
  onCloseActiveRoom: () => void;
  children: ReactNode;
};

export const ManagementProvider = ({
  workspace,
  state,
  setState,
  onError,
  onCloseActiveRoom,
  children,
}: ManagementProviderProps) => {
  const runtimeModels = useLlmSettingsStore((store) => store.runtimeModels);
  const loadSettings = useLlmSettingsStore((store) => store.loadSettings);
  const activeRoom = useMemo(
    () => state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0] ?? null,
    [state.activeRoomId, state.rooms],
  );
  const characterById = useMemo(
    () =>
      new Map([
        ...state.rooms.flatMap((room) =>
          (room.localCharacters ?? []).map((character) => [character.id, character] as const),
        ),
      ]),
    [state.rooms],
  );
  const messagesByRoomId = useMemo(
    () =>
      Object.fromEntries(
        state.rooms.map((room) => [room.id, state.messagesByInstance[getRoomActiveSceneInstanceId(room)] ?? []]),
      ),
    [state.messagesByInstance, state.rooms],
  );
  const runtimeModel = runtimeModels[0] ?? null;

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const reportError = useCallback(
    (message: string) => {
      onError?.(message);
    },
    [onError],
  );
  const patchRoom = useCallback(
    (roomId: string, patch: Partial<TavernRoom>) => {
      setState((current) => {
        let patchedRoom: TavernRoom | null = null;
        const nextRooms = current.rooms.map((room) => {
          if (room.id !== roomId) {
            return room;
          }

          patchedRoom = syncTavernRoomActiveScene({
            ...projectTavernSceneOntoRoom(room),
            ...patch,
            updatedAt: Date.now(),
          });
          return patchedRoom;
        });

        if (!patchedRoom) {
          return current;
        }

        return {
          ...current,
          rooms: nextRooms,
        };
      });
    },
    [setState],
  );
  const deleteRoom = useCallback(
    (roomId: string) => {
      const targetRoom = state.rooms.find((room) => room.id === roomId);
      if (!targetRoom || targetRoom.locked) {
        return false;
      }

      setState((current) => {
        const currentTargetRoom = current.rooms.find((room) => room.id === roomId);
        if (!currentTargetRoom || currentTargetRoom.locked) {
          return current;
        }

        const nextRooms = current.rooms.filter((room) => room.id !== roomId);
        const runtimeTargetRoom = projectTavernSceneOntoRoom(currentTargetRoom);
        const nextMessagesByInstance = { ...current.messagesByInstance };
        for (const instance of runtimeTargetRoom.sceneInstances) {
          delete nextMessagesByInstance[instance.id];
        }
        const activeRoomId = current.activeRoomId === roomId ? (nextRooms[0]?.id ?? "") : current.activeRoomId;

        return {
          ...current,
          activeRoomId,
          rooms: nextRooms,
          messagesByInstance: nextMessagesByInstance,
        };
      });
      if (activeRoom?.id === roomId) {
        onCloseActiveRoom();
      }
      return true;
    },
    [activeRoom?.id, onCloseActiveRoom, setState, state.rooms],
  );

  const copyRoom = useCallback(
    (roomId: string) => {
      if (!state.rooms.some((room) => room.id === roomId)) {
        return false;
      }

      setState((current) => {
        const sourceRoom = current.rooms.find((room) => room.id === roomId);
        if (!sourceRoom) {
          return current;
        }

        const sourceScenes = sourceRoom.scenes?.length ? sourceRoom.scenes : [];
        if (sourceScenes.length === 0) {
          return current;
        }

        const createdAt = Date.now();
        const copiedRoomId = createLocalId("room");
        const sourceCharacterById = new Map([
          ...current.rooms.flatMap((room) =>
            (room.localCharacters ?? []).map((character) => [character.id, character] as const),
          ),
        ]);
        const characterIdMap = new Map<string, string>();
        const referencedCharacterIds = [...new Set(sourceScenes.flatMap((scene) => scene.characterIds))];
        const copiedCharacters = referencedCharacterIds.flatMap((characterId) => {
          const character = sourceCharacterById.get(characterId);
          if (!character) {
            return [];
          }

          const copiedCharacterId = createLocalId("character");
          characterIdMap.set(character.id, copiedCharacterId);
          return [
            {
              ...character,
              id: copiedCharacterId,
              systemPresetId: undefined,
              systemPresetCharacterId: undefined,
              systemPresetVersion: undefined,
              createdAt,
              updatedAt: createdAt,
            },
          ];
        });

        const sceneIdMap = new Map<string, string>();
        const draftMessagesByCopiedSceneId: Record<string, TavernMessage[]> = {};
        const copiedScenes = sourceScenes.map((scene) => {
          const copiedSceneId = createLocalId("scene");
          sceneIdMap.set(scene.id, copiedSceneId);
          const sourceMessages =
            scene.id === sourceRoom.activeSceneId
              ? (current.messagesByInstance[getRoomActiveSceneInstanceId(sourceRoom)] ?? [])
              : [];
          const messageIdMap = new Map<string, string>();
          const copiedMessages = sourceMessages.flatMap((message) => {
            const copiedMessageId = createLocalId("message");
            messageIdMap.set(message.id, copiedMessageId);

            if (message.role === "character") {
              const copiedCharacterId = message.characterId ? characterIdMap.get(message.characterId) : undefined;
              if (!copiedCharacterId) {
                return [];
              }

              return [
                {
                  ...message,
                  id: copiedMessageId,
                  roomId: copiedRoomId,
                  characterId: copiedCharacterId,
                  createdAt,
                  status: message.status === "streaming" ? ("done" as const) : message.status,
                  referencedFiles: message.referencedFiles?.map((file) => ({ ...file })),
                },
              ];
            }

            return [
              {
                ...message,
                id: copiedMessageId,
                roomId: copiedRoomId,
                createdAt,
                status: message.status === "streaming" ? ("done" as const) : message.status,
                referencedFiles: message.referencedFiles?.map((file) => ({ ...file })),
              },
            ];
          });
          draftMessagesByCopiedSceneId[copiedSceneId] =
            copiedMessages.length > 0
              ? copiedMessages
              : [
                  createTavernMessage({
                    roomId: copiedRoomId,
                    role: "narrator",
                    content: "这个场景从另一个酒馆复制而来，灯光重新亮起。",
                    status: "done",
                  }),
                ];
          const characterIds = scene.characterIds.flatMap((characterId) => {
            const copiedCharacterId = characterIdMap.get(characterId);
            return copiedCharacterId ? [copiedCharacterId] : [];
          });
          const characterMemories = Object.fromEntries(
            Object.entries(scene.characterMemories).flatMap(([characterId, memory]) => {
              const copiedCharacterId = characterIdMap.get(characterId);
              return copiedCharacterId && memory.trim() ? [[copiedCharacterId, memory]] : [];
            }),
          );
          const characterConfigs = Object.fromEntries(
            scene.characterIds.flatMap((sourceCharacterId) => {
              const copiedCharacterId = characterIdMap.get(sourceCharacterId);
              if (!copiedCharacterId) {
                return [];
              }
              return [
                [
                  copiedCharacterId,
                  {
                    characterId: copiedCharacterId,
                    memory: characterMemories[copiedCharacterId],
                  },
                ],
              ];
            }),
          );

          return {
            ...scene,
            id: copiedSceneId,
            characterConfigs,
            characterMemories,
            illustrationHints: scene.illustrationHints.map((hint) => ({
              ...hint,
              id: createLocalId("illustration"),
              sourceMessageIds: hint.sourceMessageIds.flatMap((messageId) => {
                const copiedMessageId = messageIdMap.get(messageId);
                return copiedMessageId ? [copiedMessageId] : [];
              }),
              createdAt,
            })),
            assetDrafts: scene.assetDrafts.map((draft) => ({
              ...draft,
              id: createLocalId("draft"),
              sourceMessageIds: draft.sourceMessageIds.flatMap((messageId) => {
                const copiedMessageId = messageIdMap.get(messageId);
                return copiedMessageId ? [copiedMessageId] : [];
              }),
              characterMemories: draft.characterMemories.flatMap((memory) => {
                const copiedCharacterId = characterIdMap.get(memory.characterId);
                return copiedCharacterId
                  ? [
                      {
                        ...memory,
                        id: createLocalId("memory-draft"),
                        characterId: copiedCharacterId,
                        revealToCharacterIds: memory.revealToCharacterIds.flatMap((targetCharacterId) => {
                          const copiedTargetId = characterIdMap.get(targetCharacterId);
                          return copiedTargetId ? [copiedTargetId] : [];
                        }),
                      },
                    ]
                  : [];
              }),
              lorebookEntries: draft.lorebookEntries.map((entry) => ({
                ...entry,
                id: createLocalId("lore-draft"),
                keywords: [...entry.keywords],
              })),
              createdAt,
              updatedAt: createdAt,
            })),
            characterIds,
            activeCharacterId: characterIdMap.get(scene.activeCharacterId) ?? characterIds[0] ?? "",
            createdAt,
            updatedAt: createdAt,
          } satisfies TavernScene;
        });
        const copiedLorebookEntries = sourceRoom.lorebookEntries.map((entry) => ({
          ...entry,
          id: createLocalId("lore"),
          keywords: [...entry.keywords],
          createdAt,
          updatedAt: createdAt,
        }));
        const activeSceneId = sceneIdMap.get(sourceRoom.activeSceneId ?? "") ?? copiedScenes[0]?.id ?? "";
        const storyNodeIdMap = new Map<string, string>();
        const copiedNodes = sourceRoom.storyGraph.nodes.map((node) => {
          const copiedNodeId = createLocalId("node");
          storyNodeIdMap.set(node.id, copiedNodeId);
          return {
            ...node,
            id: copiedNodeId,
            sceneId: node.sceneId ? sceneIdMap.get(node.sceneId) : undefined,
            createdAt,
            updatedAt: createdAt,
          };
        });
        const copiedEdges = sourceRoom.storyGraph.edges.flatMap((edge) => {
          const fromNodeId = storyNodeIdMap.get(edge.fromNodeId);
          const toNodeId = storyNodeIdMap.get(edge.toNodeId);
          return fromNodeId && toNodeId
            ? [
                {
                  ...edge,
                  id: createLocalId("edge"),
                  fromNodeId,
                  toNodeId,
                  createdAt,
                  updatedAt: createdAt,
                },
              ]
            : [];
        });
        const copiedActiveNodeId = storyNodeIdMap.get(sourceRoom.storyGraph.activeNodeId) ?? copiedNodes[0]?.id ?? "";
        const copiedEntryNodeId =
          storyNodeIdMap.get(sourceRoom.storyGraph.entryNodeId) ?? copiedNodes[0]?.id ?? copiedActiveNodeId;
        const copiedRoom: TavernRoom = projectTavernSceneOntoRoom({
          ...sourceRoom,
          id: copiedRoomId,
          workspaceId: workspace.id,
          systemPresetId: undefined,
          systemPresetVersion: undefined,
          locked: false,
          presentation: {
            ...sourceRoom.presentation,
            lockedAt: undefined,
            lockedSceneId: undefined,
          },
          title: `${sourceRoom.title}（副本）`,
          activeSceneId,
          storyGraph: {
            version: 1,
            entryNodeId: copiedEntryNodeId,
            activeNodeId: copiedActiveNodeId,
            nodes: copiedNodes,
            edges: copiedEdges,
          },
          scenes: copiedScenes,
          localCharacters: copiedCharacters,
          lorebookEntries: copiedLorebookEntries,
          createdAt,
          updatedAt: createdAt,
        });
        const copiedActiveSceneInstanceId = getRoomActiveSceneInstanceId(copiedRoom);
        const copiedActiveMessages = (draftMessagesByCopiedSceneId[activeSceneId] ?? []).map((message) => ({
          ...message,
          sceneId: copiedRoom.activeSceneId,
          sceneInstanceId: copiedActiveSceneInstanceId,
        }));

        return {
          ...current,
          activeRoomId: copiedRoomId,
          rooms: [...current.rooms, copiedRoom],
          messagesByInstance: {
            ...current.messagesByInstance,
            [copiedActiveSceneInstanceId]: copiedActiveMessages,
          },
          workflowTracesByInstance: {
            ...current.workflowTracesByInstance,
            [copiedActiveSceneInstanceId]: [],
          },
        };
      });
      reportError("");
      return true;
    },
    [reportError, setState, state.rooms, workspace.id],
  );

  const restoreSystemPresetRoom = useCallback(
    async (roomId: string) => {
      const room = state.rooms.find((item) => item.id === roomId);
      const preset = getTavernSystemPreset(room?.systemPresetId);
      if (!room || room.locked || !preset) {
        return false;
      }

      try {
        await deleteTavernBridgeSessionsForRoom({ workspacePath: workspace.path, room });
      } catch (resetError) {
        const message = resetError instanceof Error ? resetError.message : String(resetError);
        reportError(`无法清理酒馆底层会话：${message}`);
        return false;
      }

      setState((current) => {
        const sourceRoom = current.rooms.find((item) => item.id === roomId);
        const sourcePreset = getTavernSystemPreset(sourceRoom?.systemPresetId);
        if (!sourceRoom || sourceRoom.locked || !sourcePreset) {
          return current;
        }

        const restored = createTavernRoomFromSystemPreset(workspace.id, sourcePreset.id, {
          roomId: sourceRoom.id,
          roomCreatedAt: sourceRoom.createdAt,
        });

        return {
          ...current,
          activeRoomId: sourceRoom.id,
          rooms: current.rooms.map((item) => (item.id === sourceRoom.id ? restored.room : item)),
          messagesByInstance: {
            ...current.messagesByInstance,
            [getRoomActiveSceneInstanceId(restored.room)]: restored.messages,
          },
          workflowTracesByInstance: {
            ...current.workflowTracesByInstance,
            [getRoomActiveSceneInstanceId(restored.room)]: [],
          },
        };
      });
      reportError("");
      return true;
    },
    [reportError, setState, state.rooms, workspace.id, workspace.path],
  );

  const setRoomLocked = useCallback(
    (roomId: string, locked: boolean) => {
      const room = state.rooms.find((item) => item.id === roomId);
      if (!room || room.locked === locked) {
        return false;
      }

      setState((current) => ({
        ...current,
        rooms: current.rooms.map((item) =>
          item.id === roomId
            ? {
                ...item,
                locked,
                updatedAt: Date.now(),
              }
            : item,
        ),
      }));
      reportError("");
      return true;
    },
    [reportError, setState, state.rooms],
  );

  const exportRoom = useCallback(
    (roomId: string) => {
      const targetRoom = state.rooms.find((room) => room.id === roomId);
      if (!targetRoom) {
        return false;
      }

      try {
        const payload = createTavernRuntimeRoomSnapshot({
          room: targetRoom,
          messagesByInstance: state.messagesByInstance,
        });
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${sanitizeFileName(targetRoom.title)}.tavern-runtime.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return true;
      } catch {
        return false;
      }
    },
    [state],
  );

  const createRoom = useCallback(() => {
    const nextRoom = {
      ...createTavernRoom(workspace.id, state.rooms.length + 1),
    };
    const openingMessage = createTavernMessage({
      roomId: nextRoom.id,
      sceneId: nextRoom.activeSceneId,
      sceneInstanceId: getRoomActiveSceneInstanceId(nextRoom),
      role: "narrator",
      content: "新的桌边留出空位，灯光落在还没有写下的第一行。",
      status: "done",
    });

    setState((current) => ({
      ...current,
      activeRoomId: nextRoom.id,
      rooms: [...current.rooms, nextRoom],
      messagesByInstance: {
        ...current.messagesByInstance,
        [getRoomActiveSceneInstanceId(nextRoom)]: [openingMessage],
      },
      workflowTracesByInstance: {
        ...current.workflowTracesByInstance,
        [getRoomActiveSceneInstanceId(nextRoom)]: [],
      },
    }));
    return nextRoom.id;
  }, [setState, state.rooms.length, workspace.id]);

  const selectRoom = useCallback(
    (roomId: string) => {
      setState((current) => ({
        ...current,
        activeRoomId: roomId,
      }));
    },
    [setState],
  );

  const runTextFieldAgent = useCallback(
    async (request: TavernTextFieldAgentRequest) => {
      if (!runtimeModel) {
        throw new Error(TAVERN_RUNTIME_MODEL_UNAVAILABLE);
      }

      return runTavernTextFieldAgent({
        ...request,
        workspacePath: workspace.path,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      });
    },
    [runtimeModel, workspace.path],
  );

  const regenerateDirectorProfile = useCallback(
    async (room: TavernRoom) => {
      if (!runtimeModel) {
        throw new Error(TAVERN_RUNTIME_MODEL_UNAVAILABLE);
      }

      const roomCharacterById = new Map(
        (room.localCharacters ?? []).map((character) => [character.id, character] as const),
      );
      const characters = room.characterIds
        .map((characterId) => roomCharacterById.get(characterId) ?? characterById.get(characterId))
        .filter((character): character is TavernCharacter => Boolean(character));
      if (characters.length === 0) {
        throw new Error("当前酒馆还没有可生成调度画像的角色。");
      }

      return runTavernDirectorProfileAgent({
        workspacePath: workspace.path,
        runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
        room,
        characters,
      });
    },
    [characterById, runtimeModel, workspace.path],
  );

  const value = useMemo<ManagementContextValue>(
    () => ({
      rooms: state.rooms,
      activeRoom,
      characterById,
      messagesByRoomId,
      createRoom,
      selectRoom,
      patchRoom,
      copyRoom,
      restoreSystemPresetRoom,
      setRoomLocked,
      deleteRoom,
      exportRoom,
      globalRuntimeModel: runtimeModel,
      runTextFieldAgent,
      regenerateDirectorProfile,
    }),
    [
      activeRoom,
      characterById,
      copyRoom,
      createRoom,
      deleteRoom,
      exportRoom,
      messagesByRoomId,
      patchRoom,
      regenerateDirectorProfile,
      restoreSystemPresetRoom,
      runTextFieldAgent,
      runtimeModel,
      selectRoom,
      setRoomLocked,
      state.rooms,
    ],
  );
  const isStoreInitializedRef = useRef(false);

  if (!isStoreInitializedRef.current) {
    syncManagementStore(value);
    isStoreInitializedRef.current = true;
  }

  useLayoutEffect(() => {
    syncManagementStore(value);
  }, [value]);

  return children;
};
