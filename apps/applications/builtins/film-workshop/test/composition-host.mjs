import * as fs from "node:fs/promises";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ApplicationFiles } from "../../../../server/dist/modules/files/application-files.js";
import { ApplicationMedia } from "../../../../server/dist/modules/media/service.js";
import { EventHub } from "../../../../server/dist/infrastructure/events/event-hub.js";

/** The browser fixture uses virtual project paths; only this adapter maps them into a disposable real host scope. */
export async function createCompositionHost(fileHost) {
  const root = await fs.realpath(
    await fs.mkdtemp(join(tmpdir(), "film-composition-")),
  );
  const files = new ApplicationFiles(
    async () => ({
      dataPath: root,
      workspacePaths: [],
      protectedPaths: [join(root, "state")],
    }),
    new EventHub(),
  );
  const media = new ApplicationMedia(files, join(root, "state"));
  const connection = await files.connect("film-test");
  const outputs = new Map();
  const mapInput = async (path) => {
    const bytes = fileHost.bytes(path);
    if (!bytes) throw new Error(`测试素材不存在：${path}`);
    const local = join(
      root,
      createHash("sha256").update(path).digest("hex") + extname(path),
    );
    await fs.writeFile(local, bytes);
    return local;
  };
  return {
    async sampleFiles() {
      const run = (args) =>
        execFileSync(
          process.env.MEWVIS_FFMPEG_PATH || "ffmpeg",
          ["-hide_banner", "-v", "error", "-threads", "2", ...args],
          { stdio: "pipe", timeout: 15000 },
        );
      const video = join(root, "sample.mp4"),
        audio = join(root, "sample.wav");
      run([
        "-f",
        "lavfi",
        "-i",
        "color=c=0x293b5d:s=160x90:d=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        video,
      ]);
      run(["-f", "lavfi", "-i", "sine=frequency=440:duration=0.7", audio]);
      return {
        video: await fs.readFile(video),
        audio: await fs.readFile(audio),
      };
    },
    async request(request) {
      try {
        let input = request;
        if (request.method === "compose") {
          const p = request.params;
          const output = join(root, `result-${p.requestId}.mp4`);
          outputs.set(output, p.outputFilePath);
          const clips = [];
          for (const clip of p.clips)
            clips.push({
              ...clip,
              visual: {
                ...clip.visual,
                filePath: await mapInput(clip.visual.filePath),
              },
              ...(clip.audio
                ? {
                    audio: {
                      ...clip.audio,
                      filePath: await mapInput(clip.audio.filePath),
                    },
                  }
                : {}),
            });
          input = {
            ...request,
            params: { ...p, outputFilePath: output, clips },
          };
        }
        const result = await media.request(connection, input);
        if (result && outputs.has(result.outputFilePath)) {
          const virtual = outputs.get(result.outputFilePath);
          if (result.status === "completed")
            fileHost.put(virtual, await fs.readFile(result.outputFilePath));
          return {
            ok: true,
            value: {
              ...result,
              outputFilePath: virtual,
              ...(result.output
                ? { output: { ...result.output, filePath: virtual } }
                : {}),
            },
          };
        }
        return { ok: true, value: result };
      } catch (error) {
        return {
          ok: false,
          error: { code: error.code || "MEDIA_ERROR", message: error.message },
        };
      }
    },
    async close() {
      await media.close();
      await files.close();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
