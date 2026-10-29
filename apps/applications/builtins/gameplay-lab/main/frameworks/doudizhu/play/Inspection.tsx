import type { DoudizhuRecord } from "../records";
import type { DoudizhuState } from "../runtime/game";
import { resolveDoudizhuComposition } from "../composition/catalog";
export function DoudizhuInspection({
  record,
  state,
  step,
}: {
  record: DoudizhuRecord;
  state: DoudizhuState;
  step(value: number): void;
}) {
  return (
    <section className="page-content">
      <h1>对局检查</h1>
      <p>
        第 {state.steps} 步 · {state.message}
      </p>
      <p className="hint">
        此处为策划检查视角，可以展开隐藏手牌。自动玩家与正常牌桌使用各自的玩家视角。
      </p>
      {state.hands.map((hand, i) => (
        <details key={i}>
          <summary>
            玩家 {i + 1} · {hand.length} 张
          </summary>
          <pre>{hand.map((c) => c.id).join("、")}</pre>
        </details>
      ))}
      <h2 className="section-gap">已记录的操作</h2>
      <ol>
        {record.decisions.map((c, i) => (
          <li key={i}>
            <button className="text-button" onClick={() => step(i + 1)}>
              第 {i + 1} 步 · 玩家 {c.player + 1} ·{" "}
              {c.type === "bid"
                ? c.value
                  ? "叫 " + c.value + " 分"
                  : "不叫"
                : c.type === "pass"
                  ? "过牌"
                  : c.type === "play"
                    ? "出 " + c.cards.length + " 张"
                    : (resolveDoudizhuComposition(record.model)
                        .modules.find((module) =>
                          module.commandTypes.includes(c.type),
                        )
                        ?.describeCommand?.(c) ?? c.type)}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
