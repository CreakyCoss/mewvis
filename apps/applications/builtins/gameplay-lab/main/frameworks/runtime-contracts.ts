import type { Issue } from "../shared/contracts";

/** A framework owns its state and commands. The host only coordinates these operations. */
export interface GameRuntime<Design, State, Command, Event, Observation> {
  validate(design: unknown, draft?: boolean): Issue[];
  initialize(design: Design, seed: number): State;
  advance(
    design: Design,
    state: State,
    command: Command,
  ): { state: State; events: Event[] };
  observe(design: Design, state: State, player: number): Observation;
  commands(design: Design, view: Observation): Command[];
  choose(design: Design, view: Observation): Command;
}
