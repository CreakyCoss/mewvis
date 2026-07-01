import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { RuntimeSessionPathInput } from "./providers/types.js";
import { resolveRuntimeSessionProvider } from "./providers/resolver.js";

export const sanitizeSessionArtifactSegment = (value: string, fallback: string) => {
  const segment = value
    .trim()
    .replace(/\.jsonl?$/i, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return segment || fallback;
};

export const resolveSessionArtifactPath = (
  sessionDir: string,
  segments: string[],
) => resolve(
  sessionDir,
  ...segments.map((segment, index) =>
    sanitizeSessionArtifactSegment(segment, index === 0 ? "artifact" : "default")
  ),
);

export const resolveRuntimeSessionArtifactDir = async (
  input: RuntimeSessionPathInput,
  segments: string[],
) => {
  const paths = await resolveRuntimeSessionProvider().resolvePaths(input);
  const artifactDir = resolveSessionArtifactPath(paths.artifactsDir, segments);
  await mkdir(artifactDir, { recursive: true });
  return artifactDir;
};

export const clearRuntimeSessionArtifactDir = async (
  input: RuntimeSessionPathInput,
  segments: string[],
) => {
  const paths = await resolveRuntimeSessionProvider().resolvePaths(input);
  const artifactDir = resolveSessionArtifactPath(paths.artifactsDir, segments);
  await rm(artifactDir, { recursive: true, force: true });
};
