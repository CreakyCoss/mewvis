import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { SrtSandboxPolicy as SandboxPolicy } from "../../execution/runtime/srt.js";

type Row = { pid: number; fingerprint: string; token: string };
type Database = {
  exec(sql: string): void;
  prepare(sql: string): { all(...args: (string | number)[]): Row[]; run(...args: (string | number)[]): unknown };
  close(): void;
};

export function policyFingerprint(policy: SandboxPolicy) {
  const paths = (values: readonly string[]) => [...new Set(values.map((value) => value.toLowerCase()))].sort();
  return createHash("sha256")
    .update(
      JSON.stringify({
        read: paths(
          policy.backend.options.platform.kind === "windows" ? policy.backend.options.platform.readGrantPaths : [],
        ),
        write: paths(policy.filesystem.allowWrite),
        denyRead: paths(policy.filesystem.denyRead),
        denyWrite: paths(policy.filesystem.denyWrite),
        protected: [
          ...policy.backend.options.protectedDirectories,
          ...policy.backend.options.protectedFileNames,
        ].sort(),
        mandatorySearchDepth:
          policy.backend.options.platform.kind === "windows"
            ? policy.backend.options.platform.mandatorySearchDepth
            : undefined,
        // Mandatory workspace protection and proxy access are session-wide too.
        workspace: policy.workspacePath.toLowerCase(),
        allowNetwork: policy.network.allow === "all" ? "all" : paths(policy.network.allow),
        denyNetwork: paths(policy.network.deny),
      }),
    )
    .digest("hex");
}

/** Windows SRT grants ACLs to one machine account. Never union different live policies. */
export function acquirePolicyLease(filename: string, fingerprint: string, recoverStale: (pid: number) => void) {
  // Node's built-in SQLite supplies cross-process transactions without a native npm addon.
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
    DatabaseSync: new (path: string) => Database;
  };
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  const token = randomUUID();
  let released = false;
  try {
    db.exec(
      "PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS leases (pid INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL, token TEXT NOT NULL)",
    );
    db.exec("BEGIN IMMEDIATE");
    for (const row of db.prepare("SELECT pid, fingerprint, token FROM leases").all()) {
      let alive = true;
      try {
        process.kill(row.pid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
      }
      if (!alive) {
        // A dead launcher may still have ACL records. Reconcile them before admission.
        // A failed recovery rolls back the transaction and retains the blocking record.
        recoverStale(row.pid);
        db.prepare("DELETE FROM leases WHERE pid = ? AND token = ?").run(row.pid, row.token);
      } else if (row.fingerprint !== fingerprint)
        throw new Error(
          "其他 Windows 沙箱会话正在使用不同的文件或网络范围，请结束该会话后重试。同一策略的主、子 Agent 可以并行执行。",
        );
    }
    db.prepare("INSERT INTO leases (pid, fingerprint, token) VALUES (?, ?, ?)").run(process.pid, fingerprint, token);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* transaction may not have started */
    }
    db.close();
    throw error;
  }
  return () => {
    if (released) return;
    // Call only after SRT reset completed; a failed cleanup intentionally keeps the lease.
    db.prepare("DELETE FROM leases WHERE pid = ? AND token = ?").run(process.pid, token);
    db.close();
    released = true;
  };
}
