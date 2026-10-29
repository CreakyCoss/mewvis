import type { DoudizhuModel } from "../model";
import { doudizhuCoreCommands } from "../rules/core-commands";
import { recognizePoker } from "../rules/patterns";
import type { DoudizhuCommand, DoudizhuView } from "../runtime/contracts";
export function chooseDoudizhuCore(
  model: DoudizhuModel,
  view: DoudizhuView,
): DoudizhuCommand {
  const commands = doudizhuCoreCommands(model, view);
  if (!commands.length) throw new Error("当前玩家没有可执行操作。");
  if (view.phase === "bidding")
    return (
      commands.find((c) => c.type === "bid" && c.value === 1) ?? commands[0]
    );
  if (
    view.last &&
    view.last.player !== view.landlord &&
    view.player !== view.landlord
  )
    return { type: "pass", player: view.player };
  const plays = commands.filter((c) => c.type === "play");
  if (view.last)
    plays.sort((a, b) => {
      const pa = recognizePoker(
          model,
          view.hand.filter((c) => a.cards.includes(c.id)),
        )!,
        pb = recognizePoker(
          model,
          view.hand.filter((c) => b.cards.includes(c.id)),
        )!;
      return (
        Number(pa.kind === "rocket" || pa.kind === "bomb") -
          Number(pb.kind === "rocket" || pb.kind === "bomb") ||
        pa.rank - pb.rank
      );
    });
  return plays[0] ?? commands.at(-1)!;
}
