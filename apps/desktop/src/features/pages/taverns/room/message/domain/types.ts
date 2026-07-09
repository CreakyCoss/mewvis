import type {
  AgentProtocolFormat,
  AgentProtocolOutputKey,
} from "@/features/pages/taverns/room/agent-protocol/types";

export type MessageRole = "user" | "character" | "narrator";

export type MessageStatus = "streaming" | "done" | "error";

export type MessageRenderStyle = "chat" | "prose";

export type MessageReferencedFile = {
  path: string;
};

export type MessageBody =
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

export type MessagePresentationConfig = {
  profileId?: string;
  userInputMode?: string;
};

type BaseMessageRenderInput = {
  id: string;
  body: MessageBody;
  createdAt: number;
  status?: MessageStatus;
  referencedFiles?: MessageReferencedFile[];
  presentation?: MessagePresentationConfig;
};

export type MessageRenderInput =
  | (BaseMessageRenderInput & {
      role: "user";
      characterId?: never;
    })
  | (BaseMessageRenderInput & {
      role: "narrator";
      characterId?: never;
    })
  | (BaseMessageRenderInput & {
      role: "character";
      characterId: string;
    });

export type MessageCharacterProfile = {
  id: string;
  name: string;
  avatar?: string | null;
};

export type MessageVisualStyle = {
  narratorBubble: string;
  characterBubble: string;
  characterBubbleTail: string;
  userBubble: string;
  userBubbleTail: string;
};

export type MessageActorRef = { type: "user" } | { type: "character"; characterId: string } | { type: "narrator" };

export type MessageSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "dialogue";
      text: string;
      speaker: MessageActorRef;
    }
  | {
      type: "action";
      text: string;
      actor?: MessageActorRef;
    }
  | {
      type: "thought";
      text: string;
      owner: MessageActorRef;
      visibility: "private" | "public";
    }
  | {
      type: "narration";
      text: string;
      actor?: MessageActorRef;
    };

export type RenderableMessage = {
  id: string;
  role: MessageRole;
  characterId?: string;
  character?: MessageCharacterProfile;
  speakerName: string;
  content: string;
  segments: MessageSegment[];
  thought?: string;
  rawText: string;
  createdAt: number;
  status?: MessageStatus;
  referencedFiles?: MessageReferencedFile[];
};
