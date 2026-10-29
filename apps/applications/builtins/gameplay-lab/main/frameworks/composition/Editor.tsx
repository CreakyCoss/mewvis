import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useState } from "react";
import type { CompositionDesign } from "./design";
import type { ModuleEditorProps } from "./ui";
export function CompositionEditor<M>({
  model,
  update,
  definition,
}: ModuleEditorProps<M> & { definition: CompositionDesign<M> }) {
  const [preset, setPreset] = useState(
      () =>
        definition.presets.find(
          (p) => p.id === definition.matchingPreset(model),
        )?.id ??
        definition.presets[0]?.id ??
        "",
    ),
    [confirm, setConfirm] = useState(false);
  const composition = definition.resolve(model, true),
    active = new Set(composition.snapshot.modules.map((ref) => ref.id));
  const matching = definition.presets.find(
    (p) => p.id === definition.matchingPreset(model),
  );
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>玩法组合</h1>
          <p>从预设开始，选择兼容模块并配置自己的玩法。</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>当前方案：{matching?.name ?? "自定义组合"}</h2>
        <p>
          {definition.skeletonName}骨架 · {definition.layoutName} ·{" "}
          {active.size} 个已启用模块
        </p>
        <p className="hint">{definition.description}</p>
      </section>
      {!!composition.issues.length && (
        <div className="form-error" role="alert">
          {composition.issues.map((issue, i) => (
            <p key={i}>{issue.message}</p>
          ))}
        </div>
      )}
      <section className="settings-section">
        <h2>兼容模块</h2>
        {definition.modules.map((module) => (
          <div key={module.definition.id}>
            <label className="poker-toggle">
              <input
                type="checkbox"
                checked={active.has(module.definition.id)}
                disabled={!!composition.issues.length}
                onChange={(e) =>
                  update((m) =>
                    definition.setModuleEnabled(
                      m,
                      module.definition.id,
                      e.target.checked,
                    ),
                  )
                }
              />
              启用{module.definition.name}模块
            </label>
            <p className="hint">
              {module.definition.description}{" "}
              启用后可在侧栏配置内容，关闭会保留内容供下次使用。
            </p>
          </div>
        ))}
      </section>
      <section className="settings-section">
        <h2>起点预设</h2>
        <label className="form-field">
          选择方案
          <NativeSelect
            aria-label="经典预设"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setConfirm(false);
            }}
            size="sm"
          >
            {definition.presets.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <p className="hint">
          {definition.presets.find((p) => p.id === preset)?.description}
        </p>
        <p className="hint">
          {definition.presetEffect} 已保存版本和历史对局保留。
        </p>
        {confirm ? (
          <div className="settings-actions">
            <button
              className="button primary"
              onClick={() => {
                update((m) => definition.applyPreset(m, preset));
                setConfirm(false);
              }}
            >
              确认应用预设
            </button>
            <button className="button" onClick={() => setConfirm(false)}>
              取消
            </button>
          </div>
        ) : (
          <button className="button" onClick={() => setConfirm(true)}>
            应用预设
          </button>
        )}
      </section>
    </section>
  );
}
