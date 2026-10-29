import type { Model } from "../../../../domains/turn/model";
import { CardRulesEditor } from "../../../../frameworks/card-scoring/editor/components/CardRulesEditor";
import { FlowEditor } from "../../../../shared/turn/FlowEditor";
export function RulesEditor({
  model,
  update,
}: {
  model: Model;
  update(change: (model: Model) => void): void;
}) {
  if (model.format === "gameplay-card-v1")
    return (
      <CardRulesEditor
        model={model}
        update={(change) =>
          update((model) => {
            if (model.format === "gameplay-card-v1") change(model);
          })
        }
      />
    );
  return (
    <section className="page-content rules-page">
      <div className="page-heading">
        <div>
          <h1>流程与产出</h1>
          <p>配置行动机会、回合上限与周期产出。</p>
        </div>
      </div>
      <FlowEditor model={model} update={update} />
    </section>
  );
}
