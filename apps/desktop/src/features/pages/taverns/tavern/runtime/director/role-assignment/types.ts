import type { TavernFactEvent } from "@/features/pages/taverns/manage/model";

export type TavernDirectorRoleAssignment = {
  factEvents: TavernFactEvent[];
  openingNarrator?: string;
  dayAnnouncement?: string;
  publicFact?: string;
  rawText: string;
};
