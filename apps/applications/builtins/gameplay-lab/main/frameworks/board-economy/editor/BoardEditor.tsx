import {
  NativeSelect,
  NativeSelectOption,
} from "design-system/components/ui/native-select";
import type { Issue } from "../../../shared/contracts";
import { copy, uid } from "../../../shared/utils";
import {
  boardTileNames,
  newBoardTile,
  type BoardModel,
  type BoardTileType,
} from "../model";
const amount = (text: string, low: number, high = 1_000_000) =>
  Math.max(low, Math.min(high, Math.floor(Number(text) || 0)));
export function BoardEditor({
  model,
  issues,
  update,
  seed,
  setSeed,
}: {
  model: BoardModel;
  issues: Issue[];
  update(change: (m: BoardModel) => void): void;
  seed: number;
  setSeed(n: number): void;
}) {
  function move(index: number, offset: number) {
    update((m) => {
      const target = index + offset;
      if (target < 0 || target >= m.tiles.length) return;
      [m.tiles[index], m.tiles[target]] = [m.tiles[target], m.tiles[index]];
    });
  }
  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <h1>棋盘与规则</h1>
          <p>
            从自己的地块开始，按编号组成环形棋盘；第一格为起点，末格连接起点。
          </p>
        </div>
        <button
          className="button"
          disabled={model.tiles.length >= 20}
          onClick={() =>
            update((m) => m.tiles.push(newBoardTile(!m.tiles.length)))
          }
        >
          添加地块
        </button>
      </div>
      {!!issues.length && (
        <section className="settings-section" aria-label="棋盘就绪检查">
          <h2>试玩前需要完成</h2>
          <ul>
            {issues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="settings-section">
        <h2>双人规则</h2>
        <div className="rule-grid">
          {model.rules.players.map((name, i) => (
            <label className="form-field" key={i}>
              玩家 {i + 1} 名称
              <input
                aria-label={`棋盘玩家 ${i + 1} 名称`}
                maxLength={40}
                value={name}
                onChange={(e) =>
                  update((m) => {
                    m.rules.players[i] = e.target.value;
                  })
                }
              />
            </label>
          ))}
          <label className="form-field">
            每位玩家初始资金
            <input
              aria-label="棋盘初始资金"
              type="number"
              min={1}
              max={1000000}
              value={model.rules.initialCash}
              onChange={(e) =>
                update((m) => {
                  m.rules.initialCash = amount(e.target.value, 1);
                })
              }
            />
          </label>
          <label className="form-field">
            每次经过起点收入
            <input
              aria-label="棋盘起点收入"
              type="number"
              min={0}
              max={1000000}
              value={model.rules.salary}
              onChange={(e) =>
                update((m) => {
                  m.rules.salary = amount(e.target.value, 0);
                })
              }
            />
          </label>
          <label className="form-field">
            骰子面数
            <input
              aria-label="棋盘骰子面数"
              type="number"
              min={2}
              max={6}
              value={model.rules.diceSides}
              onChange={(e) =>
                update((m) => {
                  m.rules.diceSides = amount(e.target.value, 2, 6);
                })
              }
            />
          </label>
          <label className="form-field">
            最多回合
            <input
              aria-label="棋盘回合上限"
              type="number"
              min={1}
              max={200}
              value={model.rules.maxTurns}
              onChange={(e) =>
                update((m) => {
                  m.rules.maxTurns = amount(e.target.value, 1, 200);
                })
              }
            />
          </label>
          <label className="form-field">
            试玩随机种子
            <input
              aria-label="棋盘随机种子"
              type="number"
              min={0}
              max={4294967295}
              value={seed}
              onChange={(e) => setSeed(amount(e.target.value, 0, 0xffffffff))}
            />
          </label>
        </div>
        <p className="hint">
          每位玩家掷骰并结算一次地块后计为一个回合。经过起点先领收入，再结算落点；现金不足付租时支付余额并移交地产，对手获胜。达到回合上限记录为未判胜负。
        </p>
      </section>
      <div className="economy-editor-tiles">
        {model.tiles.map((tile, index) => (
          <section
            className="settings-section economy-tile-editor"
            key={tile.id}
          >
            <h2>
              地块 {index + 1} · {boardTileNames[tile.type]}
            </h2>
            <label className="form-field">
              名称
              <input
                aria-label={`地块 ${index + 1} 名称`}
                maxLength={40}
                value={tile.name}
                onChange={(e) =>
                  update((m) => {
                    m.tiles[index].name = e.target.value;
                  })
                }
              />
            </label>
            <label className="form-field">
              类型
              <NativeSelect
                size="sm"
                aria-label={`地块 ${index + 1} 类型`}
                value={tile.type}
                onChange={(e) =>
                  update((m) => {
                    const t = m.tiles[index];
                    t.type = e.target.value as BoardTileType;
                    t.price = t.type === "property" ? 20 : 0;
                    t.rent = t.type === "property" ? 5 : 0;
                  })
                }
              >
                {Object.entries(boardTileNames).map(([value, name]) => (
                  <NativeSelectOption value={value} key={value}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            {tile.type === "property" && (
              <div className="rule-grid">
                <label className="form-field">
                  购买价格
                  <input
                    aria-label={`地块 ${index + 1} 价格`}
                    type="number"
                    min={1}
                    max={1000000}
                    value={tile.price}
                    onChange={(e) =>
                      update((m) => {
                        m.tiles[index].price = amount(e.target.value, 1);
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  落地租金
                  <input
                    aria-label={`地块 ${index + 1} 租金`}
                    type="number"
                    min={1}
                    max={1000000}
                    value={tile.rent}
                    onChange={(e) =>
                      update((m) => {
                        m.tiles[index].rent = amount(e.target.value, 1);
                      })
                    }
                  />
                </label>
              </div>
            )}
            <div className="economy-tile-tools">
              <button
                className="button"
                aria-label={`上移地块 ${index + 1}`}
                disabled={!index}
                onClick={() => move(index, -1)}
              >
                上移
              </button>
              <button
                className="button"
                aria-label={`下移地块 ${index + 1}`}
                disabled={index === model.tiles.length - 1}
                onClick={() => move(index, 1)}
              >
                下移
              </button>
              <button
                className="button"
                aria-label={`复制地块 ${index + 1}`}
                disabled={model.tiles.length >= 20}
                onClick={() =>
                  update((m) => {
                    m.tiles.splice(index + 1, 0, {
                      ...copy(tile),
                      id: uid("tile"),
                      name: (tile.name + " 副本").slice(0, 40),
                    });
                  })
                }
              >
                复制
              </button>
              <button
                className="text-button"
                aria-label={`删除地块 ${index + 1}`}
                onClick={() =>
                  update((m) => {
                    m.tiles.splice(index, 1);
                  })
                }
              >
                删除
              </button>
            </div>
          </section>
        ))}
      </div>
      {!model.tiles.length && (
        <section className="settings-section">
          <h2>建立自己的棋盘</h2>
          <p>
            点击“添加地块”建立起点，再添加至少三个地块和一处地产。价格、租金与棋盘顺序由你配置。
          </p>
          <button
            className="button primary"
            onClick={() => update((m) => m.tiles.push(newBoardTile(true)))}
          >
            添加起点
          </button>
        </section>
      )}
      <section className="settings-section">
        <label className="form-field">
          玩法说明
          <textarea
            aria-label="棋盘玩法说明"
            value={model.description}
            maxLength={2000}
            onChange={(e) =>
              update((m) => {
                m.description = e.target.value;
              })
            }
          />
        </label>
      </section>
    </section>
  );
}
