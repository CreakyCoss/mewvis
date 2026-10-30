import type { Project } from "../../../app/projects/model";
import type { IncompatibleData } from "../../../app/projects/incompatible";
import { IncompatibleDataNotice } from "../../../app/projects/components/IncompatibleDataNotice";
import type { BoardModel } from "../model";
import type { BoardRecord } from "../records";

export function BoardHistoryView({
  records,
  ready,
  errors,
  incompatible,
  reload,
  open,
  remove,
  removed,
}: {
  records: BoardRecord[];
  ready: boolean;
  errors: string[];
  incompatible: IncompatibleData[];
  reload(): void;
  open(record: BoardRecord): void;
  remove(id: string): Promise<void>;
  removed(): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>试玩记录</h1>
          <p>每次操作保存后更新棋盘；关闭后可继续未结束的对局，或逐步回放。</p>
        </div>
        <button className="button" onClick={reload}>
          重新加载记录
        </button>
      </div>
      {errors.map((e, i) => (
        <p className="form-error" key={i}>
          {e}
        </p>
      ))}
      <IncompatibleDataNotice
        items={incompatible}
        disabled={!ready}
        remove={remove}
        done={removed}
      />
      <div className="economy-history">
        {records.map((r) => (
          <button className="button" key={r.id} onClick={() => open(r)}>
            <strong>
              {r.model.name} · {r.decisions.length} 步
            </strong>
            <span>
              种子 {r.seed} ·{" "}
              {r.final.outcome
                ? r.final.outcome.kind === "won"
                  ? `${r.final.players[r.final.outcome.winner].name} 获胜`
                  : "达到上限"
                : "可继续"}{" "}
              · {new Date(r.createdAt).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      {ready && !records.length && (
        <p className="hint">尚无对局，开始试玩后自动保存。</p>
      )}
    </section>
  );
}
export function BoardVersions({
  project,
  name,
  setName,
  disabled,
  save,
  restore,
}: {
  project: Project<BoardModel>;
  name: string;
  setName(n: string): void;
  disabled: boolean;
  save(): void;
  restore(id: string): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <h1>规则版本</h1>
      </div>
      <section className="settings-section">
        <label className="form-field">
          版本名称
          <input
            aria-label="棋盘版本名称"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={disabled || !name.trim() || project.versions.length >= 10}
          onClick={save}
        >
          保存当前规则版本
        </button>
        <p className="hint">
          版本保存棋盘、价格、租金和现金流；复制回草稿不会更改历史对局。
        </p>
      </section>
      {project.versions.map((v) => (
        <section className="settings-section" key={v.id}>
          <h2>{v.name}</h2>
          <p>
            {v.model.tiles.length} 个地块 ·{" "}
            {new Date(v.createdAt).toLocaleString()}
          </p>
          <button className="button" onClick={() => restore(v.id)}>
            复制回草稿
          </button>
        </section>
      ))}
    </section>
  );
}
export function BoardSettings({
  project,
  rename,
  confirm,
  setConfirm,
  reload,
  selectFramework,
}: {
  project: Project<BoardModel>;
  rename(n: string): void;
  confirm: boolean;
  setConfirm(n: boolean): void;
  reload(): void;
  selectFramework(): void;
}) {
  return (
    <section className="page-content">
      <div className="page-heading">
        <h1>项目设置</h1>
      </div>
      <section className="settings-section">
        <label className="form-field">
          项目名称
          <input
            aria-label="棋盘项目名称"
            maxLength={60}
            value={project.model.name}
            onChange={(e) => rename(e.target.value)}
          />
        </label>
        <label className="form-field">
          项目目录
          <input readOnly value={project.path} />
        </label>
        <p>棋盘经济 · 环形经济棋盘 v1 · 双人</p>
        {project.direction !== "board-economy" && (
          <button className="button" onClick={selectFramework}>
            选择环形经济棋盘框架
          </button>
        )}
        <p className="hint">
          规则保存在 models/core.json，对局保存在
          runs/。修改草稿只影响新开的对局，不转换其他类型的项目。
        </p>
        <button className="button" onClick={() => setConfirm(true)}>
          从项目文件重新读取
        </button>
        {confirm && (
          <div className="settings-confirm" role="alert">
            <p>重新读取会舍弃尚未保存的编辑，确认使用磁盘中的项目？</p>
            <button className="button" onClick={() => setConfirm(false)}>
              取消
            </button>
            <button className="button" onClick={reload}>
              确认重新读取
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
