import type { ChatMessage } from "../../types";

export type StoryChatSeed = {
  storyId: string;
  nodeId: string;
  title: string;
  messages: ChatMessage[];
  runtimeInstruction: string;
};
