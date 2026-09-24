import { useRef, useState, type ReactNode } from "react";
import { builtinRules } from "./builtins";
import type { Rule } from "./rules";

export function Library({
  rules,
  ready,
  busy,
  error,
  open,
  renderDelete,
}: {
  rules: Rule[];
  ready: boolean;
  busy: boolean;
  error: string;
  open(id?: string): void;
  renderDelete(rule: Rule): ReactNode;
}) {
  const [tab, setTab] = useState<"custom" | "builtin">("custom");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      <header className="library-heading">
        <h2>智能判断标准</h2>
        <p className="meta">
          优先匹配自定义规则，其次使用内置规则，没有适用规则时进行通用判断。
        </p>
      </header>
      <div className="tabs" role="tablist" aria-label="判断规则">
        {(["custom", "builtin"] as const).map((value, index) => (
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
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const target =
                event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
              setTab(target === 0 ? "custom" : "builtin");
              tabs.current[target]?.focus();
            }}
          >
            {value === "custom" ? "自定义规则" : "内置规则"}
            <span className="count">
              {value === "custom" ? rules.length : builtinRules.length}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <section
        className="section"
        role="tabpanel"
        id="panel-custom"
        aria-labelledby="tab-custom"
        hidden={tab !== "custom"}
      >
        <div className="library-tools">
          <p className="meta">为特定场景制定判断标准，点击规则名称可编辑。</p>
          <button
            className="primary"
            disabled={!ready || busy || rules.length >= 32}
            onClick={() => open()}
          >
            添加规则
          </button>
        </div>
        <ul className="rule-list">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              edit={
                <button
                  className="rule-title"
                  disabled={busy}
                  aria-label={`编辑规则：${rule.name}`}
                  onClick={() => open(rule.id)}
                >
                  {rule.name}
                </button>
              }
              actions={renderDelete(rule)}
            />
          ))}
        </ul>
        {ready && !rules.length && (
          <div className="empty-state">
            <h3>还没有自定义规则</h3>
            <p className="meta">
              当前会自动使用内置规则和通用判断。需要特定标准时，可添加自己的规则。
            </p>
          </div>
        )}
      </section>
      <section
        className="section"
        role="tabpanel"
        id="panel-builtin"
        aria-labelledby="tab-builtin"
        hidden={tab !== "builtin"}
      >
        <p className="meta">
          未命中自定义规则时自动匹配以下规则，内容仅供查看。
        </p>
        <ul className="rule-list">
          {builtinRules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </ul>
      </section>
    </>
  );
}

/** Both rule sources share the same content and layout; only custom rules have actions. */
function RuleCard({
  rule,
  edit,
  actions,
}: {
  rule: Rule;
  edit?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="rule-card">
      <div className="rule-heading">
        <h3>{edit ?? rule.name}</h3>
        {actions}
      </div>
      <dl className="rule-details">
        <div>
          <dt>适用条件</dt>
          <dd>{rule.when}</dd>
        </div>
        <div>
          <dt>判断标准</dt>
          <dd>{rule.instructions}</dd>
        </div>
      </dl>
      <p className="meta">
        {rule.enabled ? "已启用" : "已停用"} · 优先级 {rule.priority} · 复核阈值{" "}
        {rule.threshold}
      </p>
    </li>
  );
}
