import type { Rule } from "./rules";
export function RuleEditor({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange(value: Partial<Rule>): void;
}) {
  return (
    <>
      <div className="grid">
        <label>
          名称
          <input
            maxLength={64}
            value={rule.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <label>
          状态
          <select
            value={String(rule.enabled)}
            onChange={(e) => onChange({ enabled: e.target.value === "true" })}
          >
            <option value="true">启用</option>
            <option value="false">停用</option>
          </select>
        </label>
      </div>
      <label>
        适用条件
        <textarea
          maxLength={1000}
          value={rule.when}
          onChange={(e) => onChange({ when: e.target.value })}
          placeholder="例如：判断本项目的发布方案是否具备上线条件"
        />
        <small>
          描述什么问题应该使用这条规则；不需要填写命令名或规则引用。
        </small>
      </label>
      <label>
        判断标准
        <textarea
          maxLength={8000}
          value={rule.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
          placeholder="例如：需明确回滚方案、测试结果和负责人；缺少关键证据时不能判定通过"
        />
      </label>
      <div className="grid">
        <label>
          匹配优先级
          <input
            type="number"
            min={0}
            max={100}
            value={Number.isNaN(rule.priority) ? "" : rule.priority}
            onChange={(e) => onChange({ priority: e.target.valueAsNumber })}
          />
          <small>多个规则适用时优先选择较高值（0–100）。</small>
        </label>
        <label>
          需复核阈值
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={Number.isNaN(rule.threshold) ? "" : rule.threshold}
            onChange={(e) => onChange({ threshold: e.target.valueAsNumber })}
          />
          <small>模型自评低于此值时提示复核，不切换规则重判。</small>
        </label>
      </div>
    </>
  );
}
