import { useEffect, useState } from "react";
import type { ExtensionUIContext } from "@isle/extension-sdk/ui";
import { readProfiles, type Profile } from "./profiles";

const styles = `
*{box-sizing:border-box}body{margin:0;color:var(--foreground);background:var(--background);font:13px/1.6 system-ui}
button,input,textarea,select{font:inherit;color:inherit}button{cursor:pointer;padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--background)}button:hover{background:var(--accent)}button:disabled{opacity:.5;cursor:default}
input,textarea,select{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--background)}textarea{resize:vertical;min-height:85px}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
main{max-width:800px;margin:auto;padding:20px;display:grid;gap:18px}h2,h3,p{margin:0}.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.row h2,.row h3{flex:1}.muted,small{color:var(--muted-foreground)}fieldset{min-width:0;margin:0;padding:0;border:0;display:grid;gap:16px}.card{border:1px solid var(--border);border-radius:12px;padding:16px;display:grid;gap:12px}label{display:grid;gap:5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.primary{background:var(--primary);color:var(--primary-foreground)}.primary:hover{background:var(--primary)}footer{position:sticky;bottom:0;background:var(--background);padding:12px 0;border-top:1px solid var(--border)}.error{color:var(--destructive)}@media(max-width:520px){.grid{grid-template-columns:1fr}main{padding:12px}}
`;
export function Editor({ context }: { context: ExtensionUIContext }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    context.host.configuration
      .read({ signal: context.signal })
      .then((config) => {
        if (active) setProfiles(readProfiles(config));
      })
      .catch((error) => {
        if (active) setError(String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [context]);
  const change = (value: Profile[]) => {
    setProfiles(value);
    setSaved(false);
  };
  const replace = (profile: Profile) =>
    change(profiles.map((item) => (item.id === profile.id ? profile : item)));
  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const validated = readProfiles({ profiles });
      await context.host.configuration.write(
        { profiles: validated },
        { signal: context.signal },
      );
      if (!context.signal.aborted) {
        setProfiles(validated);
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
          <h2>智能判断</h2>
          <p className="muted">
            使用当前会话的模型做选择、评分或是非判断。保存后，在聊天中输入
            /，按模板名称选择。
          </p>
        </div>
        <p className="muted">
          置信度为模型自评，未经统计校准。低于阈值时标记为“需复核”；材料不足时允许弃答。结果不会自动执行任何业务操作。
        </p>
        {loading && <p role="status">正在读取模板…</p>}
        <fieldset disabled={loading || saving}>
          {profiles.map((profile) => (
            <section className="card" key={profile.id}>
              <div className="row">
                <h3>{profile.name || "新判断模板"}</h3>
                <button
                  onClick={() =>
                    change(profiles.filter((item) => item.id !== profile.id))
                  }
                >
                  删除模板
                </button>
              </div>
              <div className="grid">
                <label>
                  名称
                  <input
                    maxLength={64}
                    value={profile.name}
                    onChange={(event) =>
                      replace({ ...profile, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  判断类型
                  <select
                    value={profile.type}
                    onChange={(event) => {
                      const type = event.target.value as Profile["type"];
                      const common = {
                        id: profile.id,
                        name: profile.name,
                        instructions: profile.instructions,
                        threshold: profile.threshold,
                      };
                      replace(
                        type === "noul"
                          ? { ...common, type }
                          : {
                              ...common,
                              type,
                              choices:
                                profile.type === "noul"
                                  ? ["", ""]
                                  : profile.choices,
                            },
                      );
                    }}
                  >
                    <option value="choice">选择一个选项</option>
                    <option value="score">按档位评分</option>
                    <option value="noul">是 / 否</option>
                  </select>
                </label>
              </div>
              <label>
                判断要求
                <textarea
                  maxLength={8000}
                  value={profile.instructions}
                  onChange={(event) =>
                    replace({ ...profile, instructions: event.target.value })
                  }
                  placeholder="描述判断目标、依据以及何时应当弃答"
                />
              </label>
              {profile.type !== "noul" && (
                <label>
                  {profile.type === "score"
                    ? "评分档位（从低到高，每行一档，分值从 0 开始）"
                    : "可选项（每行一个）"}
                  <textarea
                    value={profile.choices.join("\n")}
                    onChange={(event) =>
                      replace({
                        ...profile,
                        choices: event.target.value.split("\n"),
                      })
                    }
                  />
                  <small>支持 2–10 项，每项最多 300 字。</small>
                </label>
              )}
              <label>
                需复核阈值
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={
                    Number.isNaN(profile.threshold) ? "" : profile.threshold
                  }
                  onChange={(event) =>
                    replace({
                      ...profile,
                      threshold: event.target.valueAsNumber,
                    })
                  }
                />
                <small>
                  自评置信度低于此值时提示人工复核，不更改模型给出的结果。
                </small>
              </label>
            </section>
          ))}
          {!loading && !profiles.length && (
            <p className="muted">
              还没有判断模板。添加一个模板即可创建对应的 / 命令。
            </p>
          )}
          <div>
            <button
              disabled={profiles.length >= 32}
              onClick={() =>
                change([
                  ...profiles,
                  {
                    id: `d${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
                    name: "",
                    instructions: "",
                    threshold: 0.7,
                    type: "noul",
                  },
                ])
              }
            >
              ＋ 添加判断模板
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
            disabled={loading || saving}
            onClick={save}
          >
            {saving ? "保存中…" : "保存模板"}
          </button>
          {saved && <span role="status">已保存，可在聊天中通过 / 引用</span>}
        </footer>
      </main>
    </>
  );
}
