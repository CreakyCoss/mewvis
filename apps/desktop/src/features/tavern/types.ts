export type TavernCharacter = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  goals?: string;
  relationships?: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernRoom = {
  id: string;
  workspaceId: string;
  title: string;
  scene: string;
  characterIds: string[];
  activeCharacterId: string;
  userPersonaName: string;
  createdAt: number;
  updatedAt: number;
};

export type TavernMessage = {
  id: string;
  roomId: string;
  role: "user" | "character" | "narrator";
  characterId?: string;
  content: string;
  createdAt: number;
  status?: "streaming" | "done" | "error";
  referencedFiles?: Array<{ path: string }>;
};

export type TavernState = {
  version: 1;
  activeRoomId: string;
  rooms: TavernRoom[];
  characters: TavernCharacter[];
  messagesByRoom: Record<string, TavernMessage[]>;
};

export type TavernReferencedFile = {
  path: string;
  content: string;
};
