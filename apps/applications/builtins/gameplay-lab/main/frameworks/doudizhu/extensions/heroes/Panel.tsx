import { useState } from "react";
import { rankLabel, type DoudizhuModel } from "../../model";
import type { DoudizhuCommand, DoudizhuView } from "../../runtime/game";
import { heroCommands } from "./runtime";

export function HeroesPanel({
  model,
  view,
  busy,
  readOnly,
  execute,
}: {
  model: DoudizhuModel;
  view: DoudizhuView;
  busy: boolean;
  readOnly: boolean;
  execute(command: DoudizhuCommand): void;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const config = model.extensions.heroes;
  if (!config?.enabled || !view.heroes) return null;
  const hero = config.seats[view.player],
    remaining = hero.skill.uses - view.heroes.used[view.player],
    commands = heroCommands(model, view),
    command = commands.find((c) => c.target === target);
  const reason = readOnly
    ? "历史回放，无法使用技能"
    : view.phase === "bidding"
      ? "叫分结束后可用"
      : view.phase === "finished"
        ? "本局已结束"
        : !remaining
          ? "本局次数已用完"
          : view.actor !== view.player
            ? "等待你的出牌回合"
            : "选择另一名玩家，使用后仍可正常出牌";
  return (
    <section className="poker-heroes" aria-label="你的英雄与技能">
      <div className="poker-hero-heading">
        <div>
          <strong>
            {hero.name} · {hero.skill.name}
          </strong>
          <p>
            随机查看 {hero.skill.count} 张手牌 · 剩余 {remaining} /{" "}
            {hero.skill.uses} 次
          </p>
        </div>
        <p>{reason}</p>
      </div>
      {!readOnly && view.phase !== "finished" && (
        <div className="poker-skill-controls">
          <div role="group" aria-label="技能目标">
            {[0, 1, 2]
              .filter((i) => i !== view.player)
              .map((i) => (
                <button
                  className="button"
                  key={i}
                  aria-pressed={target === i}
                  disabled={busy || !commands.some((c) => c.target === i)}
                  onClick={() => setTarget(i)}
                >
                  目标：玩家 {i + 1}
                </button>
              ))}
          </div>
          <button
            className="poker-play-button"
            disabled={busy || !command}
            onClick={() => {
              if (command) {
                execute(command);
                setTarget(null);
              }
            }}
          >
            使用技能：{hero.skill.name}
          </button>
        </div>
      )}
      <div className="poker-hero-reveals" role="status" aria-live="polite">
        {view.heroes.reveals.map((reveal) => (
          <p key={reveal.step}>
            第 {reveal.step} 步 · 玩家 {reveal.target + 1} 当时的手牌：
            <strong>
              {reveal.cards.map((c) => rankLabel(c.rank) + c.suit).join("、")}
            </strong>
          </p>
        ))}
        {!!view.heroes.reveals.length && (
          <small>查看结果是当时的快照，可能已被打出；仅你可见。</small>
        )}
      </div>
    </section>
  );
}
