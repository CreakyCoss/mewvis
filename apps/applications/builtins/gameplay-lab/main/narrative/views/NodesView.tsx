import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import { Plus } from "lucide-react";
import { uid } from "../../shared/utils";
import { ChoiceEditor } from "../components/ChoiceEditor";
import { type NarrativeModel } from "../model";

export function NodesView({
  model,
  selected,
  setSelected,
  update,
  setError,
  addNode,
}: {
  model: NarrativeModel;
  selected: string;
  setSelected(id: string): void;
  update(change: (model: NarrativeModel) => void): void;
  setError(message: string): void;
  addNode(): void;
}) {
  const node = model.nodes.find((n) => n.id === selected);
  function deleteNode() {
    if (!node) return;
    const refs = model.nodes.filter((n) =>
      n.choices.some((c) => c.target === node.id),
    );
    if (refs.length || model.startNode === node.id) {
      setError("请先更换起始剧情并解除指向本节点的选项，再删除剧情。");
      return;
    }
    update((m) => {
      m.nodes = m.nodes.filter((n) => n.id !== node.id);
    });
    setSelected("");
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>剧情与选择</h1>
          <p>
            选择目标剧情形成分支，条件决定选项是否可用，后果在跳转前按顺序执行。
          </p>
        </div>
        <button
          className="button primary"
          disabled={model.nodes.length >= 80}
          onClick={addNode}
        >
          <Plus size={15} />
          添加剧情
        </button>
      </div>
      <label className="form-field">
        起始剧情
        <NativeSelect
          aria-label="起始剧情"
          value={model.startNode}
          onChange={(event) =>
            update((m) => {
              m.startNode = event.target.value;
            })
          }
          size="sm"
        >
          <NativeSelectOption value="">请选择起始剧情</NativeSelectOption>
          {model.nodes.map((n) => (
            <NativeSelectOption key={n.id} value={n.id}>
              {n.title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <div className="story-editor-layout">
        <nav className="story-node-list" aria-label="剧情列表">
          {model.nodes.map((n) => (
            <button
              className={selected === n.id ? "active" : ""}
              key={n.id}
              onClick={() => setSelected(n.id)}
            >
              <span>{n.title}</span>
              <small>
                {n.ending ? "结局" : `${n.choices.length} 个选项`}
                {n.id === model.startNode ? " · 起点" : ""}
              </small>
            </button>
          ))}
        </nav>
        <div>
          {node ? (
            <section className="settings-section story-node-editor">
              <label className="form-field">
                剧情标题
                <input
                  aria-label="剧情标题"
                  maxLength={300}
                  value={node.title}
                  onChange={(e) =>
                    update((m) => {
                      m.nodes.find((n) => n.id === node.id)!.title =
                        e.target.value;
                    })
                  }
                />
              </label>
              <label className="form-field">
                发言人物
                <NativeSelect
                  aria-label="发言人物"
                  value={node.speaker}
                  onChange={(event) =>
                    update((m) => {
                      m.nodes.find((n) => n.id === node.id)!.speaker =
                        event.target.value;
                    })
                  }
                  size="sm"
                >
                  <NativeSelectOption value="">旁白</NativeSelectOption>
                  {model.characters.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label className="form-field">
                剧情正文
                <textarea
                  aria-label="剧情正文"
                  rows={6}
                  maxLength={8000}
                  value={node.text}
                  onChange={(e) =>
                    update((m) => {
                      m.nodes.find((n) => n.id === node.id)!.text =
                        e.target.value;
                    })
                  }
                />
              </label>
              <label className="story-checkbox">
                <input
                  type="checkbox"
                  checked={node.ending}
                  onChange={(e) =>
                    update((m) => {
                      m.nodes.find((n) => n.id === node.id)!.ending =
                        e.target.checked;
                    })
                  }
                />
                这是结局节点
              </label>
              {node.ending && !!node.choices.length && (
                <p className="form-error">
                  结局节点仍有选项，请移除选项或取消结局标记。选项不会被自动删除。
                </p>
              )}
              {node.choices.map((c, i) => (
                <ChoiceEditor
                  key={c.id}
                  choice={c}
                  index={i}
                  model={model}
                  change={(fn) =>
                    update((m) => {
                      fn(m.nodes.find((n) => n.id === node.id)!.choices[i]);
                    })
                  }
                  remove={() =>
                    update((m) => {
                      m.nodes
                        .find((n) => n.id === node.id)!
                        .choices.splice(i, 1);
                    })
                  }
                />
              ))}
              <div className="settings-actions">
                <button
                  className="button"
                  disabled={node.ending || node.choices.length >= 20}
                  onClick={() =>
                    update((m) => {
                      m.nodes
                        .find((n) => n.id === node.id)!
                        .choices.push({
                          id: uid("choice"),
                          label: "",
                          target: "",
                          conditions: [],
                          effects: [],
                        });
                    })
                  }
                >
                  <Plus size={14} />
                  添加选项
                </button>
                <button
                  className="text-button danger-text"
                  onClick={deleteNode}
                >
                  删除剧情
                </button>
              </div>
            </section>
          ) : (
            <p className="hint">添加剧情或从列表中选择节点。</p>
          )}
        </div>
      </div>
    </section>
  );
}
