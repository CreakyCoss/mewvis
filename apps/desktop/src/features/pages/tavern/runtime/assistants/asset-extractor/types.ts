export type TavernExtractedAssetDraft = {
  sourceMessageIds: string[];
  characterMemories: Array<{
    characterId: string;
    note: string;
  }>;
  lorebookEntries: Array<{
    title: string;
    content: string;
    keywords: string[];
    alwaysOn: boolean;
  }>;
};
