import { Plus } from "lucide-react";
import { uid } from "../../../shared/utils";
import { type NarrativeModel } from "../model";

export function CharactersView({
  model,
  update,
  setError,
}: {
  model: NarrativeModel;
  update(change: (model: NarrativeModel) => void): void;
  setError(message: string): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>人物</h1>
          <p>人物可作为剧情的发言者；关系和标记通过状态变量表达。</p>
        </div>
        <button
          className="button primary"
          disabled={model.characters.length >= 80}
          onClick={() =>
            update((m) => {
              m.characters.push({
                id: uid("character"),
                name: "新人物",
                description: "",
              });
            })
          }
        >
          <Plus size={15} />
          添加人物
        </button>
      </div>
      {!model.characters.length && (
        <p className="hint">
          尚无人物。旁白剧情可以直接开始，人物不是试玩必填项。
        </p>
      )}
      {model.characters.map((c, index) => (
        <section
          className="settings-section"
          key={c.id}
          data-content-key={`character:${c.id}`}
          tabIndex={-1}
        >
          <label className="form-field">
            人物名称
            <input
              aria-label={`人物 ${index + 1} 名称`}
              maxLength={300}
              value={c.name}
              onChange={(e) =>
                update((m) => {
                  m.characters[index].name = e.target.value;
                })
              }
            />
          </label>
          <label className="form-field">
            人物设定
            <textarea
              aria-label={`人物 ${index + 1} 设定`}
              maxLength={2000}
              value={c.description}
              onChange={(e) =>
                update((m) => {
                  m.characters[index].description = e.target.value;
                })
              }
            />
          </label>
          <button
            className="text-button danger-text"
            onClick={() => {
              if (model.nodes.some((n) => n.speaker === c.id)) {
                setError("人物正在被剧情引用，请先更换发言者。");
                return;
              }
              update((m) => {
                m.characters.splice(index, 1);
              });
            }}
          >
            删除人物
          </button>
        </section>
      ))}
    </section>
  );
}
