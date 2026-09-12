import { Worker } from "node:worker_threads";

/** Host modules load in Node; only tool schemas and skill data cross into the preview. */
export function createDevHost({ toolsEntry, skillsEntry }, timeout = 10_000) {
  let worker;
  let ready;
  let nextId = 0;
  const pending = new Map();
  const stop = (error = new Error("宿主能力已重新加载，请重试")) => {
    const old = worker;
    worker = undefined;
    ready = undefined;
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    pending.clear();
    return old?.terminate();
  };
  function start() {
    if (ready) return ready;
    if (!toolsEntry && !skillsEntry)
      return Promise.resolve({ tools: [], skills: [] });
    const current = (worker = new Worker(
      new URL("./host-worker.mjs", import.meta.url),
      { workerData: { toolsEntry, skillsEntry } },
    ));
    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("宿主能力加载超时"));
        void stop();
      }, timeout);
      const fail = (error) => {
        clearTimeout(timer);
        reject(error);
        if (worker === current) void stop(error);
      };
      current.once("error", fail);
      current.once("exit", () => fail(new Error("宿主能力进程已退出")));
      current.on("message", (message) => {
        if (message.catalog) {
          clearTimeout(timer);
          resolve(message.catalog);
          return;
        }
        const call = pending.get(message.id);
        if (!call) return;
        pending.delete(message.id);
        clearTimeout(call.timer);
        if (message.error) call.reject(new Error(message.error));
        else call.resolve(message.result);
      });
    });
    return ready;
  }
  return {
    describe: start,
    async execute(name, args) {
      await start();
      if (!worker) throw new Error("应用未声明宿主工具");
      if (pending.size >= 4) throw new Error("同时最多执行四个宿主工具调用");
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          void stop(new Error("宿主工具执行超时，工作进程已释放"));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ id, name, args });
      });
    },
    reload: stop,
    dispose: stop,
  };
}

export function toolMiddleware(runtime, token) {
  return async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    try {
      if (request.headers["x-isle-dev-token"] !== token)
        throw new Error("开发宿主连接无效，请刷新预览页面");
      if (request.method === "GET") {
        response.end(JSON.stringify(await runtime.describe()));
        return;
      }
      if (
        request.method !== "POST" ||
        !request.headers["content-type"]?.startsWith("application/json")
      )
        throw new Error("宿主工具请求必须是 JSON POST");
      let bytes = 0;
      const chunks = [];
      for await (const chunk of request) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 256 * 1024) throw new Error("工具参数超过 256 KiB");
        chunks.push(chunk);
      }
      const { name, args } = JSON.parse(
        Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(),
      );
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new Error("工具参数必须是对象");
      response.end(JSON.stringify(await runtime.execute(name, args)));
    } catch (error) {
      response.statusCode = 400;
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };
}
