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
  enabledSkillNames: string[];
  savedEnabledSkillNames: string[];
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
  toggleSkill: (name: string, enabled: boolean) => void;
  toggleGroup: (skillNames: string[], enabled: boolean) => void;
};

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  skills: [],
  skillGroups: [],
  savedSkillGroups: [],
  enabledSkillNames: [],
  savedEnabledSkillNames: [],
  marketplaceResults: [],
  marketplacePagination: null,
  marketplaceQuery: DEFAULT_MARKETPLACE_QUERY,
  marketplaceSortBy: DEFAULT_MARKETPLACE_SORT,
  marketplaceHasLoaded: false,
  marketplaceCache: {},
  setWorkspaceSkillSettings: (settings) => {
    const enabledSkillNames = settings.skills
      .filter((skill) => skill.enabled)
      .map((skill) => skill.name)
      .sort();

    set({
      skills: settings.skills,
      skillGroups: settings.groups,
      savedSkillGroups: settings.groups,
      enabledSkillNames,
      savedEnabledSkillNames: enabledSkillNames,
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
    enabledSkillNames: state.savedEnabledSkillNames,
  })),
  toggleSkill: (name, enabled) => set((state) => {
    const next = new Set(state.enabledSkillNames);
    if (enabled) {
      next.add(name);
    } else {
      next.delete(name);
    }
    return { enabledSkillNames: [...next].sort() };
  }),
  toggleGroup: (skillNames, enabled) => set((state) => {
    const next = new Set(state.enabledSkillNames);
    for (const name of skillNames) {
      if (enabled) {
        next.add(name);
      } else {
        next.delete(name);
      }
    }
    return { enabledSkillNames: [...next].sort() };
  }),
}));

export const hasSkillsDraftChanges = (
  enabledSkillNames: string[],
  savedEnabledSkillNames: string[],
  skillGroups: WorkspaceSkillGroup[],
  savedSkillGroups: WorkspaceSkillGroup[],
) =>
  !sameStringList(enabledSkillNames, savedEnabledSkillNames)
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
