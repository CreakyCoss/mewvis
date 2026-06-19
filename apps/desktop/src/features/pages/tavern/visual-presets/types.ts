export type VisualPresetId =
  | "general"
  | "wuxia"
  | "tavern"
  | "modern"
  | "mystery"
  | "scifi"
  | "fantasy"
  | "oracle";

export type VisualPresetScope = "system" | "tavern";

export type TavernVisualPresetClassNames = {
  page: string;
  backgroundImage: string;
  backgroundOverlay: string;
  backgroundPosition: string;
  backgroundSize: string;
  header: string;
  headerIcon: string;
  scrollArea: string;
  sceneCard: string;
  sceneBadge: string;
  messageList: string;
  narratorBubble: string;
  characterBubble: string;
  characterBubbleTail: string;
  userBubble: string;
  userBubbleTail: string;
  composer: string;
  composerInput: string;
  sidePanel: string;
};

export type VisualPresetDefinition = {
  id: VisualPresetId;
  label: string;
  description: string;
  scopes: VisualPresetScope[];
  tavern: TavernVisualPresetClassNames;
};
