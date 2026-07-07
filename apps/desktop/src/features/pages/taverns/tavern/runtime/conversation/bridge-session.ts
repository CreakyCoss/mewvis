import type { TavernRuntimeRoom as TavernRoom } from "@/features/pages/taverns/room/model";
import type { RuntimeModelInput } from "@/agent-client/types";
import {
  createLedger,
  deleteLedger,
  disposeLedgerWorkers,
  readLedger,
  rebuildLedger,
  summarizeLedger,
} from "@/features/ai/components/conversation-ledger/api";
import type { LedgerResult } from "@/features/ai/components/conversation-ledger/types";
import { tavernBridgeSessionRootDir, tavernBridgeSessionRootDirsForRoom } from "../../core";
import type { TavernMessage } from "../../types";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";
import { buildTavernBridgeSystemPrompt } from "../prompt";
import { tavernBridgeSessionInput } from "./bridge-session/input";
import { tavernMessagesToLedgerMessages } from "./bridge-session/messages-to-ledger";
import type { TavernBridgeSessionInput } from "./bridge-session/types";

export { buildTavernBridgeSystemPrompt } from "../prompt";
export { tavernBridgeSessionInput } from "./bridge-session/input";
export { tavernMessagesToLedgerMessages } from "./bridge-session/messages-to-ledger";
export type { TavernBridgeSessionInput } from "./bridge-session/types";

const resolveBridgeSessionCreateSystemPrompt = async (input: TavernBridgeSessionInput) => {
  const sessionInput = tavernBridgeSessionInput(input);
  try {
    const ledger = await readLedger(sessionInput);
    const hasCachedSystemPrompt = ledger?.messages.some(
      (message) => message.role === "system" && message.content.trim(),
    );
    return hasCachedSystemPrompt ? null : buildTavernBridgeSystemPrompt(input.room);
  } catch {
    return buildTavernBridgeSystemPrompt(input.room);
  }
};

export const ensureTavernBridgeSession = async ({ workspacePath, room }: TavernBridgeSessionInput) => {
  const systemPrompt = await resolveBridgeSessionCreateSystemPrompt({
    workspacePath,
    room,
  });

  return createLedger({
    ...tavernBridgeSessionInput({ workspacePath, room }),
    systemPrompt,
    metadata: {
      tavernRoomId: room.id,
      tavernSceneId: room.activeSceneId ?? null,
      tavernSceneInstanceId: room.activeSceneInstanceId ?? null,
    },
  });
};

export const readTavernBridgeSession = async ({ workspacePath, room }: TavernBridgeSessionInput) =>
  readLedger(tavernBridgeSessionInput({ workspacePath, room }));

export const deleteTavernBridgeSession = async ({
  workspacePath,
  room,
}: {
  workspacePath: string;
  room: Pick<TavernRoom, "id" | "activeSceneId" | "activeSceneInstanceId" | "scenes" | "sceneInstances">;
}) => {
  const sessionRootDirs = Array.from(new Set([tavernBridgeSessionRootDir(room)]));
  const results = await Promise.allSettled(
    sessionRootDirs.map((sessionRootDir) => deleteLedger({ workspacePath, sessionRootDir })),
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
};

export const deleteTavernBridgeSessionsForRoom = async ({
  workspacePath,
  room,
}: {
  workspacePath: string;
  room: Pick<TavernRoom, "id" | "activeSceneId" | "activeSceneInstanceId" | "scenes" | "sceneInstances">;
}) => {
  const results = await Promise.allSettled(
    tavernBridgeSessionRootDirsForRoom(room).map((sessionRootDir) => deleteLedger({ workspacePath, sessionRootDir })),
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
};

export const disposeTavernBridgeSessionWorkers = async ({
  workspacePath,
  room,
}: {
  workspacePath: string;
  room: Pick<TavernRoom, "id" | "activeSceneId" | "activeSceneInstanceId" | "scenes" | "sceneInstances">;
}) => {
  const results = await Promise.allSettled(
    tavernBridgeSessionRootDirsForRoom(room).map((sessionRootDir) =>
      disposeLedgerWorkers({ workspacePath, sessionRootDir }),
    ),
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
};

export const rebuildTavernBridgeSessionFromMessages = async ({
  workspacePath,
  room,
  characters,
  messages,
}: {
  workspacePath: string;
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
}) => {
  return rebuildLedger({
    ...tavernBridgeSessionInput({ workspacePath, room }),
    messages: [
      {
        role: "system",
        content: buildTavernBridgeSystemPrompt(room),
        timestamp: room.createdAt,
        metadata: {
          tavernRoomId: room.id,
          tavernSceneId: room.activeSceneId ?? null,
          tavernSceneInstanceId: room.activeSceneInstanceId ?? null,
        },
      },
      ...tavernMessagesToLedgerMessages({
        room,
        characters,
        messages,
      }),
    ],
  });
};

export const summarizeTavernBridgeSession = async ({
  workspacePath,
  room,
  agentRoleId,
  runtimeModel,
  summaryInstruction,
  maxSummaryChars,
}: {
  workspacePath: string;
  room: TavernRoom;
  agentRoleId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
}): Promise<LedgerResult | null> =>
  summarizeLedger({
    ...tavernBridgeSessionInput({ workspacePath, room }),
    agentRoleId,
    runtimeModel,
    summaryInstruction,
    maxSummaryChars,
  });
