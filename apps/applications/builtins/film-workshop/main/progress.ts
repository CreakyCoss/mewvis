import type { FilmProject, FilmShot } from "./model";

/** Production counts depend on project content, never on the current editor view. */
export function projectProgress(project: FilmProject) {
  const media = new Map(project.media?.map((item) => [item.id, item]));
  const exported = new Set(
    project.renders
      ?.filter(
        (render) => render.mode === "export" && render.status === "completed",
      )
      .map((render) => render.episodeId),
  );
  const selected = (
    shot: FilmShot,
    field: "imageMediaId" | "videoMediaId" | "audioMediaId",
    kind: "image" | "video" | "audio",
  ) => {
    const id = shot[field];
    return (
      !!id && !!shot.mediaIds?.includes(id) && media.get(id)?.kind === kind
    );
  };
  const episodes = project.episodes.map((episode) => {
    let images = 0,
      videos = 0,
      visuals = 0,
      spoken = 0,
      audio = 0;
    for (const shot of episode.shots) {
      const image = selected(shot, "imageMediaId", "image");
      const video = selected(shot, "videoMediaId", "video");
      images += Number(image);
      videos += Number(video);
      visuals += Number(image || video);
      if (shot.dialogue.trim()) {
        spoken++;
        audio += Number(selected(shot, "audioMediaId", "audio"));
      }
    }
    return {
      id: episode.id,
      title: episode.title,
      script: !!episode.script.trim(),
      shots: episode.shots.length,
      images,
      videos,
      visuals,
      spoken,
      audio,
      exported: exported.has(episode.id),
    };
  });
  const totals = episodes.reduce(
    (sum, episode) => ({
      scripts: sum.scripts + Number(episode.script),
      shots: sum.shots + episode.shots,
      visuals: sum.visuals + episode.visuals,
      videos: sum.videos + episode.videos,
      spoken: sum.spoken + episode.spoken,
      audio: sum.audio + episode.audio,
      exports: sum.exports + Number(episode.exported),
    }),
    {
      scripts: 0,
      shots: 0,
      visuals: 0,
      videos: 0,
      spoken: 0,
      audio: 0,
      exports: 0,
    },
  );
  return {
    episodes,
    ...totals,
    state:
      totals.exports > 0
        ? "有成片"
        : totals.scripts ||
            totals.shots ||
            project.assets.length ||
            project.synopsis.trim() ||
            project.style.trim()
          ? "制作中"
          : "未开始",
  };
}

export type ProjectProgress = ReturnType<typeof projectProgress>;
