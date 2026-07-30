export type Skill = {
  key: string;
  name: string;
  description: string;
  content: string;
  source: "system" | "app" | "upload" | string;
  path: string;
};

export type SkillGroupSkill = {
  key: string;
};

export type SkillGroup = {
  id: string;
  name: string;
  description?: string | null;
  source: "system" | "app" | "custom" | string;
  readonly: boolean;
  isDefault: boolean;
  order: number;
  skills: SkillGroupSkill[];
};

export type SkillSettings = {
  skills: Skill[];
  groups: SkillGroup[];
  defaultGroupId: string;
};

export type SaveSkillGroupInput = {
  id?: string;
  name: string;
  description?: string | null;
  source?: "system" | "app" | "custom" | string;
  readonly?: boolean;
  skills: SkillGroupSkill[];
};

export type MarketplaceSkill = {
  name: string;
  description: string;
  author: string;
  githubUrl: string;
  skillUrl: string;
  stars: number;
  updatedAt?: string | null;
};

export type SkillMarketplaceSort = "stars" | "updatedAt";

export type SearchSkillMarketplaceInput = {
  query: string;
  sortBy?: SkillMarketplaceSort;
  page?: number;
  limit?: number;
  append?: boolean;
};

export type SkillMarketplacePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  totalIsExact?: boolean | null;
};

export type SkillMarketplaceSearchResult = {
  skills: MarketplaceSkill[];
  pagination?: SkillMarketplacePagination | null;
};

export type InstallSkillInput = {
  source: string;
  skillName?: string | null;
  sourceKind?: "remote" | "zip" | string | null;
};

export type InstalledSkill = {
  name: string;
  description: string;
  path: string;
  sourceUrl: string;
};

export type RemoveSkillInput = {
  name?: string;
  key?: string;
  path?: string;
};

export type RemovedSkill = {
  key: string;
  name: string;
  path: string;
};
