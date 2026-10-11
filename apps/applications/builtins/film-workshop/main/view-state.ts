import { FLOW_STEPS, type FilmProject, type FlowStep } from "./model";

export interface FilmView {
  episodeId: string;
  step: FlowStep;
  shotId: string;
}

// UI navigation stays separate from the portable project format.
export function resumeView(project: FilmProject, value?: unknown): FilmView {
  const saved =
    value && typeof value === "object" ? (value as Partial<FilmView>) : {};
  const episode =
    project.episodes.find((e) => e.id === saved.episodeId) ??
    project.episodes[0];
  const fallback: FlowStep = episode.shots.length
    ? "storyboard"
    : project.assets.length
      ? "assets"
      : episode.script.trim()
        ? "script"
        : "settings";
  return {
    episodeId: episode.id,
    step: FLOW_STEPS.some((s) => s.id === saved.step) ? saved.step! : fallback,
    shotId:
      episode.shots.find((s) => s.id === saved.shotId)?.id ??
      episode.shots.at(-1)?.id ??
      "",
  };
}
