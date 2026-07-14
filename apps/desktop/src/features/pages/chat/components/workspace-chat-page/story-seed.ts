import type { ChatMessage } from "../../types";

export type StoryChatSeed = {
  title: string;
  messages: ChatMessage[];
  runtimeInstruction: string;
};
