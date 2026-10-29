import { Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { referencesTo } from "../../../../domains/turn/definitions";
import { type Model } from "../../../../domains/turn/model";
export function DefinitionActions({
  model,
  id,
  duplicate,
  remove,
  extraReferences = [],
}: {
  model: Model;
  id: string;
  duplicate(): void;
  remove(): void;
  extraReferences?: string[];
}) {
  const [confirm, setConfirm] = useState(false);
  const refs = [...new Set([...referencesTo(model, id), ...extraReferences])];
  return (
    <div className="definition-actions">
      <div className="settings-actions">
        <button className="text-button" onClick={duplicate}>
          <Copy size={14} />
          复制定义
        </button>
        <button
          className="text-button danger-text"
          onClick={() => setConfirm(!confirm)}
        >
          <Trash2 size={14} />
          删除定义
        </button>
      </div>
      {confirm && (
        <div className="settings-confirm">
          {refs.length ? (
            <>
              <strong>先解除以下引用</strong>
              <ul>
                {refs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p>删除后会自动保存到项目。已有对局和版本保留原规则。</p>
              <button className="button" onClick={remove}>
                确认删除定义
              </button>
            </>
          )}
          <button className="text-button" onClick={() => setConfirm(false)}>
            取消
          </button>
        </div>
      )}
    </div>
  );
}
