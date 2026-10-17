import * as fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import type { ApplicationFiles } from "../files/application-files.js";
import { jsonWrite } from "../../infrastructure/filesystem/json.js";
import { Serial } from "../../shared/serial.js";
import { object, onlyKeys, ServiceError } from "../../shared/validation.js";
import { MediaEngine } from "./engine.js";
import {
  compose,
  demuxer,
  fail,
  formats,
  path,
  type ComposeInput,
  type Kind,
  type MediaInfo,
  type MediaJob,
} from "./schema.js";

type Stored = { owner: string | null; input: ComposeInput; job: MediaJob };
type Running = Stored & {
  connection: string;
  controller: AbortController;
  done: Promise<void>;
  finish(): void;
  writes: Serial;
  committing: boolean;
  touched: number;
};
const terminal = (job: MediaJob) =>
  ["completed", "failed", "cancelled"].includes(job.status);
const validId = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
  )
    fail("INVALID_ARGUMENT", "媒体任务标识无效");
  return value as string;
};

/** Application-independent media jobs; authentication always comes from the host's file connection. */
export class ApplicationMedia {
  private engine: MediaEngine;
  private running = new Map<string, Running>();
  private probes = new Map<AbortController, Promise<unknown>>();
  private queue: Running[] = [];
  private active = 0;
  private serial = new Serial();
  private ready?: Promise<void>;
  private closed = false;
  constructor(
    private files: ApplicationFiles,
    private root: string,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.engine = new MediaEngine(env);
  }
  private initialize() {
    return (this.ready ??= (async () => {
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
      // A restarted server cannot own the old encoder processes or safely resume an incomplete job.
      for (const entry of await fs.readdir(this.root, {
        withFileTypes: true,
      })) {
        if (entry.isDirectory() && entry.name.startsWith("work-"))
          await fs.rm(join(this.root, entry.name), {
            recursive: true,
            force: true,
          });
        else if (entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name)) {
          for (const name of await fs.readdir(join(this.root, entry.name))) {
            if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
            const record = await this.readFile(
              join(this.root, entry.name, name),
            );
            if (!terminal(record.job)) {
              record.job = {
                ...record.job,
                status: "failed",
                phase: "done",
                updatedAt: Date.now(),
                error: {
                  code: "INTERRUPTED",
                  message: "宿主服务已重启，本次合成中断；请确认后重新提交",
                },
              };
              await jsonWrite(join(this.root, entry.name, name), record);
            }
          }
        }
      }
    })());
  }
  private directory(owner: string | null) {
    return join(
      this.root,
      createHash("sha256").update(JSON.stringify(owner)).digest("hex"),
    );
  }
  private async readFile(file: string): Promise<Stored> {
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024)
      fail("MEDIA_HISTORY_ERROR", "媒体任务记录无效", 500);
    const value = JSON.parse(await fs.readFile(file, "utf8")) as Stored;
    if (
      !value.job ||
      !value.input ||
      (value.owner !== null && typeof value.owner !== "string")
    )
      fail("MEDIA_HISTORY_ERROR", "媒体任务记录无效", 500);
    validId(value.job.id);
    if (
      basename(file) !== `${value.job.id}.json` ||
      dirname(file) !== this.directory(value.owner) ||
      ![
        "queued",
        "running",
        "cancelling",
        "completed",
        "failed",
        "cancelled",
      ].includes(value.job.status) ||
      !Number.isFinite(value.job.progress) ||
      value.job.progress < 0 ||
      value.job.progress > 1
    )
      fail("MEDIA_HISTORY_ERROR", "媒体任务记录与索引不一致", 500);
    return value;
  }
  private async records(owner: string | null) {
    const directory = this.directory(owner);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const names = (await fs.readdir(directory)).filter((name) =>
      /^[a-f0-9-]{36}\.json$/.test(name),
    );
    if (names.length > 10000) fail("LIMIT_EXCEEDED", "媒体任务记录超过上限");
    const records: Stored[] = [];
    for (const name of names) {
      const live = this.running.get(name.slice(0, -5));
      const value = live ?? (await this.readFile(join(directory, name)));
      if (value.owner !== owner)
        fail("PERMISSION_DENIED", "媒体任务不属于当前调用者", 403);
      records.push(value);
    }
    return records;
  }
  private async get(owner: string | null, id: string) {
    const live = this.running.get(id);
    if (live?.owner === owner) return live;
    try {
      const value = await this.readFile(
        join(this.directory(owner), `${id}.json`),
      );
      if (value.owner !== owner)
        fail("PERMISSION_DENIED", "媒体任务不属于当前调用者", 403);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        fail("MEDIA_JOB_NOT_FOUND", "未找到当前应用的媒体任务", 404);
      throw error;
    }
  }
  private persist(run: Running) {
    const record = structuredClone({
      owner: run.owner,
      input: run.input,
      job: run.job,
    });
    return run.writes.run(() =>
      jsonWrite(join(this.directory(run.owner), `${run.job.id}.json`), record),
    );
  }
  private async authorize(connection: string, input: ComposeInput) {
    for (const clip of input.clips) {
      await this.files.authorize(connection, clip.visual.filePath, "read");
      if (clip.audio)
        await this.files.authorize(connection, clip.audio.filePath, "read");
    }
    return this.files.authorize(connection, input.outputFilePath, "write");
  }
  private async stage(
    connection: string,
    source: string,
    kind: Kind,
    directory: string,
    index: number,
    signal: AbortSignal,
    validateKind = true,
  ) {
    demuxer(source, kind);
    const opened = await this.files.openRead(connection, source);
    const target = join(
      directory,
      `input-${index}${extname(source).toLowerCase()}`,
    );
    try {
      if (!opened.stat.size || opened.stat.size > 16 * 1024 ** 3)
        fail("LIMIT_EXCEEDED", "媒体输入必须为非空文件，单个文件不超过 16 GiB");
      await pipeline(
        opened.handle.createReadStream({ autoClose: false }),
        createWriteStream(target, { flags: "wx", mode: 0o600 }),
        { signal },
      );
      const after = await opened.handle.stat();
      if (
        after.size !== opened.stat.size ||
        after.mtimeMs !== opened.stat.mtimeMs
      )
        fail("FILE_CHANGED", "媒体输入在读取期间发生变化，请重新提交", 409);
      await this.files.authorize(connection, source, "read");
      const info = await this.engine.probe(target, kind, signal);
      if (validateKind && kind === "video" && !info.video)
        fail("INVALID_MEDIA", "文件不包含视频画面");
      return { path: target, info };
    } finally {
      await opened.handle.close();
    }
  }
  async request(connectionInput: unknown, input: unknown) {
    if (this.closed) fail("MEDIA_SERVICE_CLOSED", "媒体服务已关闭", 503);
    if (typeof connectionInput !== "string")
      fail("PERMISSION_DENIED", "媒体连接无效", 403);
    const connection = connectionInput as string;
    const owner = await this.files.identity(connection);
    const request = object(input);
    onlyKeys(request, ["version", "method", "params"]);
    if (request.version !== 1)
      fail("CAPABILITY_UNAVAILABLE", "不支持的媒体协议版本");
    if (Buffer.byteLength(JSON.stringify(request)) > 256 * 1024)
      fail("LIMIT_EXCEEDED", "媒体请求超过 256 KiB");
    const p = request.params === undefined ? {} : object(request.params);
    await this.initialize();
    if (this.closed) fail("MEDIA_SERVICE_CLOSED", "媒体服务已关闭", 503);
    if (request.method === "capabilities") {
      onlyKeys(p, []);
      return this.engine.capabilities();
    }
    if (request.method === "probe") {
      onlyKeys(p, ["filePath"]);
      if (this.probes.size >= 4)
        fail("LIMIT_EXCEEDED", "媒体信息读取任务过多", 429);
      const filePath = path(p.filePath);
      const extension = extname(filePath).slice(1).toLowerCase();
      const kind: Kind = Object.hasOwn(formats.image, extension)
        ? "image"
        : Object.hasOwn(formats.video, extension)
          ? "video"
          : "audio";
      demuxer(filePath, kind);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      timer.unref();
      const task = (async () => {
        const ownConnection = await this.files.connect(owner);
        let directory = "";
        try {
          directory = await fs.mkdtemp(join(this.root, "work-"));
          const staged = await this.stage(
            ownConnection,
            filePath,
            kind,
            directory,
            0,
            controller.signal,
            false,
          );
          await this.files.authorize(connection, filePath, "read");
          return { ...staged.info, filePath };
        } finally {
          await this.files.disconnect(ownConnection);
          if (directory)
            await fs.rm(directory, { recursive: true, force: true });
        }
      })();
      this.probes.set(controller, task);
      try {
        return await task;
      } finally {
        clearTimeout(timer);
        this.probes.delete(controller);
      }
    }
    if (request.method === "list") {
      onlyKeys(p, ["limit"]);
      const limit = p.limit ?? 50;
      if (
        typeof limit !== "number" ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
        fail("INVALID_ARGUMENT", "limit 必须为 1–100 的整数");
      return (await this.records(owner))
        .sort((a, b) => b.job.createdAt - a.job.createdAt)
        .slice(0, limit as number)
        .map((record) => structuredClone(record.job));
    }
    if (request.method === "get" || request.method === "cancel") {
      onlyKeys(p, ["id"]);
      const record = await this.get(owner, validId(p.id));
      if (request.method === "cancel" && !terminal(record.job)) {
        const run = this.running.get(record.job.id);
        if (!run) fail("MEDIA_JOB_NOT_FOUND", "媒体任务已失效", 404);
        if (run!.committing) {
          await run!.done;
          return structuredClone(run!.job);
        }
        run!.job.status = "cancelling";
        run!.controller.abort(
          new ServiceError(499, "CANCELLED", "媒体任务已取消"),
        );
        if (run!.job.phase === "queued") {
          this.queue = this.queue.filter((item) => item !== run);
          await this.finishCancelled(run!);
        } else await this.persist(run!);
      }
      return structuredClone(record.job);
    }
    if (request.method !== "compose") fail("INVALID_ARGUMENT", "未知媒体操作");
    const parsed = compose(p);
    return this.serial.run(async () => {
      if (this.closed) fail("MEDIA_SERVICE_CLOSED", "媒体服务已关闭", 503);
      const records = await this.records(owner);
      if (parsed.requestId) {
        const previous = records.find(
          (record) => record.input.requestId === parsed.requestId,
        );
        if (previous) {
          if (JSON.stringify(previous.input) !== JSON.stringify(parsed))
            fail("REQUEST_CONFLICT", "requestId 已用于不同的合成参数", 409);
          return structuredClone(previous.job);
        }
      }
      if (
        this.running.size >= 32 ||
        [...this.running.values()].filter(
          (run) => run.owner === owner && !terminal(run.job),
        ).length >= 4
      )
        fail("LIMIT_EXCEEDED", "媒体合成队列已满", 429);
      const output = await this.authorize(connection, parsed);
      try {
        await fs.lstat(output);
        fail("FILE_EXISTS", "目标文件已存在，请使用新的输出路径", 409);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (
        [...this.running.values()].some(
          (run) => !terminal(run.job) && run.job.outputFilePath === output,
        )
      )
        fail("FILE_EXISTS", "目标文件已有合成任务", 409);
      const ownConnection = await this.files.connect(owner);
      let finish!: () => void;
      const run: Running = {
        owner,
        input: parsed,
        connection: ownConnection,
        job: {
          id: randomUUID(),
          status: "queued",
          phase: "queued",
          progress: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          outputFilePath: output,
        },
        controller: new AbortController(),
        done: new Promise<void>((resolve) => {
          finish = resolve;
        }),
        finish: () => finish(),
        writes: new Serial(),
        committing: false,
        touched: 0,
      };
      try {
        await this.persist(run);
      } catch (error) {
        await this.files.disconnect(ownConnection);
        throw error;
      }
      this.running.set(run.job.id, run);
      this.queue.push(run);
      this.pump();
      return structuredClone(run.job);
    });
  }
  private pump() {
    while (!this.closed && this.active < 2 && this.queue.length) {
      const run = this.queue.shift()!;
      this.active++;
      void this.execute(run)
        .finally(() => {
          this.active--;
          this.pump();
        })
        .catch(() => {});
    }
  }
  private async finishCancelled(run: Running) {
    const reason = run.controller.signal.reason;
    const cancelled =
      reason instanceof ServiceError && reason.code === "CANCELLED";
    run.job = {
      ...run.job,
      status: cancelled ? "cancelled" : "failed",
      phase: "done",
      updatedAt: Date.now(),
      error: {
        code: reason instanceof ServiceError ? reason.code : "INTERRUPTED",
        message: reason instanceof Error ? reason.message : "媒体任务已中断",
      },
    };
    try {
      await this.persist(run);
    } finally {
      this.running.delete(run.job.id);
      try {
        await this.files.disconnect(run.connection);
      } finally {
        run.finish();
      }
    }
  }
  private async execute(run: Running) {
    let directory = "";
    const signal = run.controller.signal;
    let checking = false;
    const monitor = setInterval(() => {
      if (checking || run.committing || signal.aborted) return;
      checking = true;
      void this.authorize(run.connection, run.input)
        .catch((error) => run.controller.abort(error))
        .finally(() => {
          checking = false;
        });
    }, 2000);
    monitor.unref();
    try {
      run.job.status = "running";
      run.job.phase = "preparing";
      await this.persist(run);
      await this.authorize(run.connection, run.input);
      const capabilities = await this.engine.capabilities(signal);
      if (!capabilities.available)
        fail(
          "CAPABILITY_UNAVAILABLE",
          capabilities.reason ?? "媒体工具不可用",
          503,
        );
      signal.throwIfAborted();
      directory = await fs.mkdtemp(join(this.root, "work-"));
      const sources = new Map<string, { path: string; info: MediaInfo }>();
      for (const clip of run.input.clips) {
        const entries: Array<[string, Kind]> = [
          [clip.visual.filePath, clip.visual.kind],
        ];
        if (clip.audio) entries.push([clip.audio.filePath, "audio"]);
        for (const [filePath, kind] of entries) {
          const key = `${kind}:${filePath}`;
          if (!sources.has(key))
            sources.set(
              key,
              await this.stage(
                run.connection,
                filePath,
                kind,
                directory,
                sources.size,
                signal,
              ),
            );
        }
      }
      run.job.phase = "rendering";
      run.job.progress = 0.05;
      await this.persist(run);
      const output = await this.engine.render(
        run.input,
        directory,
        sources,
        signal,
        (value) => {
          run.job.progress = Math.max(
            run.job.progress,
            Math.min(0.95, 0.05 + value * 0.9),
          );
          run.job.updatedAt = Date.now();
          if (Date.now() - run.touched > 1000) {
            run.touched = Date.now();
            void this.persist(run).catch((error) =>
              run.controller.abort(error),
            );
          }
        },
      );
      signal.throwIfAborted();
      run.job.phase = "saving";
      run.job.progress = 0.97;
      await this.persist(run);
      run.job.output = await this.files.publish(
        run.connection,
        output,
        run.job.outputFilePath,
        signal,
        () => {
          signal.throwIfAborted();
          run.committing = true;
        },
      );
      run.job.status = "completed";
      run.job.progress = 1;
    } catch (error) {
      const reason = signal.aborted ? signal.reason : error;
      const code =
        reason instanceof ServiceError
          ? reason.code
          : (reason as NodeJS.ErrnoException)?.code === "EEXIST"
            ? "FILE_EXISTS"
            : "MEDIA_ERROR";
      run.job.status = code === "CANCELLED" ? "cancelled" : "failed";
      run.job.error = {
        code,
        message: reason instanceof Error ? reason.message : String(reason),
      };
    } finally {
      clearInterval(monitor);
      run.job.phase = "done";
      run.job.updatedAt = Date.now();
      try {
        await this.persist(run);
      } finally {
        this.running.delete(run.job.id);
        try {
          if (directory)
            await fs.rm(directory, { recursive: true, force: true });
        } finally {
          try {
            await this.files.disconnect(run.connection);
          } finally {
            run.finish();
          }
        }
      }
    }
  }
  async revoke(owner: string) {
    const jobs = [...this.running.values()].filter(
      (run) => run.owner === owner,
    );
    for (const run of jobs) {
      if (!run.committing)
        run.controller.abort(
          new ServiceError(403, "PERMISSION_DENIED", "应用媒体权限已撤销"),
        );
      if (run.job.phase === "queued") {
        this.queue = this.queue.filter((item) => item !== run);
        await this.finishCancelled(run);
      }
    }
    await Promise.all(jobs.map((run) => run.done));
  }
  async close() {
    this.closed = true;
    // An in-flight registration must finish before taking the shutdown snapshot.
    await this.serial.run(async () => {});
    const jobs = [...this.running.values()];
    for (const run of jobs)
      if (!run.committing)
        run.controller.abort(
          new ServiceError(503, "INTERRUPTED", "宿主服务关闭，本次合成已中断"),
        );
    for (const run of this.queue.splice(0)) await this.finishCancelled(run);
    for (const controller of this.probes.keys()) controller.abort();
    await Promise.allSettled([
      ...jobs.map((run) => run.done),
      ...this.probes.values(),
    ]);
  }
}
