import { useEffect, useState } from "react";
import type { ExtensionUIContext } from "@isle/extension-sdk/ui";
import { roles as readRoles, type Role } from "./roles";
import { RoleEditor } from "./roles/editor";
import { avatarSource } from "./roles/avatars";
import type { JsonObject } from "@isle/extension-sdk";
import { workflows, type Workflow, type Step } from "./workflows";
const id = () => `f${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
const styles = `
.avatar-option{padding:3px!important}.avatar-option[aria-pressed="true"]{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}.avatar-option img{display:block}

*{box-sizing:border-box}body{margin:0;color:var(--foreground);background:var(--background);font:13px/1.6 system-ui}button,input,textarea,select{font:inherit;color:inherit}button{cursor:pointer;border:1px solid var(--border);border-radius:7px;padding:5px 10px;background:var(--background)}button:hover{background:var(--accent)}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--primary);outline-offset:2px}input,textarea,select{width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:var(--background)}textarea{resize:vertical;min-height:70px}h2,h3,p{margin:0}label{display:block;font-weight:500}label>input,label>textarea,label>select{display:block;margin-top:5px}small{color:var(--muted-foreground)}.editor{padding:16px;display:grid;gap:16px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row h2,.row h3{flex:1}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{border:1px solid var(--border);border-radius:10px;padding:14px;display:grid;gap:12px}.steps{display:grid;gap:10px}.step{padding:12px;border-radius:8px;background:var(--muted);display:grid;gap:10px}.primary{background:var(--primary);color:var(--primary-foreground)}.primary:hover{background:var(--primary)}.error{color:var(--destructive)}.empty{padding:35px 16px;text-align:center;border:1px dashed var(--border);border-radius:10px}.toolbar{position:sticky;bottom:0;padding:12px 0;background:var(--background);border-top:1px solid var(--border)}@media(max-width:520px){.grid{grid-template-columns:1fr}}
`;
export function Editor({ context }: { context: ExtensionUIContext }) {
  const [flows, setFlows] = useState<Workflow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const config = await context.host.configuration.read({
        signal: context.signal,
      });
      if (active) {
        setRoles(readRoles(config));
        setFlows(workflows(config));
      }
    })()
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [context]);
  const change = (value: Workflow[]) => {
    setFlows(value);
    setSaved(false);
  };
  const patch = (flowId: string, value: Partial<Workflow>) =>
    change(flows.map((f) => (f.id === flowId ? { ...f, ...value } : f)));
  const patchStep = (flow: Workflow, stepId: string, value: Partial<Step>) =>
    patch(flow.id, {
      steps: flow.steps.map((s) => (s.id === stepId ? { ...s, ...value } : s)),
    });
  const move = (flow: Workflow, index: number, delta: number) => {
    const steps = [...flow.steps];
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    patch(flow.id, { steps });
  };
  const save = async () => {
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      const config = { roles, workflows: flows } as unknown as JsonObject;
      readRoles(config);
      workflows(config);
      if (
        flows.some((f) =>
          f.steps.some((s) => !roles.some((r) => r.id === s.roleId)),
        )
      )
        throw new Error("部分插件角色已不存在，请重新选择");
      await context.host.configuration.write(config, {
        signal: context.signal,
      });
      setSaved(true);
    } catch (e) {
      if (!context.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <style>{styles}</style>
      <main className="editor">
        <fieldset
          disabled={loading || saving}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <RoleEditor
            roles={roles}
            usedRoleIds={
              new Set(
                flows.flatMap((flow) => flow.steps.map((step) => step.roleId)),
              )
            }
            onChange={(roles) => {
              setRoles(roles);
              setSaved(false);
            }}
          />
        </fieldset>
        <div className="row">
          <h2>角色协作流程</h2>
          <button
            disabled={loading || saving || flows.length >= 32}
            onClick={() =>
              change([
                ...flows,
                { id: id(), name: "", description: "", steps: [] },
              ])
            }
          >
            ＋ 新建流程
          </button>
        </div>
        <p>
          <small>
            按顺序执行自定义步骤。保存后，在聊天中输入 /
            选择流程；模型也可按流程描述决定调用。每次执行使用独立配置快照。
          </small>
        </p>
        {loading ? (
          <p role="status">正在读取配置…</p>
        ) : !roles.length ? (
          <p>请先添加协作角色，再配置流程。</p>
        ) : null}
        {!loading && !flows.length ? (
          <div className="empty">还没有流程。点击“新建流程”开始配置。</div>
        ) : null}
        <fieldset
          disabled={loading || saving}
          style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 16 }}
        >
          {flows.map((flow) => (
            <section key={flow.id} className="card">
              <div className="row">
                <h3>{flow.name || "新流程"}</h3>
                <button
                  onClick={() => change(flows.filter((f) => f.id !== flow.id))}
                >
                  删除流程
                </button>
              </div>
              <label>
                流程名称
                <input
                  maxLength={64}
                  value={flow.name}
                  onChange={(e) => patch(flow.id, { name: e.target.value })}
                  placeholder="例如：方案设计与评审"
                />
              </label>
              <label>
                适用场景
                <textarea
                  maxLength={2000}
                  value={flow.description}
                  onChange={(e) =>
                    patch(flow.id, { description: e.target.value })
                  }
                  placeholder="告诉模型什么任务适合调用这个流程"
                />
              </label>
              <div className="steps">
                {flow.steps.map((step, index) => (
                  <article className="step" key={step.id}>
                    <div className="row">
                      <h3>步骤 {index + 1}</h3>
                      <button
                        aria-label="上移步骤"
                        disabled={!index}
                        onClick={() => move(flow, index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label="下移步骤"
                        disabled={index === flow.steps.length - 1}
                        onClick={() => move(flow, index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        onClick={() =>
                          patch(flow.id, {
                            steps: flow.steps.filter((s) => s.id !== step.id),
                          })
                        }
                      >
                        删除步骤
                      </button>
                    </div>
                    <div className="grid">
                      <label>
                        步骤名称
                        <input
                          maxLength={64}
                          value={step.name}
                          onChange={(e) =>
                            patchStep(flow, step.id, { name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        执行角色
                        <select
                          value={step.roleId}
                          onChange={(e) =>
                            patchStep(flow, step.id, { roleId: e.target.value })
                          }
                        >
                          <option value="">请选择角色</option>
                          {step.roleId &&
                          !roles.some((r) => r.id === step.roleId) ? (
                            <option value={step.roleId}>插件角色已删除</option>
                          ) : null}
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name || "未命名角色"}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {roles.find((role) => role.id === step.roleId) ? (
                      <div className="row">
                        <img
                          width={24}
                          height={24}
                          src={avatarSource(
                            roles.find((role) => role.id === step.roleId)!
                              .avatar,
                          )}
                          alt=""
                        />
                        <small>
                          {roles.find((role) => role.id === step.roleId)!.name}
                        </small>
                      </div>
                    ) : null}
                    <label>
                      任务说明
                      <textarea
                        maxLength={8000}
                        value={step.instruction}
                        onChange={(e) =>
                          patchStep(flow, step.id, {
                            instruction: e.target.value,
                          })
                        }
                        placeholder="这个角色在本步骤需要完成什么"
                      />
                    </label>
                    <label>
                      前序结果
                      <select
                        value={step.input}
                        onChange={(e) =>
                          patchStep(flow, step.id, {
                            input: e.target.value as Step["input"],
                          })
                        }
                      >
                        <option value="original">仅使用原始任务</option>
                        <option value="previous">附加上一步结果</option>
                        <option value="all">附加全部前序结果</option>
                      </select>
                    </label>
                  </article>
                ))}
              </div>
              <button
                disabled={!roles.length || flow.steps.length >= 32}
                onClick={() =>
                  patch(flow.id, {
                    steps: [
                      ...flow.steps,
                      {
                        id: id(),
                        name: "",
                        roleId: "",
                        instruction: "",
                        input: "previous",
                      },
                    ],
                  })
                }
              >
                ＋ 添加步骤
              </button>
              <small>命令：/isle.collaboration/{flow.id} 你的任务</small>
            </section>
          ))}
        </fieldset>
        <div className="toolbar">
          <div className="row">
            <button
              className="primary"
              disabled={loading || saving}
              onClick={() => void save()}
            >
              {saving ? "保存中…" : "保存角色与流程"}
            </button>
            {saved ? <span role="status">已保存，下一次执行生效</span> : null}
          </div>
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}
