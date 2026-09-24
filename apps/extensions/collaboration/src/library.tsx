import { useRef, useState, type ReactNode } from "react";
import type { Role } from "./roles";
import { avatarSource } from "./roles/avatars";
import type { Workflow } from "./workflows";

type Props = {
  flows: Workflow[];
  roles: Role[];
  ready: boolean;
  busy: boolean;
  error: string;
  openFlow(id?: string): void;
  openRole(id?: string): void;
  renderDelete(
    kind: "workflow" | "role",
    id: string,
    name: string,
    inUse: boolean,
  ): ReactNode;
};
export function Library({
  flows,
  roles,
  ready,
  busy,
  error,
  openFlow,
  openRole,
  renderDelete,
}: Props) {
  const [tab, setTab] = useState<"workflow" | "role">("workflow");
  const [query, setQuery] = useState("");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const needle = query.trim().toLocaleLowerCase();
  const visibleFlows = flows.filter((flow) =>
    [
      flow.name,
      flow.description,
      ...flow.steps.map(
        (step) => roles.find((role) => role.id === step.roleId)?.name || "",
      ),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle),
  );
  const visibleRoles = roles.filter((role) =>
    `${role.name} ${role.instructions}`.toLocaleLowerCase().includes(needle),
  );
  const changeTab = (value: "workflow" | "role") => {
    setTab(value);
    setQuery("");
  };
  return (
    <>
      <header className="library-heading">
        <div>
          <h2>角色协作</h2>
          <p className="meta">用角色分工，用流程串起每一步。</p>
        </div>
      </header>
      <nav className="tabs" role="tablist" aria-label="协作配置">
        {(["workflow", "role"] as const).map((value, index) => (
          <button
            key={value}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            id={`tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => changeTab(value)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const target =
                event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
              changeTab(target === 0 ? "workflow" : "role");
              tabs.current[target]?.focus();
            }}
          >
            {value === "workflow" ? "流程" : "角色"}
            <span className="count">
              {value === "workflow" ? flows.length : roles.length}
            </span>
          </button>
        ))}
      </nav>
      <section
        className="library-panel"
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        <div className="library-tools">
          <input
            type="search"
            aria-label={tab === "workflow" ? "搜索流程" : "搜索角色"}
            placeholder={
              tab === "workflow"
                ? "搜索流程名称、场景或角色"
                : "搜索角色名称或职责"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="primary"
            disabled={
              !ready ||
              busy ||
              (tab === "workflow"
                ? !roles.length || flows.length >= 32
                : roles.length >= 64)
            }
            onClick={() => (tab === "workflow" ? openFlow() : openRole())}
          >
            {tab === "workflow" ? "新建流程" : "添加角色"}
          </button>
        </div>
        <p className="meta library-caption">
          {tab === "workflow"
            ? "保存后，在聊天中输入 / 选择流程开始协作。"
            : "角色可被多个流程复用。点击角色编辑职责与头像。"}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {tab === "workflow" ? (
          <div className="flow-list">
            {visibleFlows.map((flow) => (
              <article className="flow-card" key={flow.id}>
                <button
                  className="flow-overview"
                  disabled={busy}
                  onClick={() => openFlow(flow.id)}
                  aria-label={`编辑流程：${flow.name}`}
                >
                  <span className="flow-title">
                    <strong>{flow.name}</strong>
                    <span className="count">{flow.steps.length} 步</span>
                  </span>
                  <span className="description">
                    {flow.description || "尚未填写适用场景"}
                  </span>
                  <span className="step-preview">
                    {flow.steps.slice(0, 4).map((step, index) => {
                      const role = roles.find(
                        (role) => role.id === step.roleId,
                      );
                      return (
                        <span className="preview-step" key={step.id}>
                          <span className="step-number">{index + 1}</span>
                          <span>
                            <span className="preview-name">{step.name}</span>
                            <span className="preview-role">
                              {role && (
                                <img
                                  width={16}
                                  height={16}
                                  src={avatarSource(role.avatar)}
                                  alt=""
                                />
                              )}
                              {role?.name || "角色已删除"}
                            </span>
                          </span>
                        </span>
                      );
                    })}
                    {flow.steps.length > 4 && (
                      <span className="more-steps">
                        还有 {flow.steps.length - 4} 步
                      </span>
                    )}
                  </span>
                </button>
                <footer className="entry-actions">
                  <span className="meta">按步骤顺序执行</span>
                  {renderDelete("workflow", flow.id, flow.name, false)}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="role-list">
            {visibleRoles.map((role) => {
              const usedBy = flows.filter((flow) =>
                flow.steps.some((step) => step.roleId === role.id),
              );
              return (
                <article className="role-card" key={role.id}>
                  <button
                    className="role-overview"
                    disabled={busy}
                    onClick={() => openRole(role.id)}
                    aria-label={`编辑角色：${role.name}`}
                  >
                    <img
                      className="role-avatar"
                      width={40}
                      height={40}
                      src={avatarSource(role.avatar)}
                      alt=""
                    />
                    <span className="role-copy">
                      <strong>{role.name}</strong>
                      <span className="description">{role.instructions}</span>
                    </span>
                  </button>
                  <footer className="entry-actions">
                    <div className="usage">
                      <span className="meta">
                        {usedBy.length ? "用于" : "尚未用于流程"}
                      </span>
                      {usedBy.slice(0, 2).map((flow) => (
                        <button
                          className="text-link"
                          disabled={busy}
                          key={flow.id}
                          onClick={() => openFlow(flow.id)}
                        >
                          {flow.name}
                        </button>
                      ))}
                      {usedBy.length > 2 && (
                        <span className="meta">等 {usedBy.length} 个流程</span>
                      )}
                    </div>
                    {renderDelete(
                      "role",
                      role.id,
                      role.name,
                      usedBy.length > 0,
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
        {ready &&
          !(tab === "workflow" ? visibleFlows.length : visibleRoles.length) && (
            <div className="empty-state">
              <h3>
                {needle
                  ? "没有找到匹配项"
                  : tab === "role"
                    ? "为协作添加第一位角色"
                    : roles.length
                      ? "把角色串成一个流程"
                      : "先从一位协作角色开始"}
              </h3>
              <p className="meta">
                {needle
                  ? "试试其他关键词，或清空搜索查看全部。"
                  : tab === "role" || !roles.length
                    ? "定义角色负责什么，再将它安排到流程步骤中。"
                    : "为每一步选择角色和任务，保存后就能在聊天中调用。"}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  needle
                    ? setQuery("")
                    : tab === "role" || !roles.length
                      ? openRole()
                      : openFlow()
                }
              >
                {needle
                  ? "清空搜索"
                  : tab === "role" || !roles.length
                    ? "添加角色"
                    : "新建流程"}
              </button>
            </div>
          )}
      </section>
    </>
  );
}
