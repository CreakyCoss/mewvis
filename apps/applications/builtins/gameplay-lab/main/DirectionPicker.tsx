import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import {
  directionDefinition,
  directions,
  gameTypeName,
  type GameTypeId,
  type DirectionId,
} from "./catalog";
import type { SimulatorRef } from "./simulators";
export function DirectionPicker({
  gameType,
  value,
  simulator,
  change,
  disabled = false,
}: {
  gameType: GameTypeId;
  value: DirectionId | null;
  simulator: SimulatorRef | null;
  change(ref: SimulatorRef | null, direction: DirectionId | null): void;
  disabled?: boolean;
}) {
  const current = directionDefinition(value);
  return (
    <div className="simulator-choice" id="simulator-choice">
      <p className="hint">游戏类型：{gameTypeName(gameType)}</p>
      <label className="form-field">
        玩法方向
        <NativeSelect
          aria-label="玩法方向"
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => {
            const d = directionDefinition(event.target.value as DirectionId);
            change(d?.simulator ?? null, d?.id ?? null);
          }}
          size="sm"
        >
          <NativeSelectOption value="">
            先整理内容，稍后选择方向
          </NativeSelectOption>
          {current && current.gameType !== gameType && (
            <NativeSelectOption value={current.id}>
              {current.name} · 与当前类型不兼容
            </NativeSelectOption>
          )}
          {directions
            .filter((d) => d.gameType === gameType)
            .map((d) => (
              <NativeSelectOption key={d.id} value={d.id}>
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
              : "未匹配，请重新选择方向"}
          </p>
        </>
      ) : (
        <p className="hint">
          方向决定可执行的机制与验证范围。示例只提供初始内容，不决定项目身份。
        </p>
      )}
    </div>
  );
}
