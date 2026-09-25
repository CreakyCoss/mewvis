import { create } from "zustand";
import type {
  MarketplaceSkill,
  SearchSkillMarketplaceInput,
  SkillMarketplacePagination,
  SkillMarketplaceSearchResult,
  SkillMarketplaceSort,
} from "../types";

export const DEFAULT_MARKETPLACE_SORT: SkillMarketplaceSort = "stars";

type MarketplaceCacheEntry = {
  skills: MarketplaceSkill[];
  pagination: SkillMarketplacePagination | null;
  query: string;
  sortBy: SkillMarketplaceSort;
};

type MarketplaceStore = {
  results: MarketplaceSkill[];
  pagination: SkillMarketplacePagination | null;
  query: string;
  sortBy: SkillMarketplaceSort;
  hasLoaded: boolean;
  cache: Record<string, MarketplaceCacheEntry>;
  setSearchResult: (input: SearchSkillMarketplaceInput, result: SkillMarketplaceSearchResult) => void;
  restoreCache: (input: SearchSkillMarketplaceInput) => boolean;
};

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  results: [],
  pagination: null,
  query: "",
  sortBy: DEFAULT_MARKETPLACE_SORT,
  hasLoaded: false,
  cache: {},
  setSearchResult: (input, result) =>
    set((state) => {
      const query = normalizeQuery(input.query);
      const sortBy = input.sortBy ?? DEFAULT_MARKETPLACE_SORT;
      const results = input.append ? dedupeSkills([...state.results, ...result.skills]) : result.skills;
      const pagination = result.pagination ?? null;

      return {
        results,
        pagination,
        query,
        sortBy,
        hasLoaded: true,
        cache: {
          ...state.cache,
          [cacheKey(query, sortBy)]: { skills: results, pagination, query, sortBy },
        },
      };
    }),
  restoreCache: (input) => {
    const query = normalizeQuery(input.query);
    const sortBy = input.sortBy ?? DEFAULT_MARKETPLACE_SORT;
    const cached = get().cache[cacheKey(query, sortBy)];
    if (!cached) {
      return false;
    }

    set({
      results: cached.skills,
      pagination: cached.pagination,
      query: cached.query,
      sortBy: cached.sortBy,
      hasLoaded: true,
    });
    return true;
  },
}));

const normalizeQuery = (query: string) => query.trim();

const cacheKey = (query: string, sortBy: SkillMarketplaceSort) => `${sortBy}:${query.trim().toLowerCase()}`;

const dedupeSkills = (skills: MarketplaceSkill[]) => {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = skill.githubUrl || skill.skillUrl || skill.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
