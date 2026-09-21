import { randomUUID } from "node:crypto";
import type { ExtensionCatalog } from "@isle/extension-sdk";
import { ProgramExecutor, serializeWorkspaceOperation } from "../../security/execution/index.js";

export interface ExtensionSessionInstance {
  worker: ProgramExecutor;
  catalog: ExtensionCatalog;
}

/** Runtime-owned instances. Only one operation may borrow a session at a time. */
export class ExtensionSessionPool {
  private readonly id = randomUUID();
  private readonly lifetime = new AbortController();
  private readonly instances = new Map<string, ExtensionSessionInstance & { fingerprint: string }>();
  private readonly jobs = new Set<Promise<unknown>>();
  private closing?: Promise<void>;

  get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  private track<T>(job: Promise<T>): Promise<T> {
    this.jobs.add(job);
    void job.then(
      () => this.jobs.delete(job),
      () => this.jobs.delete(job),
    );
    return job;
  }

  acquire(
    key: string,
    fingerprint: string,
    create: (signal: AbortSignal) => Promise<ExtensionSessionInstance>,
    signal?: AbortSignal,
  ): Promise<ExtensionSessionInstance & { release(): Promise<void> }> {
    const operationSignal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    return new Promise((resolve, reject) => {
      const job = this.track(
        serializeWorkspaceOperation(`${this.id}:${key}`, operationSignal, async () => {
          let instance = this.instances.get(key);
          if (instance && (instance.fingerprint !== fingerprint || instance.worker.disposed)) {
            this.instances.delete(key);
            await instance.worker.dispose();
            instance = undefined;
          }
          operationSignal.throwIfAborted();
          if (!instance) {
            instance = { ...(await create(operationSignal)), fingerprint };
            this.instances.set(key, instance);
          }
          // Shutdown releases a borrowed instance even when its caller has not returned yet.
          let release!: () => void;
          const released = new Promise<void>((done) => {
            release = done;
          });
          this.lifetime.signal.addEventListener("abort", release, { once: true });
          try {
            operationSignal.throwIfAborted();
            resolve({
              worker: instance.worker,
              catalog: instance.catalog,
              release: () => {
                release();
                return job;
              },
            });
            await released;
          } finally {
            this.lifetime.signal.removeEventListener("abort", release);
            if (operationSignal.aborted || instance.worker.disposed) {
              this.instances.delete(key);
              await instance.worker.dispose();
            }
          }
        }),
      );
      void job.catch(reject);
    });
  }

  /** Wait for the current operation, then release memory; persisted plugin state is retained. */
  releaseSession(key: string): Promise<void> {
    return this.track(
      serializeWorkspaceOperation(`${this.id}:${key}`, this.lifetime.signal, async () => {
        const instance = this.instances.get(key);
        this.instances.delete(key);
        await instance?.worker.dispose();
      }),
    );
  }

  dispose(): Promise<void> {
    return (this.closing ??= (async () => {
      this.lifetime.abort();
      await Promise.allSettled([...this.jobs]);
      const instances = [...this.instances.values()];
      this.instances.clear();
      await Promise.all(instances.map(({ worker }) => worker.dispose()));
    })());
  }
}
