import type {
  RuntimeSessionRecordRef,
} from "./events.js";

export type ChatMessageInput = {
  role: string;
  content: string;
};

export type RuntimeChatResult = {
  text: string;
  thinking?: string | null;
  runtimeSession?: RuntimeSessionRecordRef | null;
};
