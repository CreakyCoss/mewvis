import { useEffect, useState } from "react";
import type { ExtensionUIContext } from "@isle/extension-sdk/ui";
import { readRules, type Rule } from "./rules";
import { builtinRules } from "./builtins";

const styles = `
*{box-sizing:border-box}body{margin:0;color:var(--foreground);background:var(--background);font:13px/1.6 system-ui}
button,input,textarea,select{font:inherit;color:inherit}button{cursor:pointer;padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--background)}button:hover{background:var(--accent)}button:disabled{opacity:.5;cursor:default}
input,textarea,select{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--background)}textarea{resize:vertical;min-height:85px}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
main{max-width:800px;margin:auto;padding:20px;display:grid;gap:18px}h2,h3,p{margin:0}.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.row h2,.row h3{flex:1}.muted,small{color:var(--muted-foreground)}fieldset{min-width:0;margin:0;padding:0;border:0;display:grid;gap:16px}.card{border:1px solid var(--border);border-radius:12px;padding:16px;display:grid;gap:12px}label{display:grid;gap:5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.primary{background:var(--primary);color:var(--primary-foreground)}.primary:hover{background:var(--primary)}footer{position:sticky;bottom:0;background:var(--background);padding:12px 0;border-top:1px solid var(--border)}.error{color:var(--destructive)}@media(max-width:520px){.grid{grid-template-columns:1fr}main{padding:12px}}
`;
export function Editor({ context }: { context: ExtensionUIContext }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    context.host.configuration
      .read({ signal: context.signal })
      .then((value) => {
        if (active) {
          setRules(readRules(value));
          setReady(true);
        }
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [context]);
  const change = (value: Rule[]) => {
    setRules(value);
    setSaved(false);
  };
  const patch = (id: string, value: Partial<Rule>) =>
    change(
      rules.map((rule) => (rule.id === id ? { ...rule, ...value } : rule)),
    );
  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const value = readRules({ rules });
      await context.host.configuration.write(
        { rules: value },
        { signal: context.signal },
      );
      if (!context.signal.aborted) {
        setRules(value);
        setSaved(true);
      }
    } catch (error) {
      if (!context.signal.aborted)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (!context.signal.aborted) setSaving(false);
    }
  };
  return (
    <>
      <style>{styles}</style>
      <main>
        <div>
          <h2>智能判断标准</h2>
          <p className="muted">
            自定义规则优先，其次是内置规则，没有适用规则时使用通用判断。调用方只需提供材料、问题和输出约束。
          </p>
        </div>
        <section className="card">
          <h3>内置规则</h3>
          <p>{builtinRules.map((rule) => rule.name).join(" · ")}</p>
          <small>
            系统自动匹配，无需手动选择。没有自定义规则也可以直接使用判断能力和 /
            快捷命令。
          </small>
        </section>
        {!ready && !error && <p role="status">正在读取规则…</p>}
        <fieldset disabled={!ready || saving}>
          {rules.map((rule) => (
            <section className="card" key={rule.id}>
              <div className="row">
                <h3>{rule.name || "新规则"}</h3>
                <button
                  onClick={() =>
                    change(rules.filter((item) => item.id !== rule.id))
                  }
                >
                  删除规则
                </button>
              </div>
              <div className="grid">
                <label>
                  名称
                  <input
                    maxLength={64}
                    value={rule.name}
                    onChange={(e) => patch(rule.id, { name: e.target.value })}
                  />
                </label>
                <label>
                  状态
                  <select
                    value={String(rule.enabled)}
                    onChange={(e) =>
                      patch(rule.id, { enabled: e.target.value === "true" })
                    }
                  >
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </label>
              </div>
              <label>
                适用条件
                <textarea
                  maxLength={1000}
                  value={rule.when}
                  onChange={(e) => patch(rule.id, { when: e.target.value })}
                  placeholder="例如：判断本项目的发布方案是否具备上线条件"
                />
                <small>
                  描述什么问题应该使用这条规则；不需要填写命令名或规则引用。
                </small>
              </label>
              <label>
                判断标准
                <textarea
                  maxLength={8000}
                  value={rule.instructions}
                  onChange={(e) =>
                    patch(rule.id, { instructions: e.target.value })
                  }
                  placeholder="例如：需明确回滚方案、测试结果和负责人；缺少关键证据时不能判定通过"
                />
              </label>
              <div className="grid">
                <label>
                  匹配优先级
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number.isNaN(rule.priority) ? "" : rule.priority}
                    onChange={(e) =>
                      patch(rule.id, { priority: e.target.valueAsNumber })
                    }
                  />
                  <small>多个规则适用时优先选择较高值（0–100）。</small>
                </label>
                <label>
                  需复核阈值
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={Number.isNaN(rule.threshold) ? "" : rule.threshold}
                    onChange={(e) =>
                      patch(rule.id, { threshold: e.target.valueAsNumber })
                    }
                  />
                  <small>模型自评低于此值时提示复核，不切换规则重判。</small>
                </label>
              </div>
            </section>
          ))}
          {ready && !rules.length && (
            <p className="muted">
              尚无自定义规则，当前使用内置规则和通用判断。
            </p>
          )}
          <div>
            <button
              disabled={rules.length >= 32}
              onClick={() =>
                change([
                  ...rules,
                  {
                    id: `r${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                    name: "",
                    enabled: true,
                    priority: 0,
                    when: "",
                    instructions: "",
                    threshold: 0.7,
                  },
                ])
              }
            >
              ＋ 添加规则
            </button>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer className="row">
          <button
            className="primary"
            disabled={!ready || saving}
            onClick={save}
          >
            {saving ? "保存中…" : "保存规则"}
          </button>
          {saved && <span role="status">已保存，下次判断生效</span>}
        </footer>
      </main>
    </>
  );
}
