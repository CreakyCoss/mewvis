import test from "node:test";
import assert from "node:assert/strict";
import { renderMedia } from "../files/renderers/media.js";
import { renderFilePreview } from "../files/view.js";

test("preview playback controls synchronize state, clamp seeks and detach after close", async () => {
  class Media extends EventTarget {
    style = {};
    currentTime = 0;
    duration = NaN;
    paused = true;
    ended = false;
    async play() {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
    }
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    }
    removeAttribute(name) {
      delete this[name];
    }
    load() {}
  }
  const media = new Media(),
    states = [],
    ready = [];
  const cleanup = renderMedia(
    { ownerDocument: { createElement: () => media }, append() {} },
    { kind: "video", resourceUrl: "/scoped/video" },
    {
      signal: new AbortController().signal,
      onMediaReady: (value) => ready.push(value),
      onMediaStateChange: (value) => states.push(value),
    },
  );
  const controls = ready[0];
  controls.seek(9);
  assert.equal(media.currentTime, 0);
  media.duration = 15;
  media.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(states.at(-1).duration, 15);
  controls.seek(5);
  assert.equal(states.at(-1).currentTime, 5);
  await controls.play();
  assert.equal(states.at(-1).paused, false);
  controls.pause();
  assert.equal(states.at(-1).paused, true);
  controls.setMuted(true);
  assert.equal(states.at(-1).muted, true);
  controls.setMuted(false);
  assert.equal(states.at(-1).muted, false);
  controls.seek(500);
  assert.equal(media.currentTime, 15);
  controls.seek(-5);
  assert.equal(media.currentTime, 0);
  controls.seek(NaN);
  assert.equal(media.currentTime, 0);
  const count = states.length;
  cleanup();
  cleanup();
  assert.equal(ready.at(-1), null);
  assert.equal(ready.length, 2);
  controls.seek(10);
  await controls.play();
  media.dispatchEvent(new Event("timeupdate"));
  assert.equal(states.length, count);
  assert.equal(media.currentTime, 0);
  assert.equal(media.paused, true);
});

test("video primes the first frame without playing and native controls can be selected per kind", () => {
  class NativeMedia extends EventTarget {
    style = {};
    currentTime = 0;
    duration = 5;
    paused = true;
    playCalls = 0;
    play() {
      this.playCalls++;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute(name) {
      delete this[name];
    }
    load() {}
  }
  const video = new NativeMedia();
  const close = renderMedia(
    { ownerDocument: { createElement: () => video }, append() {} },
    { kind: "video", resourceUrl: "/video" },
    {
      signal: new AbortController().signal,
      mediaControls: { audio: false, video: true },
    },
  );
  video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(video.preload, "auto");
  assert.equal(video.playsInline, true);
  assert.equal(video.controls, true);
  assert.equal(video.muted, false);
  assert.equal(video.currentTime, 0.001);
  assert.equal(video.playCalls, 0);
  assert.equal(video.paused, true);
  close();
  video.currentTime = 0;
  video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(
    video.currentTime,
    0,
    "disposed renderers never seek a late video",
  );
  const audio = new NativeMedia();
  const closeAudio = renderMedia(
    { ownerDocument: { createElement: () => audio }, append() {} },
    { kind: "audio", resourceUrl: "/audio" },
    {
      signal: new AbortController().signal,
      mediaControls: { audio: false, video: true },
    },
  );
  assert.equal(audio.controls, false);
  assert.equal(audio.preload, "metadata");
  closeAudio();
});

test("first-frame loading never resets a position already selected by the user", () => {
  class Video extends EventTarget {
    style = {};
    paused = true;
    currentTime = 2;
    duration = 5;
    pause() {}
    load() {}
    removeAttribute() {}
  }
  const video = new Video();
  const close = renderMedia(
    { ownerDocument: { createElement: () => video }, append() {} },
    { kind: "video", resourceUrl: "/video" },
    { signal: new AbortController().signal },
  );
  video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(video.currentTime, 2);
  close();
});

test("file rendering publishes existing authorized metadata before selecting its renderer", async () => {
  const document = {};
  class Element {
    ownerDocument = document;
    style = {};
    dataset = {};
    children = [];
    append(child) {
      this.children.push(child);
      child.parent = this;
    }
    replaceChildren(...children) {
      this.children = [];
      children.forEach((child) => this.append(child));
    }
    removeAttribute(name) {
      delete this[name];
    }
    remove() {
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
    }
  }
  document.defaultView = { HTMLElement: Element };
  document.createElement = () => new Element();
  const container = new Element();
  const resource = {
    id: "image",
    kind: "image",
    name: "source.png",
    mimeType: "image/png",
    size: 9876,
    resourceUrl: "/authorized/image",
  };
  const events = [];
  const view = renderFilePreview(container, resource, {
    onMetadata: (file) => {
      events.push("metadata");
      assert.equal(file, resource);
      assert.equal(container.children[0].children.length, 0);
    },
    onReady: () => events.push("ready"),
  });
  await view.ready;
  assert.deepEqual(events, ["metadata", "ready"]);
  assert.equal(container.children[0].style.alignItems, "safe center");
  assert.equal(container.children[0].children[0].style.flexShrink, "0");
  view.close();
});
