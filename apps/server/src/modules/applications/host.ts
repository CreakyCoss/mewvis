import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { ProcessLifecycle } from "../../infrastructure/process/lifecycle.js";

import {
  runtimeEnvironment,
  type RuntimeConfig,
} from "../../config/runtime.js";
import type { EventHub } from "../../infrastructure/events/event-hub.js";
import {
  ServiceError,
  object,
  nonempty,
  type JsonObject,
} from "../../shared/validation.js";
import { Packages } from "./packages.js";
import { ApplicationData } from "./data.js";
export class ApplicationHost {
  private child?: ChildProcessWithoutNullStreams;
  private lifecycle?: ProcessLifecycle;
  private generation = 0;
  private quarantined = false;
  private connection = "";
  private starting?: Promise<void>;
  private pending = new Map<
    string,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
      maxResponseBytes: number;
    }
  >();
  private dataConnections: string[] = [];
  private closing = false;
  constructor(
    private config: RuntimeConfig,
    private packages: Packages,
    private data: ApplicationData,
    private events: EventHub,
  ) {}
  private send(message: unknown) {
    if (!this.child || this.child.stdin.destroyed)
      throw new ServiceError(
        503,
        "APPLICATION_HOST_UNAVAILABLE",
        "应用宿主未连接",
      );
    const line = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(line) > 4 * 1024 * 1024)
      throw new ServiceError(413, "MESSAGE_TOO_LARGE", "应用宿主消息过大");
    if (this.child.stdin.writableLength > 8 * 1024 * 1024)
      throw new ServiceError(
        503,
        "APPLICATION_HOST_BUSY",
        "应用宿主输入队列已满",
      );
    this.child.stdin.write(line);
  }
  private rpc(method: string, params: unknown = {}): Promise<any> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ServiceError(504, "APPLICATION_HOST_TIMEOUT", "应用宿主响应超时"),
        );
        void this.stop().catch(() => {});
      }, 65000);
      timer.unref();
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        maxResponseBytes: (method === "uiDocument" ? 24 : 4) * 1024 * 1024,
      });
      try {
        this.send({ id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  private receive(message: any, connection: string) {
    if (connection !== this.connection) return;
    if (message.type === "application-data:request") {
      void this.data
        .request(message.connection, message.request)
        .then((response) => {
          if (connection === this.connection)
            try {
              this.send({
                type: "application-data:response",
                id: message.id,
                response,
              });
            } catch {}
        });
      return;
    }
    if (message.type === "application-chat:request") {
      this.events.publish("application-chat:request", {
        ...message,
        connectionId: connection,
      });
      return;
    }
    const p = this.pending.get(String(message.id));
    if (p) {
      clearTimeout(p.timer);
      this.pending.delete(String(message.id));
      if (message.error)
        p.reject(
          new ServiceError(
            400,
            "APPLICATION_HOST_ERROR",
            String(message.error.message ?? "应用宿主操作失败"),
          ),
        );
      else p.resolve(message.result);
    }
  }
  private fail(error: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    for (const token of this.dataConnections) this.data.disconnect(token);
    this.dataConnections = [];
  }
  private async ensure() {
    if (this.closing || this.quarantined)
      throw new ServiceError(503, "SERVER_CLOSING", "服务正在关闭");
    if (this.starting) return this.starting;
    if (this.child) return;
    const generation = this.generation;
    this.starting = (async () => {
      const applications = await this.packages.list();
      if (this.closing || generation !== this.generation)
        throw new ServiceError(
          503,
          "APPLICATION_HOST_CHANGED",
          "应用宿主配置已更改",
        );
      const child = spawn(
        this.config.nodeBinary,
        [join(dirname(this.config.cliPath), "app-host/service.mjs")],
        {
          cwd: dirname(this.config.cliPath),
          env: runtimeEnvironment(this.config),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      this.child = child;
      this.lifecycle = new ProcessLifecycle(child, this.config);
      const connection = randomUUID();
      this.connection = connection;
      let buffer = Buffer.alloc(0);
      child.stdout.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        let offset: number;
        while ((offset = buffer.indexOf(10)) >= 0) {
          if (offset > 24 * 1024 * 1024) {
            child.kill("SIGKILL");
            return;
          }
          const line = buffer.subarray(0, offset).toString("utf8");
          buffer = buffer.subarray(offset + 1);
          try {
            const message = JSON.parse(line);
            const maxBytes =
              this.pending.get(String(message.id))?.maxResponseBytes ??
              4 * 1024 * 1024;
            if (offset > maxBytes) throw new Error("应用宿主响应过大");
            this.receive(message, connection);
          } catch {
            child.kill("SIGKILL");
            return;
          }
        }
        // The frame bound allows UI documents; completed frames are checked against their own RPC method.
        if (buffer.length > 24 * 1024 * 1024) child.kill("SIGKILL");
      });
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => {});
      child.on("error", () =>
        this.fail(
          new ServiceError(
            503,
            "APPLICATION_HOST_UNAVAILABLE",
            "无法启动应用宿主，请构建 app-host",
          ),
        ),
      );
      child.on("close", () => {
        if (this.child === child) {
          this.child = undefined;
          this.quarantined = false;
          this.fail(
            new ServiceError(
              503,
              "APPLICATION_HOST_DISCONNECTED",
              "应用宿主已断开",
            ),
          );
          this.events.publish("application-chat:disconnect", {
            connectionId: connection,
          });
        }
      });
      try {
        const configured = [];
        for (const p of applications.filter((p) => p.enabled)) {
          let dataConnection: null | string = null;
          if (
            p.permissionStatus === "declared" &&
            p.permissions.some((v: string) =>
              ["application-data", "application-workspaces"].includes(v),
            )
          ) {
            dataConnection = await this.data.connect(p.id);
            this.dataConnections.push(dataConnection);
          }
          configured.push({
            ...p,
            kind: p.runtimeKind,
            packageRoot: p.path,
            dataConnection,
          });
        }
        if (this.child !== child || generation !== this.generation)
          throw new ServiceError(
            503,
            "APPLICATION_HOST_CHANGED",
            "应用宿主配置已更改",
          );
        await this.rpc("configure", {
          settingsPath: this.packages.path,
          applications: configured,
        });
      } catch (e) {
        await this.stop();
        throw e;
      }
    })().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  async invoke(method: string, params?: unknown) {
    await this.ensure();
    return this.rpc(method, params);
  }
  post(i: JsonObject) {
    if (
      nonempty(i.connectionId, "connectionId") !== this.connection ||
      !this.child
    )
      throw new ServiceError(409, "STALE_CONNECTION", "应用聊天连接已更换");
    const message = object(i.message);
    if (
      !["application-chat:response", "application-chat:snapshot"].includes(
        String(message.type),
      )
    )
      throw new ServiceError(400, "INVALID_ARGUMENT", "无效应用聊天响应");
    this.send(message);
    return null;
  }
  async stop() {
    this.generation++;
    const child = this.child,
      lifecycle = this.lifecycle;
    if (!child || !lifecycle) return;
    this.fail(
      new ServiceError(
        503,
        "APPLICATION_HOST_DISCONNECTED",
        "应用宿主正在重启",
      ),
    );
    const exit = await lifecycle.stop({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "shutdown",
      params: {},
    });
    if (!exit.confirmed) {
      this.quarantined = true;
      throw new ServiceError(
        503,
        "APPLICATION_HOST_QUARANTINED",
        "未确认应用宿主退出，暂时禁止启动替代进程",
      );
    }
    if (this.child === child) this.child = undefined;
  }
  async close() {
    this.closing = true;
    await this.stop();
  }
}
