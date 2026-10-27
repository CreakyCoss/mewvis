import { constants } from "node:fs";
import {
  mkdir,
  realpath,
  lstat,
  open,
  link,
  unlink,
  access,
  readdir,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  KnowledgeAttachmentStorage,
  KnowledgeAttachmentObject,
} from "./index.js";
import { fail, checkSignal } from "../util.js";
import { abortable } from "../embeddings.js";

/** Immutable local objects. Only service-generated keys are accepted. */
export async function createLocalAttachmentStorage(
  directory: string,
  storageId: string,
): Promise<KnowledgeAttachmentStorage & { readonly directory: string }> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const root = await realpath(directory);
  for (const name of ["staging", "objects"]) {
    const path = join(root, name);
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      fail(
        "INVALID_ARGUMENT",
        "Attachment directory must not contain symbolic links",
      );
  }
  for (const name of await readdir(join(root, "staging")))
    if (/^[a-f0-9-]{36}\.part$/.test(name)) {
      const path = join(root, "staging", name),
        info = await lstat(path);
      if (Date.now() - info.mtimeMs > 60 * 60_000)
        await unlink(path).catch(() => {});
    }
  const pathFor = (key: string) => {
    if (!/^(staging|objects)\/[a-f0-9-]{36}$/.test(key))
      fail("INVALID_ARGUMENT", "Invalid attachment object key");
    return join(root, key);
  };
  const get: KnowledgeAttachmentStorage["get"] = async (key, context) => {
    checkSignal(context?.signal);
    const handle = await open(
      pathFor(key),
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    ).catch(() => fail("NOT_FOUND", "Attachment bytes are unavailable"));
    const info = await handle.stat();
    if (!info.isFile()) {
      await handle.close();
      fail("NOT_FOUND", "Attachment bytes are unavailable");
    }
    const stream = handle.createReadStream();
    const abort = () => stream.destroy();
    context?.signal?.addEventListener("abort", abort, { once: true });
    const body = (async function* () {
      try {
        for await (const chunk of stream) {
          checkSignal(context?.signal);
          yield new Uint8Array(chunk);
        }
        checkSignal(context?.signal);
      } finally {
        context?.signal?.removeEventListener("abort", abort);
        stream.destroy();
      }
    })();
    return { body, sizeBytes: info.size } satisfies KnowledgeAttachmentObject;
  };
  const stat: KnowledgeAttachmentStorage["stat"] = async (key, context) => {
    let object;
    try {
      object = await get(key, context);
    } catch (error) {
      if ((error as { code?: string }).code === "NOT_FOUND") return null;
      throw error;
    }
    const digest = createHash("sha256");
    let sizeBytes = 0;
    for await (const part of object.body) {
      digest.update(part);
      sizeBytes += part.byteLength;
    }
    return { sizeBytes, sha256: digest.digest("hex") };
  };
  return {
    storageId,
    directory: root,
    get,
    stat,
    async probe() {
      try {
        await access(root, constants.R_OK | constants.W_OK);
      } catch {
        return {
          status: "unavailable",
          checkedAt: new Date().toISOString(),
          checks: [
            {
              name: "local-originals",
              status: "error",
              message: "Local original-file storage is unavailable",
            },
          ],
        };
      }
      return {
        status: "ready",
        checkedAt: new Date().toISOString(),
        checks: [{ name: "local-originals", status: "ok" }],
      };
    },
    async put(input, context) {
      checkSignal(context?.signal);
      const destination = pathFor(input.key),
        temporary = join(root, "staging", `${randomUUID()}.part`);
      const handle = await open(temporary, "wx", 0o600);
      let size = 0;
      const digest = createHash("sha256");
      try {
        const iterator = input.body[Symbol.asyncIterator]();
        try {
          for (;;) {
            const next = context?.signal
              ? await abortable(
                  Promise.resolve(iterator.next()),
                  context.signal,
                )
              : await iterator.next();
            if (next.done) break;
            const part = next.value;
            checkSignal(context?.signal);
            size += part.byteLength;
            if (size > input.sizeBytes)
              fail(
                "INVALID_ARGUMENT",
                "Uploaded file exceeds its declared size",
              );
            digest.update(part);
            let offset = 0;
            while (offset < part.byteLength) {
              const result = await handle.write(part, offset);
              offset += result.bytesWritten;
            }
          }
        } finally {
          void iterator.return?.().catch(() => {});
        }
        checkSignal(context?.signal);
        if (size !== input.sizeBytes || digest.digest("hex") !== input.sha256)
          fail(
            "INVALID_ARGUMENT",
            "Uploaded file size or SHA-256 does not match",
          );
        await handle.sync();
        await handle.close();
        try {
          await link(temporary, destination);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const old = await stat(input.key, context);
          if (old?.sha256 !== input.sha256 || old.sizeBytes !== size)
            fail("CONFLICT", "Attachment object is immutable");
        }
        return { sizeBytes: size, sha256: input.sha256 };
      } finally {
        await handle.close().catch(() => {});
        await unlink(temporary).catch(() => {});
      }
    },
    async delete(key) {
      await unlink(pathFor(key)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
    async close() {},
  };
}
