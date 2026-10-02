import { useEffect, useRef, useState } from "react";
import type { ExtensionUIContext } from "@mewvis/extension-sdk/ui";
import { readRules, type Rule } from "./rules";
import { Library } from "./library";
import { RuleEditor } from "./rule-editor";
import { styles } from "./styles";

export function Editor({ context }: { context: ExtensionUIContext }) {
  const editing = context.viewId === "rule-editor";
  const existing = typeof context.input.id === "string";
  const [rules, setRules] = useState<Rule[]>([]);
  const [rule, setRule] = useState<Rule | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string } | null>(
    null,
  );
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
  const load = async () => {
    const value = readRules(
      await context.host.configuration.read({ signal: context.signal }),
    );
    if (context.signal.aborted) return;
    setRules(value);
    if (editing) {
      const draft = existing
        ? value.find((item) => item.id === context.input.id)
        : {
            id: `r${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
            name: "",
            enabled: true,
            priority: 0,
            when: "",
            instructions: "",
            threshold: 0.7,
          };
      if (!draft) throw new Error("规则已不存在，请关闭后重试");
      setRule(draft);
    }
    setReady(true);
  };
  useEffect(() => {
    void load().catch((e) => {
      if (!context.signal.aborted) setError(String(e));
    });
  }, [context]);
  const open = async (id?: string) => {
    setBusy(true);
    setError("");
    try {
      await context.ui.dialog.open({
        id: "rule-editor",
        input: id ? { id } : {},
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
    if (!rule) return;
    setBusy(true);
    setError("");
    try {
      const latest = readRules(
        await context.host.configuration.read({ signal: context.signal }),
      );
      if (existing && !latest.some((item) => item.id === rule.id))
        throw new Error("规则已不存在，请关闭后重试");
      const next = existing
        ? latest.map((item) => (item.id === rule.id ? rule : item))
        : [...latest, rule];
      await context.host.configuration.write(
        { rules: readRules({ rules: next }) },
        { signal: context.signal },
      );
      context.ui.dialog.close();
    } catch (e) {
      if (!context.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!context.signal.aborted) setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (pendingDelete?.id !== id) {
      setPendingDelete({ id });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const latest = readRules(
        await context.host.configuration.read({ signal: context.signal }),
      );
      await context.host.configuration.write(
        { rules: latest.filter((item) => item.id !== id) },
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
      <main className={editing ? "dialog-editor" : undefined}>
        {!ready && !error && <p role="status">正在读取规则…</p>}
        {editing ? (
          <>
            <fieldset disabled={!ready || busy}>
              {rule && (
                <RuleEditor
                  rule={rule}
                  onChange={(value) => setRule({ ...rule, ...value })}
                />
              )}
            </fieldset>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <footer className="toolbar">
              <span className="meta spacer">保存后，下次判断生效</span>
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
            rules={rules}
            ready={ready}
            busy={busy}
            error={error}
            open={(id) => void open(id)}
            renderDelete={(item) => (
              <button
                className={
                  pendingDelete?.id === item.id ? "delete error" : "delete"
                }
                aria-label={`${pendingDelete?.id === item.id ? "确认删除" : "删除"}规则：${item.name}`}
                disabled={busy}
                onBlur={() => setPendingDelete(null)}
                onClick={(event) => {
                  deleteButton.current = event.currentTarget;
                  event.currentTarget.focus();
                  void remove(item.id);
                }}
              >
                {pendingDelete?.id === item.id ? "确认" : "删除"}
              </button>
            )}
          />
        )}
      </main>
    </>
  );
}
