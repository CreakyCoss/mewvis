import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { type Effect, type Model } from "../model";
export const amount = (value: string, min = 0, max = 1_000_000) =>
  Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
export function EffectsEditor({
  model,
  effects,
  change,
  scoring = false,
  label,
}: {
  model: Model;
  effects: Effect[];
  change(effects: Effect[]): void;
  scoring?: boolean;
  label: string;
}) {
  const patch = (index: number, value: Effect) =>
    change(effects.map((e, i) => (i === index ? value : e)));
  const move = (index: number, offset: number) => {
    const next = [...effects];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change(next);
  };
  const options = (items: { id: string; name: string }[], value: string) => (
    <>
      {!items.some((i) => i.id === value) && (
        <NativeSelectOption value={value}>请选择定义</NativeSelectOption>
      )}
      {items.map((i) => (
        <NativeSelectOption key={i.id} value={i.id}>
          {i.name}
        </NativeSelectOption>
      ))}
    </>
  );
  return (
    <div className="effects-editor" aria-label={label}>
      {effects.map((e, i) => (
        <fieldset className="effect-fields" key={i}>
          <legend>
            {label} {i + 1} ·{" "}
            {e.type === "add"
              ? "增加数值"
              : e.type === "grant"
                ? "授予能力"
                : "组合计分"}
          </legend>
          <div className="effect-controls">
            <button
              className="icon-button"
              aria-label={`上移${label} ${i + 1}`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="icon-button"
              aria-label={`下移${label} ${i + 1}`}
              disabled={i === effects.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={14} />
            </button>
            <button
              className="icon-button"
              aria-label={`移除${label} ${i + 1}`}
              onClick={() => change(effects.filter((_, j) => j !== i))}
            >
              <X size={14} />
            </button>
          </div>
          {e.type === "add" && (
            <>
              <label className="form-field">
                增加到
                <NativeSelect
                  aria-label={`${label} ${i + 1} 目标状态`}
                  value={e.field}
                  onChange={(event) =>
                    patch(i, { ...e, field: event.target.value })
                  }
                  size="sm"
                >
                  {options(model.fields, e.field)}
                </NativeSelect>
              </label>
              <label className="form-field">
                数量 / 系数
                <input
                  aria-label={`${label} ${i + 1} 数量`}
                  type="number"
                  min="0"
                  max="1000000"
                  value={e.value}
                  onChange={(ev) =>
                    patch(i, { ...e, value: amount(ev.target.value) })
                  }
                />
              </label>
              <label className="form-field">
                乘以状态
                <NativeSelect
                  aria-label={`${label} ${i + 1} 来源状态`}
                  value={e.from ?? ""}
                  onChange={(event) => {
                    const { from: _, ...base } = e;
                    patch(
                      i,
                      event.target.value
                        ? { ...base, from: event.target.value }
                        : base,
                    );
                  }}
                  size="sm"
                >
                  <NativeSelectOption value="">固定数量</NativeSelectOption>
                  {model.fields.map((f) => (
                    <NativeSelectOption key={f.id} value={f.id}>
                      {f.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </>
          )}
          {e.type === "grant" && (
            <label className="form-field">
              获得能力
              <NativeSelect
                aria-label={`${label} ${i + 1} 能力`}
                value={e.capability}
                onChange={(event) =>
                  patch(i, { ...e, capability: event.target.value })
                }
                size="sm"
              >
                {options(model.capabilities, e.capability)}
              </NativeSelect>
            </label>
          )}
          {e.type === "combination" && (
            <>
              <label className="form-field">
                使用牌池
                <NativeSelect
                  aria-label="计分牌池"
                  value={e.collection}
                  onChange={(event) =>
                    patch(i, { ...e, collection: event.target.value })
                  }
                  size="sm"
                >
                  {options(model.collections, e.collection)}
                </NativeSelect>
              </label>
              <label className="form-field">
                分数写入
                <NativeSelect
                  aria-label="计分目标状态"
                  value={e.field}
                  onChange={(event) =>
                    patch(i, { ...e, field: event.target.value })
                  }
                  size="sm"
                >
                  {options(model.fields, e.field)}
                </NativeSelect>
              </label>
              <label className="form-field">
                倍率状态
                <NativeSelect
                  aria-label="计分倍率状态"
                  value={e.multiplier ?? ""}
                  onChange={(event) => {
                    const { multiplier: _, multiplierValue: __, ...base } = e;
                    patch(
                      i,
                      event.target.value
                        ? { ...base, multiplier: event.target.value }
                        : { ...base, multiplierValue: 1 },
                    );
                  }}
                  size="sm"
                >
                  <NativeSelectOption value="">固定倍率</NativeSelectOption>
                  {model.fields.map((f) => (
                    <NativeSelectOption key={f.id} value={f.id}>
                      {f.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              {e.multiplier === undefined && (
                <label className="form-field">
                  固定倍率
                  <input
                    aria-label="固定倍率"
                    type="number"
                    min="0"
                    max="1000000"
                    value={e.multiplierValue ?? 1}
                    onChange={(ev) =>
                      patch(i, {
                        ...e,
                        multiplierValue: amount(ev.target.value),
                      })
                    }
                  />
                </label>
              )}
              <label className="form-field">
                每对同类奖励
                <input
                  aria-label="每对同类奖励"
                  type="number"
                  min="0"
                  max="1000000"
                  value={e.pairBonus ?? 15}
                  onChange={(ev) =>
                    patch(i, { ...e, pairBonus: amount(ev.target.value) })
                  }
                />
              </label>
              <p className="hint">
                （对象基础值之和 + 同组配对数 × 奖励）×
                倍率。每个对象最多组成一对。
              </p>
            </>
          )}
        </fieldset>
      ))}
      <div className="settings-actions">
        <button
          className="text-button"
          disabled={!model.fields.length || effects.length >= 30}
          onClick={() =>
            change([
              ...effects,
              { type: "add", field: model.fields[0].id, value: 1 },
            ])
          }
        >
          <Plus size={14} />
          添加数值效果
        </button>
        <button
          className="text-button"
          disabled={!model.capabilities.length || effects.length >= 30}
          onClick={() =>
            change([
              ...effects,
              { type: "grant", capability: model.capabilities[0].id },
            ])
          }
        >
          <Plus size={14} />
          添加能力效果
        </button>
        {scoring && (
          <button
            className="text-button"
            disabled={
              !model.fields.length ||
              !model.collections.length ||
              effects.length >= 30 ||
              effects.some((e) => e.type === "combination")
            }
            onClick={() =>
              change([
                ...effects,
                {
                  type: "combination",
                  collection: model.collections[0].id,
                  field: model.fields[0].id,
                  multiplierValue: 1,
                  pairBonus: 0,
                },
              ])
            }
          >
            <Plus size={14} />
            添加组合计分
          </button>
        )}
      </div>
      {!effects.length && <p className="hint">暂无效果。</p>}
    </div>
  );
}
