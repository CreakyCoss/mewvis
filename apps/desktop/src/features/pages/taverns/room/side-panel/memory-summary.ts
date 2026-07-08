import { compact, uniq } from "lodash-es";
import type { TavernActiveRoomView as TavernRoom } from "@/features/pages/taverns/room/model";
import type {
  TavernCharacterMemoryLayers,
  TavernSceneInstance,
  TavernSceneMemoryLayers,
} from "@/features/pages/taverns/room/model";
import type { TavernCharacter } from "@/features/pages/taverns/manage/model";

const trimmed = (value: string | undefined) => value?.trim() ?? "";

const getActiveSceneInstance = (room: TavernRoom): TavernSceneInstance | null =>
  room.sceneInstances.find((instance) => instance.id === room.activeSceneInstanceId) ?? room.sceneInstances[0] ?? null;

const uniqueBlocks = (values: Array<string | undefined>) => uniq(compact(values.map(trimmed)));

const formatMemorySections = (sections: Array<{ title: string; values: Array<string | undefined> }>) => {
  const seen = new Set<string>();

  return sections
    .flatMap((section) => {
      const lines = uniqueBlocks(section.values).flatMap((text) => {
        if (seen.has(text)) {
          return [];
        }

        seen.add(text);
        return [text];
      });
      return lines.length > 0 ? [`【${section.title}】\n${lines.join("\n")}`] : [];
    })
    .join("\n\n");
};

const visibleSceneLayerValues = (layers: TavernSceneMemoryLayers | undefined) => [
  layers?.required,
  layers?.public,
  layers?.private,
];

const visibleCharacterLayerValues = (layers: TavernCharacterMemoryLayers | undefined) => [
  layers?.required,
  layers?.public,
  layers?.known,
  layers?.privateSelf,
];

export const buildTavernCharacterMemoryText = (room: TavernRoom, character: Pick<TavernCharacter, "id" | "name">) => {
  const activeInstance = getActiveSceneInstance(room);
  const layers = activeInstance?.characterMemoryLayers?.[character.id];

  return formatMemorySections([
    { title: "节点必须记忆", values: [layers?.required] },
    { title: "节点公开记忆", values: [layers?.public] },
    { title: "角色已知", values: [layers?.known] },
    { title: "角色私有", values: [layers?.privateSelf] },
  ]);
};

export const buildTavernMemoryOverviewSummary = (
  room: TavernRoom,
  characters: Array<Pick<TavernCharacter, "id" | "name">>,
) => {
  const activeInstance = getActiveSceneInstance(room);
  const sceneLayers = activeInstance?.memoryLayers;
  const characterValues = characters.flatMap((character) => [
    ...visibleCharacterLayerValues(activeInstance?.characterMemoryLayers?.[character.id]),
  ]);
  const lines = uniq(
    compact(
      uniqueBlocks([room.memory, ...visibleSceneLayerValues(sceneLayers), ...characterValues])
        .flatMap((block) => block.split(/\n+/))
        .map((line) =>
          line
            .replace(/^#+\s*/, "")
            .replace(/^【(.+)】$/, "$1")
            .trim(),
        ),
    ),
  );

  return lines.length > 0 ? lines.join("；") : "";
};
