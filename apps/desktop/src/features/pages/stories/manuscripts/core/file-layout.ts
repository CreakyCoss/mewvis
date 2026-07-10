import {
  storyManuscriptStatusOptions,
  storyManuscriptStatusOptionsByStatus,
  type StoryManuscriptManifestIdsKey,
} from "../model/status";
import type { StoryManuscript, StoryManuscriptMeta, StoryManuscriptsManifest } from "../model/types";

export const MANUSCRIPTS_MANIFEST_FILE = "manuscripts/manifest.json";

export const storyManuscriptContentPath = (manuscript: Pick<StoryManuscript, "id" | "nodeId" | "status">) =>
  `manuscripts/${manuscript.status}/${encodePathSegment(manuscript.nodeId)}/${encodePathSegment(manuscript.id)}.md`;

export const storyManuscriptMetaPath = (manuscript: Pick<StoryManuscript, "id" | "nodeId" | "status">) =>
  `manuscripts/${manuscript.status}/${encodePathSegment(manuscript.nodeId)}/${encodePathSegment(manuscript.id)}.json`;

export const storyManuscriptToMeta = ({ content: _content, ...meta }: StoryManuscript): StoryManuscriptMeta => meta;

export const createEmptyStoryManuscriptsManifest = (storyId: string): StoryManuscriptsManifest => ({
  storyId,
  updatedAt: Date.now(),
  nodes: [],
});

const createEmptyManifestIdGroups = () =>
  Object.fromEntries(
    storyManuscriptStatusOptions.map(({ manifestIdsKey }) => [manifestIdsKey, []]),
  ) as unknown as Record<StoryManuscriptManifestIdsKey, string[]>;

export const createStoryManuscriptsManifest = (
  storyId: string,
  manuscripts: StoryManuscript[],
): StoryManuscriptsManifest => {
  const nodesById = new Map<string, StoryManuscriptsManifest["nodes"][number]>();

  for (const manuscript of manuscripts) {
    const node =
      nodesById.get(manuscript.nodeId) ??
      ({
        nodeId: manuscript.nodeId,
        nodeSnapshot: manuscript.nodeSnapshot,
        ...createEmptyManifestIdGroups(),
      } satisfies StoryManuscriptsManifest["nodes"][number]);
    node.nodeSnapshot = manuscript.nodeSnapshot;
    node[storyManuscriptStatusOptionsByStatus[manuscript.status].manifestIdsKey].push(manuscript.id);
    nodesById.set(manuscript.nodeId, node);
  }

  return {
    storyId,
    updatedAt: manuscripts.reduce((latest, item) => Math.max(latest, item.updatedAt), Date.now()),
    nodes: [...nodesById.values()].sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
  };
};

const encodePathSegment = (value: string) => encodeURIComponent(value.trim() || "unknown").replace(/\./g, "%2E");
