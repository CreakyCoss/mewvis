import type { DoudizhuModel } from "../model";
import type { DoudizhuCommand, DoudizhuView } from "../runtime/contracts";
import { pokerCandidates } from "./patterns";
export function doudizhuCoreCommands(
  model: DoudizhuModel,
  view: DoudizhuView,
): DoudizhuCommand[] {
  if (view.actor !== view.player || view.phase === "finished") return [];
  if (view.phase === "bidding")
    return [0, 1, 2, 3]
      .filter((value) => value === 0 || value > view.bid)
      .map((value) => ({ type: "bid", player: view.player, value }));
  return [
    ...pokerCandidates(model, view.hand, view.last?.pattern ?? null).map(
      (cards) => ({
        type: "play" as const,
        player: view.player,
        cards: cards.map((c) => c.id),
      }),
    ),
    ...(view.last ? [{ type: "pass" as const, player: view.player }] : []),
  ];
}
