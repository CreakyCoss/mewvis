import {
  FLOW_STEPS,
  PROJECT_KINDS,
  type FilmEpisode,
  type FilmProject,
  type FlowStep,
} from "./model";

// The current host limits each context field to 64,000 characters and bridge
// requests to 256 KiB. Budget the escaped JSON string as well as UTF-8 bytes.
const fits = (value: unknown) => {
  const text = JSON.stringify(value);
  return (
    text.length <= 50_000 &&
    new TextEncoder().encode(JSON.stringify({ requestContext: text }))
      .byteLength <=
      160 * 1024
  );
};
export function assistantContext(
  project: FilmProject,
  episode: FilmEpisode,
  step: FlowStep,
  selectedShotId?: string,
) {
  const selectedShot = episode.shots.find((shot) => shot.id === selectedShotId);
  const base = {
    projectId: project.id,
    episodeId: episode.id,
    step: FLOW_STEPS.find((s) => s.id === step)?.title,
    selectedShotId: selectedShot?.id,
  };
  if (fits({ ...base, project }))
    return { requestContext: JSON.stringify({ ...base, project }) };
  const summary = {
    title: project.title,
    kind: PROJECT_KINDS[project.kind],
    style: project.style,
    synopsis: project.synopsis.slice(0, 2000),
    aspectRatio: project.aspectRatio,
    script: episode.script.slice(0, 8000),
    totalAssets: project.assets.length,
    totalShots: episode.shots.length,
    selectedShot: selectedShot && {
      id: selectedShot.id,
      title: selectedShot.title,
      description: selectedShot.description.slice(0, 2000),
      dialogue: selectedShot.dialogue.slice(0, 2000),
      sceneId: selectedShot.sceneId,
      characterIds: selectedShot.characterIds.slice(0, 10),
    },
    assets: [] as Array<unknown>,
    shots: [] as Array<unknown>,
    note: "这是截取的项目摘要，不能用于完整项目校验。",
  };
  const value = { ...base, summary };
  for (const asset of project.assets.slice(0, 30)) {
    summary.assets.push({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      description: asset.description.slice(0, 400),
    });
    if (!fits(value)) {
      summary.assets.pop();
      break;
    }
  }
  for (const shot of episode.shots.slice(0, 20)) {
    summary.shots.push({
      id: shot.id,
      title: shot.title,
      duration: shot.duration,
      description: shot.description.slice(0, 500),
      sceneId: shot.sceneId,
      characterIds: shot.characterIds.slice(0, 10),
      dialogue: shot.dialogue.slice(0, 500),
      imagePrompt: shot.imagePrompt.slice(0, 500),
      videoPrompt: shot.videoPrompt.slice(0, 500),
    });
    if (!fits(value)) {
      summary.shots.pop();
      break;
    }
  }
  return { requestContext: JSON.stringify(value) };
}
