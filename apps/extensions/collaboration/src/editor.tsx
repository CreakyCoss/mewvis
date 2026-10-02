import { useEffect, useRef, useState } from "react";
import type { ExtensionUIContext } from "@mewvis/extension-sdk/ui";
import type { JsonObject } from "@mewvis/extension-sdk";
import { roles as readRoles, type Role } from "./roles";
import { RoleEditor } from "./roles/editor";
import { Library } from "./library";
import { workflows, type Workflow } from "./workflows";
import { WorkflowEditor } from "./workflow-editor";
import { styles } from "./styles";
const id = () => `f${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

export function Editor({ context }: { context: ExtensionUIContext }) {
  const kind =
    context.viewId === "role-editor"
      ? "role"
      : context.viewId === "workflow-editor"
        ? "workflow"
        : null;
  const [flows, setFlows] = useState<Workflow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [flow, setFlow] = useState<Workflow | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "role" | "workflow";
    id: string;
  } | null>(null);
  const deleteButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!pendingDelete) return;
    const reset = () => setPendingDelete(null);
    const outside = (event: PointerEvent) => {
      if (!deleteButton.current?.contains(event.target as Node)) reset();
    };
    // Mouse clicks do not focus buttons in every desktop webview. Also handle
    // clicks on non-focusable content and focus leaving the plugin iframe.
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", reset);
    };
  }, [pendingDelete]);
  const existing = typeof context.input.id === "string";
  const load = async () => {
    const config = await context.host.configuration.read({
      signal: context.signal,
    });
    const nextRoles = readRoles(config),
      nextFlows = workflows(config);
    if (context.signal.aborted) return;
    setRoles(nextRoles);
    setFlows(nextFlows);
    if (kind === "role") {
      const value = existing
        ? nextRoles.find((item) => item.id === context.input.id)
        : { id: id(), name: "", instructions: "", avatar: "compass" as const };
      if (!value) throw new Error("角色已不存在，请关闭后重试");
      setRole(value);
    }
    if (kind === "workflow") {
      const value = existing
        ? nextFlows.find((item) => item.id === context.input.id)
        : { id: id(), name: "", description: "", steps: [] };
      if (!value) throw new Error("流程已不存在，请关闭后重试");
      setFlow(value);
    }
    setReady(true);
  };
  useEffect(() => {
    void load().catch((e) => {
      if (!context.signal.aborted) setError(String(e));
    });
  }, [context]);
  const open = async (view: string, itemId?: string) => {
    setBusy(true);
    setError("");
    try {
      await context.ui.dialog.open({
        id: view,
        input: itemId ? { id: itemId } : {},
      });
      await load();
    } catch (e) {
      if (!context.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!context.signal.aborted) setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      // Read again so editing one item preserves other configuration changes.
      const latest = await context.host.configuration.read({
        signal: context.signal,
      });
      let nextRoles = readRoles(latest),
        nextFlows = workflows(latest);
      if (role) {
        if (existing && !nextRoles.some((item) => item.id === role.id))
          throw new Error("角色已不存在，请关闭后重试");
        nextRoles = existing
          ? nextRoles.map((item) => (item.id === role.id ? role : item))
          : [...nextRoles, role];
      }
      if (flow) {
        if (existing && !nextFlows.some((item) => item.id === flow.id))
          throw new Error("流程已不存在，请关闭后重试");
        nextFlows = existing
          ? nextFlows.map((item) => (item.id === flow.id ? flow : item))
          : [...nextFlows, flow];
      }
      const config = JSON.parse(
        JSON.stringify({ roles: nextRoles, workflows: nextFlows }),
      ) as JsonObject;
      readRoles(config);
      workflows(config);
      if (
        nextFlows.some((item) =>
          item.steps.some(
            (step) => !nextRoles.some((item) => item.id === step.roleId),
          ),
        )
      )
        throw new Error("部分角色已不存在，请重新选择");
      await context.host.configuration.write(config, {
        signal: context.signal,
      });
      context.ui.dialog.close();
    } catch (e) {
      if (!context.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!context.signal.aborted) setBusy(false);
    }
  };
  const remove = async (kind: "role" | "workflow", id: string) => {
    if (pendingDelete?.kind !== kind || pendingDelete.id !== id) {
      setPendingDelete({ kind, id });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const config = await context.host.configuration.read({
        signal: context.signal,
      });
      let currentRoles = readRoles(config),
        currentFlows = workflows(config);
      if (kind === "role") {
        if (
          currentFlows.some((flow) =>
            flow.steps.some((step) => step.roleId === id),
          )
        )
          throw new Error("此角色正在被流程引用，移除引用后才能删除");
        currentRoles = currentRoles.filter((item) => item.id !== id);
      } else currentFlows = currentFlows.filter((item) => item.id !== id);
      await context.host.configuration.write(
        JSON.parse(
          JSON.stringify({ roles: currentRoles, workflows: currentFlows }),
        ) as JsonObject,
        { signal: context.signal },
      );
      await load();
    } catch (e) {
      if (!context.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!context.signal.aborted) {
        setBusy(false);
        setPendingDelete(null);
      }
    }
  };
  return (
    <>
      <style>{styles}</style>
      <main className={kind ? "editor dialog-editor" : "editor library-editor"}>
        {!ready && !error && <p role="status">正在读取配置…</p>}
        {kind ? (
          <>
            <fieldset className="form" disabled={!ready || busy}>
              {role && (
                <RoleEditor
                  role={role}
                  onChange={(value) => setRole({ ...role, ...value })}
                />
              )}
              {flow && (
                <WorkflowEditor
                  flow={flow}
                  roles={roles}
                  onChange={(value) => setFlow({ ...flow, ...value })}
                />
              )}
            </fieldset>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <footer className="toolbar">
              <span className="meta spacer">保存后，下次执行生效</span>
              <button disabled={busy} onClick={() => context.ui.dialog.close()}>
                取消
              </button>
              <button
                className="primary"
                disabled={!ready || busy}
                onClick={() => void save()}
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </footer>
          </>
        ) : (
          <Library
            flows={flows}
            roles={roles}
            ready={ready}
            busy={busy}
            error={error}
            openFlow={(id) => void open("workflow-editor", id)}
            openRole={(id) => void open("role-editor", id)}
            renderDelete={(kind, itemId, name, inUse) => {
              const pending =
                pendingDelete?.kind === kind && pendingDelete.id === itemId;
              return (
                <button
                  className={pending ? "delete error" : "delete"}
                  aria-label={`${pending ? "确认删除" : "删除"}${kind === "role" ? "角色" : "流程"}：${name}`}
                  disabled={busy || inUse}
                  title={
                    inUse
                      ? "此角色正在被流程引用，移除引用后才能删除"
                      : undefined
                  }
                  onBlur={() => setPendingDelete(null)}
                  onClick={(event) => {
                    deleteButton.current = event.currentTarget;
                    event.currentTarget.focus();
                    void remove(kind, itemId);
                  }}
                >
                  {pending ? "确认" : "删除"}
                </button>
              );
            }}
          />
        )}
      </main>
    </>
  );
}
