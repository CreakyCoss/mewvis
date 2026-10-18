import assert from "node:assert/strict";
import test from "node:test";
import { fixture as f } from "./fixture.mjs";

const media = (kind) => ({
  id: f.newId(),
  kind,
  name: `test.${kind}`,
  path: `media/${f.newId()}`,
  size: 1,
  source: "generated",
  createdAt: 1,
});
const attach = (shot, entry) => {
  shot.mediaIds = [...(shot.mediaIds ?? []), entry.id];
  shot[`${entry.kind}MediaId`] = entry.id;
};

test("project progress aggregates every episode and counts selected shots, not generated versions", () => {
  const project = f.createProject("项目", "comicDrama");
  const first = project.episodes[0];
  first.script = "剧本";
  first.shots = [f.blankShot(1), f.blankShot(2)];
  first.shots[0].dialogue = "你好";
  const second = f.blankEpisode("第二集");
  second.shots = [f.blankShot(1)];
  second.shots[0].dialogue = "再见";
  project.episodes.push(second);
  const image = media("image"),
    video = media("video"),
    audio = media("audio");
  project.media = [image, video, audio, media("image"), media("image")];
  attach(first.shots[0], image);
  attach(first.shots[0], video);
  attach(first.shots[0], audio);
  attach(first.shots[1], audio); // A silent shot does not add a voice-over requirement.
  attach(second.shots[0], video);
  const progress = f.projectProgress(project);
  assert.deepEqual(
    {
      scripts: progress.scripts,
      shots: progress.shots,
      visuals: progress.visuals,
      videos: progress.videos,
      spoken: progress.spoken,
      audio: progress.audio,
    },
    { scripts: 1, shots: 3, visuals: 2, videos: 2, spoken: 2, audio: 1 },
  );
  const baseline = structuredClone(progress);
  for (const step of ["settings", "video", "delivery"])
    f.resumeView(project, { step, episodeId: second.id });
  project.generations = [
    { status: "failed", episodeId: first.id, shotId: first.shots[0].id },
  ];
  assert.deepEqual(f.projectProgress(project), baseline);
  first.shots.push(f.blankShot(3));
  assert.equal(f.projectProgress(project).shots, 4);
  delete second.shots[0].videoMediaId;
  assert.equal(f.projectProgress(project).visuals, 1);
});

test("dangling, unlinked and mismatched selections do not count as usable media references", () => {
  const project = f.createProject("项目", "movie");
  const shot = f.blankShot(1);
  shot.dialogue = "台词";
  project.episodes[0].shots.push(shot);
  const image = media("image");
  project.media = [image];
  shot.imageMediaId = image.id;
  shot.videoMediaId = image.id;
  shot.audioMediaId = "missing";
  assert.equal(f.projectProgress(project).visuals, 0);
  shot.mediaIds = [image.id, "missing"];
  assert.equal(f.projectProgress(project).visuals, 1);
  assert.equal(f.projectProgress(project).videos, 0);
  assert.equal(f.projectProgress(project).audio, 0);
});

test("exports count distinct existing episodes with successful formal exports only", () => {
  const project = f.createProject("项目", "shortDrama");
  const first = project.episodes[0],
    second = f.blankEpisode("第二集");
  project.episodes.push(second);
  project.renders = [
    { episodeId: first.id, mode: "preview", status: "completed" },
    { episodeId: first.id, mode: "export", status: "failed" },
    { episodeId: second.id, mode: "export", status: "running" },
    { episodeId: "removed", mode: "export", status: "completed" },
  ];
  assert.equal(f.projectProgress(project).exports, 0);
  project.renders.push(
    { episodeId: first.id, mode: "export", status: "completed" },
    { episodeId: first.id, mode: "export", status: "completed" },
  );
  const progress = f.projectProgress(project);
  assert.equal(progress.exports, 1);
  assert.equal(progress.episodes[0].exported, true);
  assert.equal(progress.episodes[1].exported, false);
  assert.equal(progress.state, "有成片");
});

test("an empty project has no audio requirements or artificial completion", () => {
  const progress = f.projectProgress(f.createProject("项目", "comic"));
  assert.equal(progress.state, "未开始");
  for (const field of [
    "scripts",
    "shots",
    "visuals",
    "videos",
    "spoken",
    "audio",
    "exports",
  ])
    assert.equal(progress[field], 0);
  assert.equal(progress.episodes.length, 1);
});
