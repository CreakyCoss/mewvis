import type { DoudizhuModel } from "../../model";
import { HeroesEditor as SharedEditor } from "../../../modules/heroes/Editor";
export function HeroesEditor({
  model,
  update,
}: {
  model: DoudizhuModel;
  update(change: (model: DoudizhuModel) => void): void;
}) {
  return (
    <SharedEditor
      config={model.extensions.heroes}
      update={(change) => update((m) => change(m.extensions.heroes!))}
    />
  );
}
