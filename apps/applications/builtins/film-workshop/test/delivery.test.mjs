import test from "node:test";
import assert from "node:assert/strict";
import { fixture as f, memoryStorage } from "./fixture.mjs";

function setup() {
  const project = f.exampleProject();
  project.workspace = {
    id: "work",
    root: "/projects",
    directory: `/projects/film-projects/${project.id}`,
  };
  const episode = project.episodes[0];
  episode.shots = episode.shots.slice(0, 2);
  project.media = ["image", "video", "audio"].map((kind, i) => ({
    id: f.newId(),
    kind,
    path: `media/${i}.${kind === "image" ? "png" : kind === "video" ? "mp4" : "wav"}`,
    name: kind,
    source: "imported",
    size: 32,
    mimeType: "",
    createdAt: 1,
  }));
  for (const shot of episode.shots) {
    shot.mediaIds = project.media.map((m) => m.id);
    shot.imageMediaId = project.media[0].id;
    shot.videoMediaId = project.media[1].id;
    shot.audioMediaId = project.media[2].id;
  }
  return { project, episode };
}
test("composition snapshots pin shot order, selected media, explicit duration policies and aspect ratio", () => {
  const { project, episode } = setup();
  project.aspectRatio = "9:16";
  const selection = {
    [episode.shots[1].id]: { visualId: project.media[0].id, audioId: "" },
  };
  const render = f.createRender(
    project,
    episode,
    "export",
    { ...f.defaultRenderOptions, resolution: 1080 },
    selection,
  );
  project.renders = [render];
  assert.equal(render.input.width, 1080);
  assert.equal(render.input.height, 1920);
  assert.equal(render.input.clips[0].visual.kind, "video");
  assert.equal(render.input.clips[1].visual.kind, "image");
  assert.equal(render.input.clips[1].audio, undefined);
  assert.equal(render.input.clips[0].audio.trim, false);
  assert.equal(render.input.clips[0].shortVideo, "error");
  const request = f.renderRequest(project, render);
  assert.equal(request.requestId, render.id);
  assert.equal(
    request.clips[0].visual.filePath,
    f.mediaPath(project, project.media[1]),
  );
  episode.shots.reverse();
  episode.shots[0].duration = 100;
  assert.equal(
    f.renderRequest(project, render).clips[0].duration,
    render.input.clips[0].duration,
  );
  assert.equal(f.renderRequest(project, render).clips[1].duration < 100, true);
  assert.deepEqual(f.validateProject(project).renders, [render]);
  assert.equal(f.copyProject(project).renders, undefined);
  const preview = f.createRender(
    project,
    episode,
    "preview",
    f.defaultRenderOptions,
    {},
  );
  assert.deepEqual([preview.input.width, preview.input.height], [360, 640]);
  assert.notEqual(preview.input.outputFilePath, render.input.outputFilePath);
  assert.equal(f.stageStatus(project, episode, "delivery"), "draft");
});
test("missing or detached sources and project-escaping persisted snapshots are rejected", () => {
  const { project, episode } = setup();
  assert.throws(
    () =>
      f.createRender(project, episode, "preview", f.defaultRenderOptions, {
        [episode.shots[0].id]: { visualId: "missing" },
      }),
    /缺少画面/,
  );
  const render = f.createRender(
    project,
    episode,
    "export",
    f.defaultRenderOptions,
    {},
  );
  project.renders = [render];
  const invalid = structuredClone(project);
  invalid.renders[0].input.clips[0].visual.filePath = "../other.mp4";
  assert.throws(() => f.validateProject(invalid), /路径/);
  assert.throws(() => f.renderRequest(invalid, invalid.renders[0]), /路径/);
  const foreign = structuredClone(project);
  foreign.renders[0].input.outputFilePath = "exports/other.mp4";
  assert.throws(() => f.validateProject(foreign), /输出路径/);
});
test("job results append versions without replacing current edits; records survive saves and terminal states cannot regress", async () => {
  const { project, episode } = setup();
  const render = f.createRender(
    project,
    episode,
    "export",
    f.defaultRenderOptions,
    {},
  );
  project.renders = [render];
  const path = f.renderRequest(project, render).outputFilePath;
  const job = {
    id: f.newId(),
    outputFilePath: path,
    status: "completed",
    output: { filePath: path, type: "file", size: 50 },
    createdAt: 1,
    updatedAt: 2,
    progress: 1,
    phase: "done",
  };
  episode.shots[0].title = "合成期间编辑的标题";
  const completed = f.applyRender(project, render.id, job);
  assert.equal(completed.episodes[0].shots[0].title, episode.shots[0].title);
  assert.equal(completed.renders[0].status, "completed");
  assert.equal(
    f.applyRender(completed, render.id, { ...job, status: "running" }),
    completed,
  );
  assert.throws(
    () =>
      f.applyRender(project, render.id, {
        ...job,
        outputFilePath: "/other/movie.mp4",
      }),
    /目录/,
  );
  assert.throws(
    () => f.applyRender(project, render.id, { ...job, output: undefined }),
    /有效的成片/,
  );
  const second = f.createRender(
    completed,
    episode,
    "export",
    f.defaultRenderOptions,
    {},
  );
  completed.renders.push(second);
  assert.notEqual(second.input.outputFilePath, render.input.outputFilePath);
  const files = new Map(),
    workspace = { id: "work", path: "/projects" };
  const repository = f.createRepository(memoryStorage(), {
    workspaces: { get: async () => workspace },
    files: {
      writeText: async (path, text) => files.set(path, text),
      readText: async (path) => files.get(path),
    },
  });
  await repository.save(completed);
  assert.deepEqual(
    (await repository.list())[0].renders,
    f.validateProject(completed).renders,
  );
  const cancelling = {
    ...project,
    renders: [{ ...render, jobId: job.id, status: "cancelling" }],
  };
  assert.equal(
    f.applyRender(cancelling, render.id, { ...job, status: "running" }),
    cancelling,
  );
  const cancelled = f.applyRender(cancelling, render.id, {
    ...job,
    output: undefined,
    status: "cancelled",
  });
  assert.equal(cancelled.renders[0].status, "cancelled");
});

test("timeline playback stops following stale snapshots and original sound is selected per clip", () => {
  const { project, episode } = setup();
  const options = f.defaultRenderOptions;
  const selection = {
    [episode.shots[1].id]: { audioId: "", keepAudio: false },
  };
  const render = f.createRender(
    project,
    episode,
    "preview",
    options,
    selection,
  );
  assert.equal(render.input.clips[0].sourceAudio, "keep");
  assert.equal(render.input.clips[1].sourceAudio, "mute");
  assert.equal(
    f.renderMatches(project, episode, render, options, selection),
    true,
  );
  project.renders = [render];
  assert.equal(
    f.renderMatches(
      project,
      episode,
      f.validateProject(project).renders[0],
      options,
      selection,
    ),
    true,
  );
  assert.equal(
    f.renderMatches(
      project,
      episode,
      render,
      { ...options, resolution: 1080 },
      selection,
    ),
    true,
  );
  assert.equal(
    f.renderMatches(
      project,
      episode,
      render,
      { ...options, fps: 30 },
      selection,
    ),
    false,
  );
  assert.equal(f.renderMatches(project, episode, render, options, {}), false);
  episode.shots[0].duration += 1;
  assert.equal(
    f.renderMatches(project, episode, render, options, selection),
    false,
  );
  episode.shots[0].duration -= 1;
  project.aspectRatio = "9:16";
  assert.equal(
    f.renderMatches(project, episode, render, options, selection),
    false,
  );
  project.aspectRatio = "16:9";
  episode.shots.reverse();
  assert.equal(
    f.renderMatches(project, episode, render, options, selection),
    false,
  );
});
