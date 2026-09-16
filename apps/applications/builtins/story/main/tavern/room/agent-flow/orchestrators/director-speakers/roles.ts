import type { TavernCharacter, TavernStoryData } from "../../../model";

const sanitizeAgentRoleSegment = (value: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return segment;
};

const tavernAgentScopeSegment = (story: TavernStoryData) =>
  `${sanitizeAgentRoleSegment(story.chapterId)}-${sanitizeAgentRoleSegment(story.roomConfig.id)}`;

export const tavernAgentFlowDirectorRoleId = (story: TavernStoryData) =>
  `tavern-${tavernAgentScopeSegment(story)}-flow-director`;

export const tavernAgentFlowCharacterRoleId = (story: TavernStoryData, character: Pick<TavernCharacter, "id">) =>
  `tavern-${tavernAgentScopeSegment(story)}-flow-character-${sanitizeAgentRoleSegment(character.id)}`;
