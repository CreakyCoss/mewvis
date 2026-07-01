import type { RuntimeModelInput } from "@/agent-client/protocol";

export type SceneNovelizerPlatformStyleId = "fanqie" | "qidian";

export type SceneNovelizerRuleCategory =
  | "quality"
  | "narrative"
  | "genre"
  | "hook"
  | "taboo";

export type SceneNovelizerRuleOptionId = string;

export type SceneNovelMaterialSource =
  | "user"
  | "character"
  | "director"
  | "system";

export type SceneNovelMaterialKind =
  | "user_action"
  | "dialogue"
  | "action"
  | "thought"
  | "narration"
  | "observation"
  | "consequence"
  | "interruption"
  | "hook";

export type SceneNovelMaterialVisibility =
  | "public"
  | "user_visible"
  | "character_private"
  | "director_private";

export type SceneNovelMaterialBeat = {
  id: string;
  turnId?: string;
  turnIndex: number;
  source: SceneNovelMaterialSource;
  kind: SceneNovelMaterialKind;
  visibility: SceneNovelMaterialVisibility;
  text: string;
  characterId?: string;
  characterName?: string;
  speakerName?: string;
  sourceMessageIds: string[];
  tags?: string[];
};

export type SceneNovelSourceConstraints = {
  preserveUserActions: boolean;
  noNewKeyConclusion: boolean;
  thoughtMode: "user_visible_only" | "omniscient" | "post_scene_reveal";
  targetChars: number;
  paragraphMaxChars: number;
};

export type SceneNovelSourceStats = {
  userActionCount: number;
  characterBeatCount: number;
  dialogueCount: number;
  thoughtCount: number;
  consequenceCount: number;
  hookCount: number;
};

export type SceneNovelSource = {
  id: string;
  title: string;
  platformStyleId: SceneNovelizerPlatformStyleId;
  ruleOptionIds: SceneNovelizerRuleOptionId[];
  sceneSummary: string;
  sceneGoal: string;
  sceneStatus: string;
  userPersonaName: string;
  materials: SceneNovelMaterialBeat[];
  confirmedFacts: string[];
  unresolvedHooks: string[];
  constraints: SceneNovelSourceConstraints;
  stats: SceneNovelSourceStats;
  createdAt: number;
};

export type SceneNovelDraftQuality = {
  score: number;
  verdict: "pass" | "warn" | "fail";
  charCount: number;
  paragraphCount: number;
  averageParagraphChars: number;
  maxParagraphChars: number;
  overlongParagraphCount: number;
  contaminationCount: number;
  hasHookEnding: boolean;
  issues: string[];
  strengths: string[];
};

export type SceneNovelDraft = {
  id: string;
  sourceId: string;
  platformStyleId: SceneNovelizerPlatformStyleId;
  text: string;
  quality: SceneNovelDraftQuality;
  createdAt: number;
  rewriteCount: number;
};

export type SceneNovelizerRunInput = {
  workspacePath: string;
  runtimeModel?: RuntimeModelInput | null;
  source: SceneNovelSource;
  autoRewrite?: boolean;
  onTextDelta?: (delta: string) => void;
};
