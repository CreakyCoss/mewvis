import { ApplicationFileError, type ApplicationFileResponse } from "@mewvis/app-sdk/files";

const MAX_ACTIVE = 4;
const MAX_WAITING = 64;
// Expire waiting work before the sandbox's 30-second response deadline.
const MAX_WAIT_MS = 20_000;

type Call = {
  id: string;
  run(): Promise<ApplicationFileResponse>;
  resolve(value: ApplicationFileResponse): void;
  reject(error: unknown): void;
  timer?: ReturnType<typeof setTimeout>;
  deadline?: number;
};

const waitTimeout = () => new ApplicationFileError("TIMEOUT", "文件请求排队超时，未执行，请稍后重试");

/** One queue per application frame, shared by file and media operations. */
export function createFileRequestQueue() {
  const ids = new Set<string>();
  const waiting: Call[] = [];
  let active = 0;
  let disposed = false;

  function start(call: Call) {
    clearTimeout(call.timer);
    active++;
    const finish = () => {
      ids.delete(call.id);
      active--;
      if (!disposed && waiting.length) start(waiting.shift()!);
    };
    void Promise.resolve()
      .then(() => {
        if (disposed) throw new ApplicationFileError("CONNECTION_CLOSED", "文件连接已关闭，请求未执行");
        // Background tabs can delay timer callbacks; never dispatch expired work.
        if (call.deadline !== undefined && Date.now() >= call.deadline) throw waitTimeout();
        return call.run();
      })
      .then(
        (value) => {
          finish();
          call.resolve(value);
        },
        (error) => {
          finish();
          call.reject(error);
        },
      );
  }

  return {
    request(id: string, run: Call["run"]): Promise<ApplicationFileResponse> {
      if (disposed) return Promise.reject(new ApplicationFileError("CONNECTION_CLOSED", "文件连接已关闭"));
      if (ids.has(id)) return Promise.reject(new ApplicationFileError("INVALID_ARGUMENT", "文件请求 ID 重复"));
      if (active >= MAX_ACTIVE && waiting.length >= MAX_WAITING)
        return Promise.reject(new ApplicationFileError("LIMIT_EXCEEDED", "文件请求等待队列已满，请稍后重试"));
      ids.add(id);
      return new Promise((resolve, reject) => {
        const call: Call = { id, run, resolve, reject };
        if (active < MAX_ACTIVE) start(call);
        else {
          call.deadline = Date.now() + MAX_WAIT_MS;
          call.timer = setTimeout(() => {
            const index = waiting.indexOf(call);
            if (index === -1) return;
            waiting.splice(index, 1);
            ids.delete(id);
            reject(waitTimeout());
          }, MAX_WAIT_MS);
          waiting.push(call);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const call of waiting.splice(0)) {
        clearTimeout(call.timer);
        ids.delete(call.id);
        call.reject(new ApplicationFileError("CONNECTION_CLOSED", "文件连接已关闭，排队请求未执行"));
      }
    },
  };
}
