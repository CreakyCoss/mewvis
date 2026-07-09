import type { TavernPresentationProfileId, TavernRoom } from "../manage/model";
import type { AgentProtocolFormat, AgentProtocolOutputKey } from "@/features/pages/taverns/room/agent-protocol/types";

export type TavernMessageActorRef =
  { type: "user" } | { type: "character"; characterId: string } | { type: "narrator" };

export type TavernMessageSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "dialogue";
      text: string;
      speaker: TavernMessageActorRef;
    }
  | {
      type: "action";
      text: string;
      actor?: TavernMessageActorRef;
    }
  | {
      type: "thought";
      text: string;
      owner: TavernMessageActorRef;
      visibility: "private" | "public";
    }
  | {
      type: "narration";
      text: string;
      actor?: TavernMessageActorRef;
    };

export type TavernMessageKind = "user_text" | "director_narration" | "character_agent_output";

export type TavernMessageBody =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "agent_output";
      format: AgentProtocolFormat;
      rawText: string;
      output?: AgentProtocolOutputKey[];
    };

export type TavernMessage = {
  id: string;
  roomId: string;
  turnId?: string;
  kind: TavernMessageKind;
  role: "user" | "character" | "narrator";
  characterId?: string;
  presentationProfileId?: TavernPresentationProfileId;
  body: TavernMessageBody;
  targetCharacterIds?: string[];
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

export type TavernState = {
  rooms: TavernRoom[];
};

export type TavernReferencedFile = {
  path: string;
  content: string;
};
