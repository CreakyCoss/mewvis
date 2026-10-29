import { useState } from "react";
import type { HeroesConfig } from "./model";
import {
  heroAbilityCommands,
  type HeroesWindow,
  type HeroCommand,
} from "./runtime";

export function HeroesPanel<Card>({
  config,
  view,
  formatCard,
  unavailableReason,
  busy,
  readOnly,
  execute,
}: {
  config: HeroesConfig | undefined;
  view: HeroesWindow<Card>;
  formatCard(card: Card): string;
  unavailableReason: string;
  busy: boolean;
  readOnly: boolean;
  execute(command: HeroCommand): void;
}) {
  const [target, setTarget] = useState<number | null>(null);
  if (!config?.enabled || !view.heroes) return null;
  const hero = config.seats[view.player],
    remaining = hero.skill.uses - view.heroes.used[view.player],
    commands = heroAbilityCommands(config, view),
    command = commands.find((c) => c.target === target);
  const reason = readOnly
    ? "历史回放，无法使用技能"
    : !view.timing
      ? unavailableReason
      : !remaining
        ? "本局次数已用完"
        : view.actor !== view.player
          ? "等待你的行动回合"
          : !commands.length
            ? "没有可洞察的对手手牌；双人场景可用"
            : "选择另一名玩家，使用后仍可正常行动";
  return (
    <section className="ability-heroes" aria-label="你的英雄与技能">
      <div className="ability-hero-heading">
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
      {!readOnly && !!view.timing && (
        <div className="ability-skill-controls">
          <div role="group" aria-label="技能目标">
            {view.counts
              .map((_, i) => i)
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
            className="button ability-play-button"
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
      <div className="ability-hero-reveals" role="status" aria-live="polite">
        {view.heroes.reveals.map((reveal) => (
          <p key={reveal.step}>
            第 {reveal.step} 步 · 玩家 {reveal.target + 1} 当时的手牌：
            <strong>{reveal.cards.map(formatCard).join("、")}</strong>
          </p>
        ))}
        {!!view.heroes.reveals.length && (
          <small>查看结果是当时的快照，可能已被打出；仅你可见。</small>
        )}
      </div>
    </section>
  );
}
