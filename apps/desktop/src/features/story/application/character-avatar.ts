const storyCharacterAvatarIds = [
  "wuxia-01",
  "wuxia-02",
  "wuxia-03",
  "wuxia-04",
  "wuxia-05",
  "wuxia-06",
  "wuxia-07",
  "wuxia-08",
  "tavern-01",
  "tavern-02",
  "tavern-03",
  "tavern-04",
  "tavern-05",
  "tavern-06",
  "tavern-07",
  "tavern-08",
  "modern-01",
  "modern-02",
  "modern-03",
  "modern-04",
  "modern-05",
  "modern-06",
  "modern-07",
  "modern-08",
  "fantasy-01",
  "fantasy-02",
  "fantasy-03",
  "fantasy-04",
  "fantasy-05",
  "fantasy-06",
  "fantasy-07",
  "fantasy-08",
  "scifi-01",
  "scifi-02",
  "scifi-03",
  "scifi-04",
  "scifi-05",
  "scifi-06",
  "scifi-07",
  "scifi-08",
];

const storyCharacterAvatarIdSet = new Set(storyCharacterAvatarIds);

const defaultStoryCharacterAvatarById: Record<string, string> = {
  "rc-ji-ling": "modern-02",
  "rc-yuan-ci": "modern-01",
  "rc-su-yan": "tavern-03",
  "rc-he-mu": "tavern-05",
  "sx-lin-zhaoye": "wuxia-01",
  "sx-gu-tingxue": "wuxia-04",
  "sx-qiu-heng": "wuxia-07",
  "sx-jingchen": "wuxia-08",
  "oa-lan-qiao": "scifi-01",
  "oa-mira": "scifi-08",
  "oa-ren-ke": "scifi-06",
  "oa-yi-sen": "scifi-02",
};

export const getDefaultStoryCharacterAvatar = (index = 0) =>
  storyCharacterAvatarIds[
    Math.abs(index) % storyCharacterAvatarIds.length
  ] ?? "wuxia-01";

export const normalizeStoryCharacterAvatar = (
  avatar: unknown,
  index = 0,
) => {
  const normalized = typeof avatar === "string" ? avatar.trim() : "";
  return storyCharacterAvatarIdSet.has(normalized)
    ? normalized
    : getDefaultStoryCharacterAvatar(index);
};

export const resolveStoryCharacterAvatar = ({
  avatar,
  characterId,
  index = 0,
}: {
  avatar: unknown;
  characterId?: unknown;
  index?: number;
}) => {
  const normalized = typeof avatar === "string" ? avatar.trim() : "";
  if (storyCharacterAvatarIdSet.has(normalized)) {
    return normalized;
  }

  const normalizedCharacterId = typeof characterId === "string"
    ? characterId.trim()
    : "";
  const mappedAvatar = defaultStoryCharacterAvatarById[normalizedCharacterId];
  return mappedAvatar ?? getDefaultStoryCharacterAvatar(index);
};
