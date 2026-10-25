import { act } from "react";
import { createRoot } from "react-dom/client";
import { Media, MediaProvider, type MediaProps, type MediaRuntime } from "../../src/components/media";
import { renderFilePreview } from "@mewvis/app-sdk/files/view";
import type { ApplicationFilePreviewResource } from "@mewvis/app-sdk/files";
import "../../src/App.css";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const results = document.getElementById("results")!;
const fixture = document.getElementById("fixture")!;
const assertions: string[] = [];
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
  assertions.push(message);
};
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  }
  throw new Error("Media state timed out");
}
function wav() {
  const bytes = new Uint8Array(32044),
    view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string) =>
    Array.from(text).forEach((char, index) => (bytes[offset + index] = char.charCodeAt(0)));
  tag(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, bytes.length - 44, true);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

async function run() {
  const audioUrl = wav();
  const audioPath = "/workspace/voice-without-extension";
  const imagePath = "/workspace/small.png";
  const audio: ApplicationFilePreviewResource = {
    id: "audio",
    filePath: audioPath,
    name: "212f823d-76ed-445d-b12b-37549abc2e51.wav",
    kind: "audio",
    mimeType: "audio/wav",
    size: 32044,
    resourcePath: "audio",
    resourceUrl: audioUrl,
    expiresAt: Date.now() + 60000,
  };
  const image: ApplicationFilePreviewResource = {
    ...audio,
    id: "small",
    filePath: imagePath,
    name: "small.png",
    kind: "image",
    mimeType: "image/png",
    resourcePath: "small",
    resourceUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAFUlEQVR4nGNgYPhLIhrVMKph2GoAAISu/QH+5zsIAAAAAElFTkSuQmCC",
  };
  const video: ApplicationFilePreviewResource = {
    ...image,
    id: "video",
    filePath: "/workspace/blank-video.mp4",
    name: "blank-video.mp4",
    kind: "video",
    mimeType: "video/mp4",
    resourcePath: "video",
    resourceUrl: new URL("./fixtures/blank-video.mp4", import.meta.url).href,
  };
  const released: string[] = [],
    located: string[] = [],
    opened: string[] = [];
  const runtime: MediaRuntime = {
    async open(container, { filePath }, options) {
      const view = renderFilePreview(container, filePath === audioPath ? audio : image, options);
      return {
        ready: view.ready,
        close: async () => {
          view.close();
          released.push(filePath);
        },
      };
    },
    async reveal(path) {
      located.push(path);
    },
    async openDialog({ filePath }) {
      opened.push(filePath);
      return filePath === audioPath ? audio : image;
    },
  };
  const root = createRoot(fixture);
  const render = (props: MediaProps) =>
    act(async () =>
      root.render(
        <MediaProvider value={runtime}>
          <Media {...props} />
        </MediaProvider>,
      ),
    );
  try {
    await render({ filePath: audioPath, name: audio.name, mimeType: "audio/wav", size: audio.size });
    await waitFor(() => fixture.querySelector("audio")?.duration === 2);
    const native = fixture.querySelector("audio")!;
    const media = fixture.querySelector<HTMLElement>('[data-slot="media"]')!;
    assert(
      media.dataset.mediaKind === "audio" && !native.controls,
      "Public Media infers audio from MIME and hides the native implementation",
    );
    assert(
      media.getAttribute("aria-label") === "音频",
      "Media generates the default type label without a caller-provided label",
    );
    const audioProps = { filePath: audioPath, name: audio.name, mimeType: "audio/wav", size: audio.size };
    const index = 2;
    await render({ ...audioProps, formatLabel: (label) => `${label} ${index + 1}` });
    assert(
      media.getAttribute("aria-label") === "音频 3",
      "A label formatter receives the generated type name and can add the caller's index",
    );
    await render({ ...audioProps, formatLabel: () => "旁白素材" });
    assert(media.getAttribute("aria-label") === "旁白素材", "A label formatter can provide a custom name");
    await render({ ...audioProps, formatLabel: () => "" });
    assert(media.getAttribute("aria-label") === "音频", "Empty formatter results retain a useful accessible name");
    assert(
      fixture.querySelector("audio") === native && released.length === 0,
      "Changing the label formatter does not reload the media or release its lease",
    );
    const before = media.getBoundingClientRect(),
      rowBefore = media.querySelector('[data-slot="audio-player"]')!.getBoundingClientRect();
    await act(async () => media.focus());
    await waitFor(() => getComputedStyle(media.querySelector(".media-hover")!).visibility === "visible");
    const after = media.getBoundingClientRect(),
      rowAfter = media.querySelector('[data-slot="audio-player"]')!.getBoundingClientRect();
    assert(
      before.height === after.height && rowBefore.top === rowAfter.top,
      "Revealing audio information keeps its height and playback controls fixed",
    );
    const title = media.querySelector<HTMLElement>(`[title="${audio.name}"]`)!;
    const folder = media.querySelector<HTMLButtonElement>('[title="打开所在目录"]')!;
    const expand = media.querySelector<HTMLButtonElement>('[title="放大预览"]')!;
    assert(
      title.getBoundingClientRect().right <= folder.getBoundingClientRect().left &&
        expand.getBoundingClientRect().right <= after.right,
      "Long audio names reserve space for both quick actions without overlap",
    );
    await act(async () => media.querySelector<HTMLButtonElement>('[aria-label="播放音频"]')!.click());
    await waitFor(() => !native.paused);
    assert(!native.paused && !native.muted, "The private audio controls play the original audible media");
    await act(async () => media.querySelector<HTMLButtonElement>('[aria-label="暂停音频"]')!.click());
    assert(native.paused, "The same controls pause audio");
    await act(async () => media.querySelector<HTMLButtonElement>('[aria-label="音频静音"]')!.click());
    assert(native.muted, "Mute synchronizes with the native audio element");
    await act(async () => {
      folder.click();
      expand.click();
    });
    assert(
      located[0] === audioPath && opened[0] === audioPath,
      "Shared actions use the file path even when the display name differs",
    );

    await render({ filePath: imagePath, type: "image" });
    await waitFor(() => Boolean(fixture.querySelector("img")?.complete && fixture.querySelector("img")?.naturalWidth));
    assert(
      released.filter((path) => path === audioPath).length === 1,
      "Switching media releases the previous path preview exactly once",
    );
    const small = fixture.querySelector<HTMLElement>('[data-slot="media"]')!;
    await act(async () => small.focus());
    await waitFor(() => Boolean(document.querySelector(".media-popover")));
    const popover = document.querySelector<HTMLElement>(".media-popover")!,
      imageBox = fixture.querySelector("img")!.getBoundingClientRect(),
      infoBox = popover.getBoundingClientRect();
    assert(imageBox.width === 16 && imageBox.height === 16, "Small images retain their original dimensions");
    assert(
      infoBox.width >= 280 &&
        infoBox.left >= 0 &&
        infoBox.right <= innerWidth &&
        (infoBox.bottom <= imageBox.top || infoBox.top >= imageBox.bottom),
      "Small-image metadata appears outside the image and stays inside the viewport",
    );
    await act(async () =>
      small.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })),
    );
    assert(
      document.activeElement === popover.querySelector("button"),
      "Keyboard navigation can enter the small-image quick actions",
    );
    await act(async () => popover.querySelector<HTMLButtonElement>('[title="放大预览"]')!.click());
    assert(opened.at(-1) === imagePath, "Small-image actions use the same shared preview dialog request");

    await render({ resource: audio, presentation: "preview" });
    await waitFor(() => fixture.querySelector("audio")?.duration === 2);
    assert(
      fixture.querySelector('[aria-label="播放音频"]') && !fixture.querySelector('[title="放大预览"]'),
      "Dialog presentation reuses audio playback without another hover toolbar",
    );
    assert(released.length === 2, "A borrowed dialog resource does not create or release an extra path lease");
    await render({
      resource: { ...audio, id: "broken", resourceUrl: "data:audio/wav;base64,AA==" },
      presentation: "preview",
    });
    await waitFor(() => Boolean(fixture.querySelector('[role="alert"]')));
    assert(
      fixture.querySelector('[role="alert"]')?.textContent?.includes("无法播放"),
      "Decode errors remain visible even when the native audio element is hidden",
    );

    let dialogRevealed = 0;
    let dialogClosed = 0;
    const closeDialog = () => {
      dialogClosed++;
      root.render(null);
    };
    await render({ presentation: "dialog", preview: audio, loading: true, onClose: closeDialog });
    assert(
      document.querySelector('[role="dialog"] [aria-label="正在加载预览"]'),
      "The public Media entry owns the dialog loading presentation without a host UI wrapper",
    );
    await render({
      presentation: "dialog",
      preview: audio,
      resource: audio,
      onClose: closeDialog,
      onReveal: async () => {
        dialogRevealed++;
      },
    });
    await waitFor(() => document.querySelector<HTMLAudioElement>('[role="dialog"] audio')?.duration === 2);
    const audioDialog = document.querySelector('[role="dialog"]')!;
    assert(
      audioDialog.querySelector('[aria-label="播放音频"]') &&
        audioDialog.querySelector("h2")?.textContent === audio.name,
      "The same Media entry owns the complete audio dialog and its player",
    );
    await act(async () =>
      Array.from(audioDialog.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("打开所在目录"))!
        .click(),
    );
    assert(
      dialogRevealed === 1,
      "The common dialog invokes the authorized host capability without importing host code",
    );
    assert(released.length === 2, "The full Media dialog borrows its resource without acquiring another preview lease");

    await render({ presentation: "dialog", preview: image, resource: image, onClose: closeDialog });
    await waitFor(() => Boolean(document.querySelector<HTMLImageElement>('[role="dialog"] img')?.complete));
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[role="dialog"] [aria-label="放大图片"]')!.click(),
    );
    await waitFor(() => document.querySelector('[role="dialog"] [title="以原始尺寸查看"]')?.textContent === "125%");
    assert(
      document.querySelector('[role="dialog"] [title="以原始尺寸查看"]')?.textContent === "125%",
      "Image zoom state is maintained inside the common Media dialog",
    );
    const nextImage = { ...image, id: "next-small" };
    await render({
      presentation: "dialog",
      preview: nextImage,
      resource: nextImage,
      onClose: closeDialog,
      onReveal: async () => {
        throw new Error("授权已失效");
      },
    });
    await waitFor(() => document.querySelector('[role="dialog"] [title="以原始尺寸查看"]')?.textContent === "适应");
    assert(
      document.querySelector('[role="dialog"] [title="以原始尺寸查看"]')?.textContent === "适应",
      "A new dialog request resets its internal zoom state",
    );
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
        .find((button) => button.textContent?.includes("打开所在目录"))!
        .click(),
    );
    assert(
      document.querySelector('[role="dialog"] [role="alert"]')?.textContent === "授权已失效",
      "The common dialog displays capability errors itself",
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[role="dialog"] button[data-slot="dialog-close"]')!.click(),
    );
    assert(
      dialogClosed === 1 && !document.querySelector('[role="dialog"]'),
      "The common dialog reports close requests through the same public entry",
    );
    await render({ resource: video });
    await waitFor(() => Boolean(fixture.querySelector("video")?.duration));
    const videoFigure = fixture.querySelector<HTMLElement>('[data-slot="media"]')!;
    assert(
      videoFigure.getAttribute("aria-label") === "视频" &&
        videoFigure.querySelector(".media-kind")?.textContent === "视频",
      "The visible video badge and accessible label come from the common type metadata",
    );
    await render({ resource: video, formatLabel: () => "演示视频" });
    assert(
      videoFigure.getAttribute("aria-label") === "演示视频" &&
        videoFigure.querySelector(".media-kind")?.textContent === "演示视频",
      "Custom labels also control the visible type badge",
    );
    await render({ resource: video, formatLabel: () => "" });
    assert(
      !videoFigure.querySelector(".media-kind") && videoFigure.getAttribute("aria-label") === "视频",
      "Hiding a visible type badge preserves the media's accessible identity",
    );
    await act(async () => root.render(null));
    fixture.style.paddingTop = "1400px";
    await render({ filePath: imagePath, type: "image" });
    const lazy = fixture.querySelector<HTMLElement>('[data-slot="media"]')!;
    assert(lazy.getBoundingClientRect().height >= 96, "An unseen image reserves space before its first preview loads");
    lazy.scrollIntoView();
    await waitFor(() => Boolean(fixture.querySelector("img")?.complete && fixture.querySelector("img")?.naturalWidth));
    await waitFor(() => lazy.getBoundingClientRect().width === 16 && lazy.getBoundingClientRect().height === 16);
    assert(
      lazy.getBoundingClientRect().height === 16,
      "Scrolling to an initially offscreen image loads it without collapsing the preview",
    );
  } finally {
    await act(async () => root.unmount());
    fixture.style.paddingTop = "80px";
    URL.revokeObjectURL(audioUrl);
  }
  assert(
    released.length === 3,
    "Owned previews are released exactly once and borrowed media preserves its owner's lease",
  );
  results.textContent = [...assertions, `PASS: ${assertions.length} media checks`].join("\n");
}
document.getElementById("run")!.addEventListener("click", () => {
  assertions.length = 0;
  void run().catch((error) => {
    results.textContent = [...assertions, `FAIL: ${error.message}`].join("\n");
  });
});
