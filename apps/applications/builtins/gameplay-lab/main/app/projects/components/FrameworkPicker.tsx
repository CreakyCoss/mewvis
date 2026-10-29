import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import {
  frameworkDefinition,
  frameworks,
  gameTypeName,
  type FrameworkId,
  type GameTypeId,
} from "../../../frameworks/catalog";
import type { SimulatorRef } from "../../../shared/contracts";
export function FrameworkPicker({
  gameType,
  value,
  simulator,
  change,
  disabled = false,
  schema,
}: {
  gameType: GameTypeId;
  value: FrameworkId | null;
  simulator: SimulatorRef | null;
  change(ref: SimulatorRef | null, direction: FrameworkId | null): void;
  disabled?: boolean;
  schema?: string;
}) {
  const current = frameworkDefinition(value);
  return (
    <div className="simulator-choice" id="simulator-choice">
      <p className="hint">游戏类型：{gameTypeName(gameType)}</p>
      <label className="form-field">
        玩法框架
        <NativeSelect
          aria-label="玩法框架"
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => {
            const d = frameworkDefinition(event.target.value as FrameworkId);
            change(d?.simulator ?? null, d?.id ?? null);
          }}
          size="sm"
        >
          <NativeSelectOption value="" disabled>
            请选择玩法框架
          </NativeSelectOption>
          {current && current.gameType !== gameType && (
            <NativeSelectOption value={current.id}>
              {current.name} · 与当前类型不兼容
            </NativeSelectOption>
          )}
          {frameworks
            .filter((d) => d.gameType === gameType)
            .map((d) => (
              <NativeSelectOption
                key={d.id}
                value={d.id}
                disabled={!!schema && schema !== d.schema}
              >
                {d.name}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </label>
      {current ? (
        <>
          <p>{current.description}</p>
          <p className="hint">{current.scope}</p>
          <p className="hint">
            验证模拟器：
            {simulator?.id === current.simulator.id &&
            simulator.version === current.simulator.version
              ? `${current.name} · v${simulator.version}`
              : "未匹配，请重新选择框架"}
          </p>
        </>
      ) : (
        <p className="hint">
          框架决定可执行的机制与验证范围。示例只提供初始内容，不决定项目身份。
        </p>
      )}
    </div>
  );
}
