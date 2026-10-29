import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useMemo, useState } from "react";
import {
  contentKindNames,
  type ContentKind,
  type ContentLocation,
} from "../../../shared/content";
import {
  contentIssueLocation,
  projectContent,
  searchContent,
} from "../content";
import { validateDesign } from "../document";
import type { DesignModel } from "../model";

export function ContentLibrary({
  model,
  active,
  open,
  extraReferences,
}: {
  model: DesignModel;
  active: boolean;
  open(location: ContentLocation): void;
  extraReferences?(id: string): string[];
}) {
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState<ContentKind | "all">("all"),
    [selected, setSelected] = useState("");
  const index = useMemo(() => projectContent(model), [model]);
  const checks = useMemo(
    () =>
      validateDesign(model).map((issue) => ({
        ...issue,
        location: contentIssueLocation(index, issue, model),
      })),
    [model, index],
  );
  const kinds = [...new Set(index.items.map((item) => item.kind))];
  const currentKind = kind === "all" || kinds.includes(kind) ? kind : "all";
  const visible = searchContent(index, query, currentKind),
    item = visible.find((item) => item.key === selected) ?? visible[0];
  const byKey = new Map(index.items.map((item) => [item.key, item]));
  const incoming = index.references.filter((ref) => ref.to === item?.key);
  const outgoing = index.references.filter((ref) => ref.from === item?.key);
  const external =
    item && ["state", "capability", "action"].includes(item.kind)
      ? (extraReferences?.(item.id) ?? [])
      : [];
  if (!active) return null;
  return (
    <section className="page-content content-library">
      <div className="page-heading">
        <div>
          <h1>内容目录</h1>
          <p>查找草稿中的定义与规则，查看使用位置并定位编辑。</p>
        </div>
      </div>
      <details className="content-checks" open={checks.length > 0}>
        <summary>
          内容检查：{checks.length ? `${checks.length} 项待修复` : "通过"}
        </summary>
        <p className="hint">
          检查当前草稿的完整性与引用。开始试玩还需通过策划概览中的玩法框架、模拟器和场景检查。
        </p>
        {!!checks.length && (
          <ul>
            {checks.map((issue, i) => (
              <li key={`${issue.path}:${i}`}>
                <span>
                  <strong>
                    {index.items.find((item) => item.key === issue.location.key)
                      ?.name ?? issue.path}
                  </strong>{" "}
                  · {issue.message}
                </span>
                <button
                  className="text-button"
                  onClick={() => open(issue.location)}
                >
                  去修复
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
      <div className="content-filters">
        <label className="form-field">
          搜索内容
          <input
            type="search"
            aria-label="搜索内容"
            placeholder="名称、说明或标识"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="form-field">
          内容类型
          <NativeSelect
            size="sm"
            aria-label="内容类型"
            value={currentKind}
            onChange={(event) =>
              setKind(event.target.value as ContentKind | "all")
            }
          >
            <NativeSelectOption value="all">全部类型</NativeSelectOption>
            {kinds.map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {contentKindNames[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <p role="status">
          显示 {visible.length} / {index.items.length} 项
        </p>
      </div>
      <div className="content-browser">
        <nav className="content-list" aria-label="草稿内容">
          {visible.map((entry) => (
            <button
              key={entry.key}
              className={item?.key === entry.key ? "selected" : ""}
              aria-pressed={item?.key === entry.key}
              onClick={() => setSelected(entry.key)}
            >
              <span>
                <strong>{entry.name}</strong>
                <small>{entry.description || "尚未填写说明"}</small>
              </span>
              <span>{contentKindNames[entry.kind]}</span>
            </button>
          ))}
          {!visible.length && (
            <p className="hint">没有匹配的内容，可清空搜索或切换类型。</p>
          )}
        </nav>
        {item && (
          <section
            className="settings-section content-detail"
            aria-label="内容详情"
          >
            <div className="section-title">
              <div>
                <small>{contentKindNames[item.kind]}</small>
                <h2>{item.name}</h2>
              </div>
              <button className="button" onClick={() => open(item.location)}>
                打开编辑
              </button>
            </div>
            <p>{item.description || "尚未填写说明。"}</p>
            <p className="hint">
              标识：<code>{item.id}</code>
            </p>
            {checks
              .filter((check) => check.location.key === item.key)
              .map((check, i) => (
                <p className="form-error" key={i}>
                  {check.message}
                </p>
              ))}
            <h3>使用位置 · {incoming.length} 处</h3>
            {!incoming.length && (
              <p className="hint">当前草稿没有其他内容引用此项。</p>
            )}
            <ul>
              {incoming.map((ref, i) => {
                const owner = byKey.get(ref.from);
                return (
                  <li key={i}>
                    {owner && (
                      <button
                        className="content-reference"
                        onClick={() => open(owner.location)}
                      >
                        <strong>{owner.name}</strong>
                        <span>{ref.label}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <h3>依赖内容 · {outgoing.length} 处</h3>
            {!outgoing.length && (
              <p className="hint">此项没有引用其他草稿内容。</p>
            )}
            <ul>
              {outgoing.map((ref, i) => {
                const target = byKey.get(ref.to);
                return (
                  <li key={i}>
                    {target ? (
                      <button
                        className="content-reference"
                        onClick={() => open(target.location)}
                      >
                        <strong>{target.name}</strong>
                        <span>{ref.label}</span>
                      </button>
                    ) : (
                      <p className="form-error">
                        {ref.label} · 引用不存在：{ref.to}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {!!external.length && (
              <>
                <h3>场景与自动玩家引用 · {external.length} 处</h3>
                <ul>
                  {external.map((ref) => (
                    <li key={ref}>{ref}</li>
                  ))}
                </ul>
                <button
                  className="text-button"
                  onClick={() => open({ area: "strategy", id: "", key: "" })}
                >
                  前往策略与场景检查
                </button>
              </>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
