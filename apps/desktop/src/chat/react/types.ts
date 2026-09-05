export type { SkillOption as ChatInputSkillOption, MessagePart as ChatInputSubmitBlock } from "../core";
export type ChatInputFile = { path: string; name: string; isDirectory: boolean };
export type ChatDisplayOptions = { showThinkingProcess: boolean; showToolCallProcess: boolean };
export type ComposerDraft = { text: string; blocks: import("../core").MessagePart[] };
export interface ChatViewPersistence {
  loadPreferences(): Promise<ChatDisplayOptions>;
  savePreferences(value: ChatDisplayOptions): Promise<void>;
}
