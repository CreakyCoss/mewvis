import type { TavernRoleAssignmentDefinition } from "@/features/pages/taverns/manage/model";

export type TavernRoleAssignmentParticipant = {
  label: string;
  characterId?: string;
  isUser: boolean;
};

export type TavernRoleAssignmentSelection = {
  participant: TavernRoleAssignmentParticipant;
  role: TavernRoleAssignmentDefinition;
};
