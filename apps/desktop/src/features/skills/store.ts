import { create } from "zustand";
import type {
  MarketplaceSkill,
  SearchSkillMarketplaceInput,
  SkillMarketplacePagination,
  SkillMarketplaceSearchResult,
  SkillMarketplaceSort,
  WorkspaceSkill,
  WorkspaceSkillGroup,
  WorkspaceSkillSettings,
} from "./types";

export const DEFAULT_MARKETPLACE_QUERY = "小说";
export const DEFAULT_MARKETPLACE_SORT: SkillMarketplaceSort = "stars";

type MarketplaceCacheEntry = {
  skills: MarketplaceSkill[];
  pagination: SkillMarketplacePagination | null;
  query: string;
  sortBy: SkillMarketplaceSort;
};

type SkillsStore = {
  skills: WorkspaceSkill[];
  skillGroups: WorkspaceSkillGroup[];
  savedSkillGroups: WorkspaceSkillGroup[];
  enabledSkillKeys: string[];
  savedEnabledSkillKeys: string[];
  marketplaceResults: MarketplaceSkill[];
  marketplacePagination: SkillMarketplacePagination | null;
  marketplaceQuery: string;
  marketplaceSortBy: SkillMarketplaceSort;
  marketplaceHasLoaded: boolean;
  marketplaceCache: Record<string, MarketplaceCacheEntry>;
  setWorkspaceSkillSettings: (settings: WorkspaceSkillSettings) => void;
  setSkillGroups: (groups: WorkspaceSkillGroup[]) => void;
  setMarketplaceSearchResult: (
    input: SearchSkillMarketplaceInput,
    result: SkillMarketplaceSearchResult,
  ) => void;
  restoreMarketplaceCache: (input: SearchSkillMarketplaceInput) => boolean;
  resetDrafts: () => void;
  toggleSkill: (key: string, enabled: boolean) => void;
  toggleGroup: (skillKeys: string[], enabled: boolean) => void;
};

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  skills: [],
  skillGroups: [],
  savedSkillGroups: [],
  enabledSkillKeys: [],
  savedEnabledSkillKeys: [],
  marketplaceResults: [],
  marketplacePagination: null,
  marketplaceQuery: DEFAULT_MARKETPLACE_QUERY,
  marketplaceSortBy: DEFAULT_MARKETPLACE_SORT,
  marketplaceHasLoaded: false,
  marketplaceCache: {},
  setWorkspaceSkillSettings: (settings) => {
    const enabledSkillKeys = settings.skills
      .filter((skill) => skill.enabled)
      .map((skill) => skill.key)
      .sort();

    set({
      skills: settings.skills,
      skillGroups: settings.groups,
      savedSkillGroups: settings.groups,
      enabledSkillKeys,
      savedEnabledSkillKeys: enabledSkillKeys,
    });
  },
  setSkillGroups: (groups) => set({ skillGroups: groups }),
  setMarketplaceSearchResult: (input, result) => set((state) => {
    const query = normalizeMarketplaceQuery(input.query);
    const sortBy = input.sortBy ?? DEFAULT_MARKETPLACE_SORT;
    const nextSkills = input.append
      ? dedupeMarketplaceSkills([...state.marketplaceResults, ...result.skills])
      : result.skills;
    const pagination = result.pagination ?? null;
    const cacheKey = marketplaceCacheKey(query, sortBy);

    return {
      marketplaceResults: nextSkills,
      marketplacePagination: pagination,
      marketplaceQuery: query,
      marketplaceSortBy: sortBy,
      marketplaceHasLoaded: true,
      marketplaceCache: {
        ...state.marketplaceCache,
        [cacheKey]: {
          skills: nextSkills,
          pagination,
          query,
          sortBy,
        },
      },
    };
  }),
  restoreMarketplaceCache: (input) => {
    const query = normalizeMarketplaceQuery(input.query);
    const sortBy = input.sortBy ?? DEFAULT_MARKETPLACE_SORT;
    const cached = get().marketplaceCache[marketplaceCacheKey(query, sortBy)];
    if (!cached) {
      return false;
    }
    set({
      marketplaceResults: cached.skills,
      marketplacePagination: cached.pagination,
      marketplaceQuery: cached.query,
      marketplaceSortBy: cached.sortBy,
      marketplaceHasLoaded: true,
    });
    return true;
  },
  resetDrafts: () => set((state) => ({
    skillGroups: state.savedSkillGroups,
    enabledSkillKeys: state.savedEnabledSkillKeys,
  })),
  toggleSkill: (key, enabled) => set((state) => {
    const next = new Set(state.enabledSkillKeys);
    if (enabled) {
      next.add(key);
    } else {
      next.delete(key);
    }
    return { enabledSkillKeys: [...next].sort() };
  }),
  toggleGroup: (skillKeys, enabled) => set((state) => {
    const next = new Set(state.enabledSkillKeys);
    for (const key of skillKeys) {
      if (enabled) {
        next.add(key);
      } else {
        next.delete(key);
      }
    }
    return { enabledSkillKeys: [...next].sort() };
  }),
}));

export const hasSkillsDraftChanges = (
  enabledSkillKeys: string[],
  savedEnabledSkillKeys: string[],
  skillGroups: WorkspaceSkillGroup[],
  savedSkillGroups: WorkspaceSkillGroup[],
) =>
  !sameStringList(enabledSkillKeys, savedEnabledSkillKeys)
  || !sameSkillGroups(skillGroups, savedSkillGroups);

const sameStringList = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((item, index) => item === normalizedRight[index]);
};

const sameSkillGroups = (
  left: WorkspaceSkillGroup[],
  right: WorkspaceSkillGroup[],
) => JSON.stringify(normalizeSkillGroups(left)) === JSON.stringify(normalizeSkillGroups(right));

const normalizeSkillGroups = (groups: WorkspaceSkillGroup[]) =>
  groups
    .filter((group) => group.source === "custom")
    .map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description ?? null,
      skillNames: [...group.skillNames].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

const normalizeMarketplaceQuery = (query: string) =>
  query.trim() || DEFAULT_MARKETPLACE_QUERY;

const marketplaceCacheKey = (query: string, sortBy: SkillMarketplaceSort) =>
  `${sortBy}:${query.trim().toLowerCase()}`;

const dedupeMarketplaceSkills = (skills: MarketplaceSkill[]) => {
  const seen = new Set<string>();
  const next: MarketplaceSkill[] = [];
  for (const skill of skills) {
    const key = skill.githubUrl || skill.skillUrl || skill.name;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(skill);
  }
  return next;
};
