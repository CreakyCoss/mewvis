import { useMemo } from "react";
import { requireRuntimeModelInput } from "@/features/pages/settings/llm/store";
import {
  SceneNovelizerPanel,
} from "../../components/SceneNovelizerPanel";
import {
  collectTavernSceneNovelSource,
} from "./collect-tavern-scene-source";
import type {
  TavernCharacter,
  TavernMessage,
  TavernRoom,
} from "@/features/pages/tavern/types";
import type {
  RuntimeModelOption,
} from "@/features/pages/settings/llm/store";
import type { Workspace } from "@/features/pages/workspace/types";

export const TavernSceneNovelizerSection = ({
  room,
  messages,
  characters,
  workspace,
  runtimeAgentId,
  runtimeModel,
  disabled,
  onBusyChange,
}: {
  room: TavernRoom;
  messages: TavernMessage[];
  characters: TavernCharacter[];
  workspace: Workspace;
  runtimeAgentId: string;
  runtimeModel: RuntimeModelOption | null;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) => {
  const source = useMemo(() =>
    collectTavernSceneNovelSource({
      room,
      messages,
      characters,
    }),
  [characters, messages, room]);
  const runtimeModelInput = useMemo(() => {
    if (!runtimeModel) {
      return null;
    }

    try {
      return requireRuntimeModelInput(runtimeModel);
    } catch {
      return null;
    }
  }, [runtimeModel]);

  return (
    <SceneNovelizerPanel
      source={source}
      workspacePath={workspace.path}
      runtimeAgentId={runtimeAgentId}
      runtimeModel={runtimeModelInput}
      disabled={disabled}
      onBusyChange={onBusyChange}
    />
  );
};
