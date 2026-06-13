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
import { ALL_SKILLS_GROUP_ID } from "./constants";

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
  defaultSkillGroupId: string;
  savedDefaultSkillGroupId: string;
  marketplaceResults: MarketplaceSkill[];
  marketplacePagination: SkillMarketplacePagination | null;
  marketplaceQuery: string;
  marketplaceSortBy: SkillMarketplaceSort;
  marketplaceHasLoaded: boolean;
  marketplaceCache: Record<string, MarketplaceCacheEntry>;
  setWorkspaceSkillSettings: (settings: WorkspaceSkillSettings) => void;
  setSkillGroups: (groups: WorkspaceSkillGroup[]) => void;
  setDefaultSkillGroupId: (groupId: string) => void;
  setMarketplaceSearchResult: (
    input: SearchSkillMarketplaceInput,
    result: SkillMarketplaceSearchResult,
  ) => void;
  restoreMarketplaceCache: (input: SearchSkillMarketplaceInput) => boolean;
  resetDrafts: () => void;
};

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  skills: [],
  skillGroups: [],
  savedSkillGroups: [],
  defaultSkillGroupId: ALL_SKILLS_GROUP_ID,
  savedDefaultSkillGroupId: ALL_SKILLS_GROUP_ID,
  marketplaceResults: [],
  marketplacePagination: null,
  marketplaceQuery: DEFAULT_MARKETPLACE_QUERY,
  marketplaceSortBy: DEFAULT_MARKETPLACE_SORT,
  marketplaceHasLoaded: false,
  marketplaceCache: {},
  setWorkspaceSkillSettings: (settings) => {
    const defaultSkillGroupId = settings.defaultGroupId || ALL_SKILLS_GROUP_ID;
    set({
      skills: settings.skills,
      skillGroups: settings.groups,
      savedSkillGroups: settings.groups,
      defaultSkillGroupId,
      savedDefaultSkillGroupId: defaultSkillGroupId,
    });
  },
  setSkillGroups: (groups) => set({ skillGroups: groups }),
  setDefaultSkillGroupId: (groupId) => set({ defaultSkillGroupId: groupId }),
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
    defaultSkillGroupId: state.savedDefaultSkillGroupId,
  })),
}));

export const hasSkillsDraftChanges = (
  skillGroups: WorkspaceSkillGroup[],
  savedSkillGroups: WorkspaceSkillGroup[],
  defaultSkillGroupId: string,
  savedDefaultSkillGroupId: string,
) =>
  defaultSkillGroupId !== savedDefaultSkillGroupId
  || !sameSkillGroups(skillGroups, savedSkillGroups);

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
