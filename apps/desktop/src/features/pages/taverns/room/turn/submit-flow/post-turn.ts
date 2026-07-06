import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { RuntimeModelOption } from "@/features/pages/settings/llm/store";
import type { TavernStoryContextPackage } from "@/features/pages/taverns/tavern/adapters/story";
import type { TavernRoomContextValue } from "@/features/pages/taverns/room/context";
import {
  projectTavernSceneOntoRoom,
  syncTavernRoomActiveScene,
} from "@/features/pages/taverns/tavern/runtime/active-scene-runtime";
import { createTavernAssetDraft } from "@/features/pages/taverns/tavern/factories/asset-factories";
import { runTavernAssetExtraction } from "@/features/pages/taverns/tavern/runtime/assistants";
import type { TavernMessage, TavernReferencedFile } from "@/features/pages/taverns/tavern/types";

import {
  getErrorMessage,
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
  ctx: TavernRoomContextValue;
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
        : currentRoom,
    ),
  }));
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
  ctx: TavernRoomContextValue;
  room: TavernRoom;
  runtimeRoom: TavernRoom;
  runtimeMessages: TavernMessage[];
  turnMessages: TavernMessage[];
  references: TavernReferencedFile[];
  text: string;
  runtimeModel: RuntimeModelOption;
  mode: TurnMode;
  storyContext: TavernStoryContextPackage;
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
                assetDrafts: [...projectTavernSceneOntoRoom(currentRoom).assetDrafts, assetDraft].slice(
                  -currentRoom.settings.maxAssetDrafts,
                ),
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
