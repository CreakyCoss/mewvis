import test from "node:test";
import assert from "node:assert/strict";
import { renderMedia } from "../files/renderers/media.js";

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
