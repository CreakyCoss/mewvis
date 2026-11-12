import type { BoardRecord } from "../records";
import type { BoardState } from "../runtime";

interface ResultProperty {
  id: string;
  name: string;
}
export interface BoardResultSummary {
  kind: "won" | "limit";
  title: string;
  reason: string;
  modelName: string;
  seed: number;
  turns: number;
  steps: number;
  winner: number | null;
  players: {
    seat: number;
    name: string;
    cash: number;
    bankrupt: boolean;
    properties: ResultProperty[];
  }[];
  unowned: ResultProperty[];
  bankruptcy: {
    debtor: number;
    creditor: number;
    property: ResultProperty | null;
    owed: number | null;
    paid: number | null;
    transferred: ResultProperty[] | null;
  } | null;
}

// The visible snapshot decides whether there is a result. Never reveal the
// record's terminal state while the user is inspecting an earlier step.
export function boardResultSummary(
  record: BoardRecord,
  state: BoardState,
  previous?: BoardState,
): BoardResultSummary | null {
  const outcome = state.outcome;
  if (!outcome) return null;
  const properties = record.model.tiles.filter(
    (tile) => tile.type === "property",
  );
  const property = (tile: ResultProperty): ResultProperty => ({
    id: tile.id,
    name: tile.name,
  });
  let bankruptcy: BoardResultSummary["bankruptcy"] = null;
  if (outcome.kind === "won") {
    const rent = state.events.find(
      (event) =>
        event.type === "rent" &&
        event.player === outcome.bankrupt &&
        event.other === outcome.winner,
    );
    const land = properties.find((tile) => tile.id === rent?.tile);
    bankruptcy = {
      debtor: outcome.bankrupt,
      creditor: outcome.winner,
      property: land ? property(land) : null,
      owed: land?.rent ?? null,
      paid: rent?.amount ?? null,
      // Final ownership alone cannot distinguish purchased and transferred land.
      transferred: previous
        ? properties
            .filter(
              (tile) =>
                previous.owners[tile.id] === outcome.bankrupt &&
                state.owners[tile.id] === outcome.winner,
            )
            .map(property)
        : null,
    };
  }
  return {
    kind: outcome.kind,
    title:
      outcome.kind === "won"
        ? `${state.players[outcome.winner].name} 获胜`
        : "达到回合上限",
    reason: outcome.reason,
    modelName: record.model.name,
    seed: record.seed,
    turns: state.turn,
    steps: record.decisions.length,
    winner: outcome.kind === "won" ? outcome.winner : null,
    players: state.players.map((player, seat) => ({
      seat,
      name: player.name,
      cash: player.cash,
      bankrupt: player.bankrupt,
      properties: properties
        .filter((tile) => state.owners[tile.id] === seat)
        .map(property),
    })),
    unowned: properties
      .filter((tile) => state.owners[tile.id] === null)
      .map(property),
    bankruptcy,
  };
}
