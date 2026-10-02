import type { MessagePart } from "@mewvis/chat-contracts";
export type { SkillOption as ChatInputSkillOption, MessagePart as ChatInputSubmitBlock } from "@mewvis/chat-contracts";
export type ChatInputFile = { path: string; name: string; isDirectory: boolean };
export type ChatDisplayOptions = { showThinkingProcess: boolean; showToolCallProcess: boolean };
export type ComposerDraft = { text: string; blocks: MessagePart[] };
export interface ChatViewPersistence {
  loadPreferences(): Promise<ChatDisplayOptions>;
  savePreferences(value: ChatDisplayOptions): Promise<void>;
}
