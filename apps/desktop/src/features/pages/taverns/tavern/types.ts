import type { TavernPresentationProfileId, TavernRoom } from "../manage/model";

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

export type TavernMessageKind = "user_input" | "character_reply" | "narration" | "narrative_beat";

export type TavernMessage = {
  id: string;
  roomId: string;
  turnId?: string;
  kind?: TavernMessageKind;
  role: "user" | "character" | "narrator";
  characterId?: string;
  presentationProfileId?: TavernPresentationProfileId;
  content: string;
  segments?: TavernMessageSegment[];
  thought?: string;
  targetCharacterIds?: string[];
  respondsToInteractionIds?: string[];
  generatedInteractionIds?: string[];
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

export type TavernState = {
  version: 4;
  activeRoomId: string;
  rooms: TavernRoom[];
};

export type TavernReferencedFile = {
  path: string;
  content: string;
};
