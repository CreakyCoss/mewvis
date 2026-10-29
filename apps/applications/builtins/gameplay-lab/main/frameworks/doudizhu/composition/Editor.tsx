import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { useState } from "react";
import type { ModuleEditorProps } from "../../composition/ui";
import type { DoudizhuModel } from "../model";
import {
  doudizhuLayout,
  doudizhuModules,
  doudizhuSkeleton,
  resolveDoudizhuComposition,
} from "./catalog";
import {
  applyDoudizhuPreset,
  doudizhuPresets,
  matchingDoudizhuPreset,
  setDoudizhuModuleEnabled,
} from "./presets";

export function DoudizhuCompositionEditor({
  model,
  update,
}: ModuleEditorProps<DoudizhuModel>) {
  const [preset, setPreset] = useState("classic-doudizhu"),
    [confirm, setConfirm] = useState(false);
  const composition = resolveDoudizhuComposition(model, true),
    active = new Set(composition.snapshot.modules.map((ref) => ref.id));
  const matching = doudizhuPresets.find(
    (p) => p.id === matchingDoudizhuPreset(model),
  );
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>玩法组合</h1>
          <p>从经典预设开始，选择兼容模块并配置自己的玩法。</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>当前方案：{matching?.name ?? "自定义组合"}</h2>
        <p>
          {doudizhuSkeleton.name}骨架 · {doudizhuLayout.name} · {active.size}{" "}
          个已启用模块
        </p>
        <p className="hint">
          牌型、叫分、阵营和胜负流程由骨架提供。模块同时加入编辑页面、运行能力和牌桌交互，所有方案使用相同的保存与回放流程。
        </p>
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
        {doudizhuModules.map((module) => (
          <div key={module.definition.id}>
            <label className="poker-toggle">
              <input
                type="checkbox"
                checked={active.has(module.definition.id)}
                disabled={!!composition.issues.length}
                onChange={(e) =>
                  update((m) =>
                    setDoudizhuModuleEnabled(
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
        <h2>经典预设</h2>
        <label className="form-field">
          起点方案
          <NativeSelect
            aria-label="经典预设"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setConfirm(false);
            }}
            size="sm"
          >
            {doudizhuPresets.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <p className="hint">
          {doudizhuPresets.find((p) => p.id === preset)?.description}
        </p>
        <p className="hint">
          应用预设会替换当前出牌规则及启用模块的设置，项目名称、设计说明、已保存版本和历史对局保留。
        </p>
        {confirm ? (
          <div className="settings-actions">
            <button
              className="button primary"
              onClick={() => {
                update((m) => applyDoudizhuPreset(m, preset));
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
