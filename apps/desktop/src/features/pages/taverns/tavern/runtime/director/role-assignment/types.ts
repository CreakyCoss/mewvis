import type { TavernFactEvent } from "../../../types";

export type TavernDirectorRoleAssignment = {
  factEvents: TavernFactEvent[];
  openingNarrator?: string;
  dayAnnouncement?: string;
  publicFact?: string;
  rawText: string;
};
