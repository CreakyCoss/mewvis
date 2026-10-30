import { useEffect, useState } from "react";
import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import type { CardModel } from "../../../../domains/card/model";
import { instanceLabel } from "../../../../domains/card/collections";
import type { ModulePlayProps } from "../../../composition/ui";
import type {
  CardScoringCommand,
  CardScoringView,
} from "../../composition/contracts";
import { cardAbilitiesConfig } from "./model";
import {
  cardAbilityCommands,
  cardAbilityCost,
  cardAbilityReason,
} from "./runtime";

export function CardAbilitiesPanel({
  model,
  view,
  busy,
  readOnly,
  execute,
}: ModulePlayProps<CardModel, CardScoringCommand, CardScoringView>) {
  const [selectedAbility, setAbility] = useState(""),
    [cards, setCards] = useState<string[]>([]);
  useEffect(() => setCards([]), [view.step, view.player, selectedAbility]);
  const config = cardAbilitiesConfig(model),
    value = view["card-abilities"];
  if (!config?.enabled || !value) return null;
  const ability =
    config.abilities.find((a) => a.id === selectedAbility) ??
    config.abilities[0];
  if (!ability) return null;
  const player = view.player,
    focus = value.focus[player];
  const hand = view.state.players[player].collections[ability.deck]?.hand ?? [];
  const selected = cards
    .filter((id) => hand.some((c) => c.id === id))
    .sort((a, b) => a.localeCompare(b));
  const reason = readOnly
    ? "历史回放，无法使用能力"
    : cardAbilityReason(model, view, ability) ||
      (selected.length !== ability.discard
        ? `请选择 ${ability.discard} 张弃牌，当前 ${selected.length} 张`
        : "");
  const command = !reason
    ? cardAbilityCommands(model, view, [ability]).find(
        (c) =>
          c.cards.length === selected.length &&
          c.cards.every((id, i) => id === selected[i]),
      )
    : undefined;
  return (
    <section className="card-ability-panel" aria-label="你的卡牌能力">
      <div className="card-ability-heading">
        <strong>卡牌能力 · {view.state.players[player].name}</strong>
        <span>
          {focus
            ? `专注：费用减免 ${focus.discount} · 剩余 ${focus.turns} 个自己的行动阶段`
            : "当前无专注状态"}
        </span>
      </div>
      <label className="form-field">
        选择能力
        <NativeSelect
          aria-label="使用的卡牌能力"
          size="sm"
          value={ability.id}
          onChange={(e) => {
            setAbility(e.target.value);
            setCards([]);
          }}
        >
          {config.abilities.map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>
              {a.name} · 剩余 {a.uses - value.used[player][a.id]} / {a.uses} 次
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <p>
        自己弃 {ability.discard} 张 · 最多抽 {ability.draw} 张
        {ability.focus ? ` · 获得专注 ${ability.focus.turns} 阶段` : ""}
      </p>
      <p>
        {ability.cost
          ? `${model.fields.find((f) => f.id === ability.cost!.field)?.name}费用 ${cardAbilityCost(ability, value, player)}（基础 ${ability.cost.amount}）`
          : "无资源费用"}{" "}
        · 不消耗普通行动次数
      </p>
      {!!ability.discard && (
        <div
          className="card-ability-selection"
          role="group"
          aria-label="选择弃牌"
        >
          {hand.map((card) => (
            <button
              type="button"
              className="button"
              aria-label={`弃牌选择：${instanceLabel(card)}`}
              aria-pressed={selected.includes(card.id)}
              key={card.id}
              disabled={
                busy ||
                readOnly ||
                !!cardAbilityReason(model, view, ability) ||
                (!selected.includes(card.id) &&
                  selected.length >= ability.discard)
              }
              onClick={() =>
                setCards(
                  selected.includes(card.id)
                    ? selected.filter((id) => id !== card.id)
                    : [...selected, card.id],
                )
              }
            >
              {instanceLabel(card)}
            </button>
          ))}
        </div>
      )}
      <div className="card-ability-controls">
        <p aria-live="polite">
          {busy ? "正在保存…" : reason || "可以使用；效果与费用一起结算。"}
        </p>
        <button
          className="button"
          disabled={busy || !command}
          onClick={() => {
            if (command) {
              execute(command);
              setCards([]);
            }
          }}
        >
          使用能力：{ability.name}
        </button>
      </div>
      <small>
        抽牌结果体现在自己的手牌中；公开事件只记录抽牌张数。专注在自己的行动阶段结束时减少。
      </small>
    </section>
  );
}
