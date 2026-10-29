import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import type { FormEventHandler } from "react";
import { ApplicationForm } from "../../shared/components/Form";
import { Modal } from "../../shared/components/Modal";
import { type Model, type NodeKind } from "../model";
import { kindNames } from "../rules/Graph";
export type WorkspaceModal = "definition" | "version" | "help" | null;
export function WorkspaceDialogs({
  modal,
  kind,
  label,
  model,
  setKind,
  setLabel,
  close,
  addDefinition,
  saveVersion,
}: {
  modal: WorkspaceModal;
  kind: NodeKind;
  label: string;
  model: Model;
  setKind(kind: NodeKind): void;
  setLabel(label: string): void;
  close(): void;
  addDefinition: FormEventHandler;
  saveVersion: FormEventHandler;
}) {
  return (
    <>
      {modal === "definition" && (
        <Modal title="添加模型定义" close={() => close()}>
          <ApplicationForm onSubmit={addDefinition}>
            <label className="form-field">
              定义类型
              <NativeSelect
                value={kind}
                onChange={(event) => setKind(event.target.value as NodeKind)}
                aria-label="定义类型"
                size="sm"
              >
                {(Object.keys(kindNames) as NodeKind[]).map((k) => (
                  <NativeSelectOption value={k} key={k}>
                    {kindNames[k]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="form-field">
              名称
              <input
                autoFocus
                required
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <p className="hint">名称可修改，内部引用会保持稳定。</p>
            <footer>
              <button type="button" className="button" onClick={() => close()}>
                取消
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={
                  (kind === "action" || kind === "goal") && !model.fields.length
                }
              >
                添加定义
              </button>
            </footer>
          </ApplicationForm>
        </Modal>
      )}
      {modal === "version" && (
        <Modal title="保存模型版本" close={() => close()}>
          <ApplicationForm onSubmit={saveVersion}>
            <label className="form-field">
              版本名称
              <input
                autoFocus
                required
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <p className="hint">保存完整规则快照，之后编辑不会覆盖此版本。</p>
            <footer>
              <button type="button" className="button" onClick={() => close()}>
                取消
              </button>
              <button type="submit" className="button primary">
                保存版本
              </button>
            </footer>
          </ApplicationForm>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="从策划到第一次试玩" close={() => close()}>
          <div className="help-content">
            <p>
              新建时先选择游戏类型与玩法方向，再从零编写内容或复制该类型的示例。策划概览记录设计目标、核心循环与待验证问题。
            </p>
            <p>
              在“规则定义”中添加自己的状态、能力、行动和目标。点击定义可编辑，连线来自实际的消耗、效果和依赖。概览中的就绪检查会提示缺项并提供编辑入口，最小规则完成后即可人工试玩。
            </p>
            <p>
              “策略与场景”可保存参与者初始配置、自定义策略和实验对照选择。配置保存在项目
              configs/playtest.json，运行记录保存独立配置快照。
            </p>
            <p>
              在“实验记录”展开“版本与参数对照”，可以比较命名版本与草稿，或扫描单个数值。结果保留各分组的规则快照，可查看差值并逐局回放。
            </p>
            <p>
              卡牌项目的“卡牌与回合”设计牌池、卡牌、选择与周期结算；经营项目的“流程与产出”设计行动机会和周期效果。删除定义前需先解除引用。
            </p>
            <p>
              “试运行”会冻结规则、场景、玩家策略和模拟器版本。你可以手动选择行动，或让自动玩家执行一步，再通过事件与回放查明原因。
            </p>
            <p>
              回合发展支持资源支付、周期产出、能力解锁和阈值目标；卡牌组合还支持自定义牌池、选牌、计分、弃置和补充。不兼容的规则会阻止运行并提示原因。
            </p>
            <p>
              新建项目时填写名称和父目录。规则、模拟器选择、设计说明及命名版本保存在项目的
              models/core.json，
              后续编辑只保存自己的项目。项目设置支持选择当前类型的玩法方向，以及应用或重置同类示例；替换示例前自动备份。对局和实验保存到项目目录，重开后可继续对局、逐步回放或补跑剩余实验样本。
            </p>
            <button className="button primary" onClick={() => close()}>
              开始探索
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
