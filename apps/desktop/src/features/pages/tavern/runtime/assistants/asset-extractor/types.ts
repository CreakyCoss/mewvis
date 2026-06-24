export type TavernExtractedAssetDraft = {
  sourceMessageIds: string[];
  sceneMemories: Array<{
    note: string;
    visibility: "public" | "hidden" | "director";
    secretId?: string;
  }>;
  characterMemories: Array<{
    characterId: string;
    note: string;
    visibility: "public" | "hidden" | "character";
    secretId?: string;
    revealToCharacterIds: string[];
  }>;
  lorebookEntries: Array<{
    title: string;
    content: string;
    keywords: string[];
    alwaysOn: boolean;
  }>;
};
