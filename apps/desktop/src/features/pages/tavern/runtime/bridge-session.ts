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
import type {
  LedgerMessageInput,
  LedgerResult,
} from "@/features/ai/components/conversation-ledger/types";
import {
  formatTavernVisibleMessagesForRequestContext,
  normalizeTavernMessagesForAudience,
  tavernBridgeSessionRootDir,
} from "../core";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "../types";
import { buildTavernBridgeSystemPrompt } from "./bridge-prompt";

export { buildTavernBridgeSystemPrompt } from "./bridge-prompt";

export type TavernBridgeSessionInput = {
  workspacePath: string;
  room: TavernRoom;
};

export const tavernBridgeSessionInput = ({
  workspacePath,
  room,
}: TavernBridgeSessionInput) => ({
  workspacePath,
  sessionRootDir: tavernBridgeSessionRootDir(room.id),
});

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

const toLedgerRole = (role: TavernMessage["role"]) => {
  if (role === "character" || role === "narrator") {
    return "assistant";
  }
  return "user";
};

export const tavernMessagesToLedgerMessages = ({
  room,
  characters,
  messages,
}: {
  room: TavernRoom;
  characters: TavernCharacter[];
  messages: TavernMessage[];
}): LedgerMessageInput[] => {
  const visibleMessages = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    audience: { type: "public" },
  });

  return visibleMessages.flatMap((message) => {
    const content = [
      `speaker: ${message.speakerName}`,
      formatTavernVisibleMessagesForRequestContext([message]),
    ].join("\n").trim();
    return content
      ? [{
        role: toLedgerRole(message.role),
        content,
        timestamp: message.createdAt,
        metadata: {
          tavernRoomId: room.id,
          tavernSceneId: room.activeSceneId ?? null,
          tavernMessageId: message.id,
          tavernRole: message.role,
          tavernCharacterId: message.characterId ?? null,
        },
      }]
      : [];
  });
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
