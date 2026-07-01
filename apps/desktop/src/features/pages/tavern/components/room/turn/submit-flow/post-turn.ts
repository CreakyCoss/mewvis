import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { StoryContextPackage } from "@/features/story";
import type { TavernPageContextValue } from "../../../context";
import {
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "../../../../runtime/active-scene-runtime";
import {
  createTavernAssetDraft,
} from "../../../../factories/asset-factories";
import { advanceTavernProgressFromFactEvents } from "../../../../core";
import { runTavernAssetExtraction } from "../../../../runtime/assistants";
import { runTavernProgressTracking } from "../../../../runtime/assistants";
import type {
  TavernMessage,
  TavernReferencedFile,
  TavernRoom,
} from "../../../../types";
import {
  getErrorMessage,
  getRoomActiveSceneInstanceId,
  hasAssetDraftItems,
  requireTavernRuntimeModelInput,
  type TavernPendingInteractions,
  type TurnMode,
} from "./shared";

export const syncOpenPendingInteractions = ({
  ctx,
  room,
  openPendingInteractions,
}: {
  ctx: TavernPageContextValue;
  room: TavernRoom;
  openPendingInteractions: TavernPendingInteractions;
}) => {
  ctx.setState((current) => ({
    ...current,
    rooms: current.rooms.map((currentRoom) =>
      currentRoom.id === room.id
        ? syncTavernRoomActiveScene({
            ...projectTavernSceneOntoRoom(currentRoom),
            pendingInteractions: openPendingInteractions,
            updatedAt: Date.now(),
          })
        : currentRoom
    ),
  }));
};

export const runProgressTrackingStep = async ({
  ctx,
  room,
  runtimeRoom,
  runtimeMessages,
  turnMessages,
  references,
  text,
  userMessage,
  runtimeModel,
  shouldShowProgressTrace,
  storyContext,
}: {
  ctx: TavernPageContextValue;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  references: TavernReferencedFile[];
  text: string;
  userMessage: TavernMessage;
  runtimeModel: RuntimeModelOption;
  shouldShowProgressTrace: boolean;
  storyContext: StoryContextPackage;
}) => {
  // 状态追踪失败不阻断本轮回复，只记录错误并保留已经生成的消息。
  ctx.setTurnStatus("正在更新状态面板...");
  if (shouldShowProgressTrace) {
    ctx.appendExecutionStep({
      id: "progress-tracking",
      label: "状态更新",
      detail: "抽取本轮事实事件并应用状态规则。",
      status: "running",
    });
  }

  try {
    const progressTurnId = userMessage.turnId ?? userMessage.id;
    const progressFactEvents = await runTavernProgressTracking({
      workspacePath: ctx.workspace.path,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: runtimeRoom,
      characters: ctx.roomCharacters,
      messages: runtimeMessages,
      sourceMessages: turnMessages,
      references,
      currentUserText: text,
      turnId: progressTurnId,
      storyContext,
    });

    if (progressFactEvents.length > 0) {
      const progressPatch = advanceTavernProgressFromFactEvents({
        room: runtimeRoom,
        factEvents: progressFactEvents,
        turnId: progressTurnId,
        createdAt: Date.now(),
      });
      const { actionMessages, ...progressRoomPatch } = progressPatch;
      runtimeRoom = ctx.appendProgressCheckpointToRoom(
        syncTavernRoomActiveScene({
          ...projectTavernSceneOntoRoom(runtimeRoom),
          ...progressRoomPatch,
          updatedAt: Date.now(),
        }),
        "after_turn",
        progressTurnId,
      );
      ctx.setState((current) => {
        const currentRoom = current.rooms.find((item) => item.id === room.id);
        const sceneInstanceId = currentRoom ? getRoomActiveSceneInstanceId(currentRoom) : room.id;
        const sceneId = currentRoom?.activeSceneId;
        const materializedActionMessages = actionMessages.map((message) => ({
          ...message,
          sceneId: message.sceneId ?? sceneId,
          sceneInstanceId: message.sceneInstanceId ?? sceneInstanceId,
        }));
        return {
          ...current,
          rooms: current.rooms.map((currentRoom) =>
            currentRoom.id === room.id
              ? ctx.appendProgressCheckpointToRoom(
                  syncTavernRoomActiveScene({
                    ...projectTavernSceneOntoRoom(currentRoom),
                    ...progressRoomPatch,
                    updatedAt: Date.now(),
                  }),
                  "after_turn",
                  progressTurnId,
                )
              : currentRoom
          ),
          messagesByInstance: actionMessages.length > 0
            ? {
                ...current.messagesByInstance,
                [sceneInstanceId]: [
                  ...(current.messagesByInstance[sceneInstanceId] ?? []),
                  ...materializedActionMessages,
                ],
              }
            : current.messagesByInstance,
        };
      });
    }

    if (shouldShowProgressTrace) {
      ctx.patchExecutionStep("progress-tracking", {
        status: "done",
        detail: progressFactEvents.length > 0
          ? `已抽取 ${progressFactEvents.length} 个事实事件。`
          : "本轮没有明确状态事件。",
      });
    }
  } catch (progressError) {
    if (shouldShowProgressTrace) {
      ctx.patchExecutionStep("progress-tracking", {
        status: "error",
        detail: getErrorMessage(progressError),
      });
    }
    ctx.setError(`状态更新失败：${getErrorMessage(progressError)}`);
  }

  return runtimeRoom;
};

export const runAssetExtractionStep = async ({
  ctx,
  room,
  runtimeRoom,
  runtimeMessages,
  turnMessages,
  references,
  text,
  runtimeModel,
  mode,
  storyContext,
}: {
  ctx: TavernPageContextValue;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  references: TavernReferencedFile[];
  text: string;
  runtimeModel: RuntimeModelOption;
  mode: TurnMode;
  storyContext: StoryContextPackage;
}) => {
  // 剧情资产整理是本轮后的增强流程，失败时只提示，不回滚对话。
  ctx.setTurnStatus("正在整理本轮剧情资产...");
  ctx.appendExecutionStep({
    id: "asset-extraction",
    label: "整理剧情资产",
    detail: "从本轮对话提取待确认草稿。",
    status: "running",
  });

  try {
    const extractedDraft = await runTavernAssetExtraction({
      workspacePath: ctx.workspace.path,
      runtimeModel: requireTavernRuntimeModelInput(runtimeModel),
      room: runtimeRoom,
      characters: ctx.roomCharacters,
      messages: runtimeMessages,
      sourceMessages: turnMessages,
      references,
      currentUserText: text,
      storyContext,
    });
    const assetDraft = createTavernAssetDraft(extractedDraft);
    if (hasAssetDraftItems(assetDraft)) {
      ctx.setState((current) => ({
        ...current,
        rooms: current.rooms.map((currentRoom) =>
          currentRoom.id === room.id
            ? syncTavernRoomActiveScene({
                ...projectTavernSceneOntoRoom(currentRoom),
                assetDrafts: [...projectTavernSceneOntoRoom(currentRoom).assetDrafts, assetDraft]
                  .slice(-currentRoom.settings.maxAssetDrafts),
                updatedAt: Date.now(),
              })
            : currentRoom,
        ),
      }));
      ctx.patchExecutionStep("asset-extraction", {
        status: "done",
        detail: "已生成待确认草稿。",
      });
    } else {
      ctx.patchExecutionStep("asset-extraction", {
        status: "done",
        detail: "没有发现新的稳定剧情资产。",
      });
    }
  } catch (assetError) {
    ctx.patchExecutionStep("asset-extraction", {
      status: "error",
      detail: getErrorMessage(assetError),
    });
    ctx.setError(`剧情资产整理失败：${getErrorMessage(assetError)}`);
    if (mode.isManagedMode) {
      ctx.setIsManagedAutoRunStarted(false);
    }
  }
};
