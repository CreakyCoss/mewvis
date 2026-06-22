import type { RuntimeModelInput } from "@/agent-client/protocol";
import {
  createLedger,
  deleteLedger,
  disposeLedgerWorkers,
  readLedger,
  rebuildLedger,
  rebuildAgentLedgerSession,
  summarizeLedger,
  compactLedger,
} from "@/features/ai/components/conversation-ledger/api";
import type { LedgerResult } from "@/features/ai/components/conversation-ledger/types";
import { tavernBridgeSessionRootDir } from "../../core";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../../types";
import { buildTavernBridgeSystemPrompt } from "../prompt";
import { tavernBridgeSessionInput } from "./bridge-session/input";
import { tavernMessagesToLedgerMessages } from "./bridge-session/messages-to-ledger";
import type { TavernBridgeSessionInput } from "./bridge-session/types";

export { buildTavernBridgeSystemPrompt } from "../prompt";
export { tavernBridgeSessionInput } from "./bridge-session/input";
export { tavernMessagesToLedgerMessages } from "./bridge-session/messages-to-ledger";
export type { TavernBridgeSessionInput } from "./bridge-session/types";

export const ensureTavernBridgeSession = async ({
  workspacePath,
  room,
}: TavernBridgeSessionInput) => createLedger({
  ...tavernBridgeSessionInput({ workspacePath, room }),
  systemPrompt: buildTavernBridgeSystemPrompt(room),
  metadata: {
    tavernRoomId: room.id,
    tavernSceneId: room.activeSceneId ?? null,
  },
});

export const readTavernBridgeSession = async ({
  workspacePath,
  room,
}: TavernBridgeSessionInput) => readLedger(
  tavernBridgeSessionInput({ workspacePath, room }),
);

export const deleteTavernBridgeSession = async ({
  workspacePath,
  room,
}: {
  workspacePath: string;
  room: Pick<TavernRoom, "id">;
}) => deleteLedger({
  workspacePath,
  sessionRootDir: tavernBridgeSessionRootDir(room.id),
});

export const disposeTavernBridgeSessionWorkers = async ({
  workspacePath,
  room,
}: {
  workspacePath: string;
  room: Pick<TavernRoom, "id">;
}) => disposeLedgerWorkers({
  workspacePath,
  sessionRootDir: tavernBridgeSessionRootDir(room.id),
});

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
  await ensureTavernBridgeSession({ workspacePath, room });
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
  runtimeAgentId,
  runtimeModel,
  summaryInstruction,
  maxSummaryChars,
}: {
  workspacePath: string;
  room: TavernRoom;
  runtimeAgentId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  summaryInstruction?: string | null;
  maxSummaryChars?: number | null;
}): Promise<LedgerResult | null> => summarizeLedger({
  ...tavernBridgeSessionInput({ workspacePath, room }),
  agentId: runtimeAgentId,
  runtimeModel,
  summaryInstruction,
  maxSummaryChars,
});

export const compactTavernAgentKnowledge = async ({
  workspacePath,
  room,
  runtimeAgentId,
  runtimeModel,
  agentRoleId,
  compactInstruction,
}: {
  workspacePath: string;
  room: TavernRoom;
  runtimeAgentId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  agentRoleId: string;
  compactInstruction?: string | null;
}) => compactLedger({
  ...tavernBridgeSessionInput({ workspacePath, room }),
  agentId: runtimeAgentId,
  agentRoleId,
  runtimeModel,
  compactInstruction,
});

export const rebuildTavernAgentKnowledge = async ({
  workspacePath,
  room,
  runtimeAgentId,
  runtimeModel,
  agentRoleId,
  rebuildInstruction,
  userMessage,
}: {
  workspacePath: string;
  room: TavernRoom;
  runtimeAgentId?: string | null;
  runtimeModel?: RuntimeModelInput | null;
  agentRoleId: string;
  rebuildInstruction?: string | null;
  userMessage?: string | null;
}) => rebuildAgentLedgerSession({
  ...tavernBridgeSessionInput({ workspacePath, room }),
  agentId: runtimeAgentId,
  agentRoleId,
  runtimeModel,
  rebuildInstruction,
  userMessage,
});
