import type { Role } from "./index";
import { avatars, avatarSource } from "./avatars";

export function RoleEditor({
  roles,
  usedRoleIds,
  onChange,
}: {
  roles: Role[];
  usedRoleIds: ReadonlySet<string>;
  onChange(roles: Role[]): void;
}) {
  const patch = (id: string, value: Partial<Role>) =>
    onChange(
      roles.map((role) => (role.id === id ? { ...role, ...value } : role)),
    );
  return (
    <section className="card" aria-label="插件角色">
      <div className="row">
        <h2>协作角色</h2>
        <button
          disabled={roles.length >= 64}
          onClick={() =>
            onChange([
              ...roles,
              {
                id: `r${crypto.randomUUID().replaceAll("-", "")}`,
                name: "",
                instructions: "",
                avatar: "compass",
              },
            ])
          }
        >
          ＋ 添加角色
        </button>
      </div>
      <p>
        <small>在这里维护协作专用角色和头像，宿主设置中的角色不受影响。</small>
      </p>
      {!roles.length ? (
        <p className="empty">
          还没有协作角色，请先添加角色，再为流程选择执行者。
        </p>
      ) : null}
      {roles.map((role) => (
        <article className="step" key={role.id}>
          <div className="row">
            <img
              width={36}
              height={36}
              src={avatarSource(role.avatar)}
              alt=""
            />
            <h3>{role.name || "新角色"}</h3>
            <button
              disabled={usedRoleIds.has(role.id)}
              title={
                usedRoleIds.has(role.id)
                  ? "请先移除流程步骤对该角色的引用"
                  : undefined
              }
              onClick={() =>
                onChange(roles.filter((item) => item.id !== role.id))
              }
            >
              删除角色
            </button>
          </div>
          <label>
            角色名称
            <input
              maxLength={64}
              value={role.name}
              onChange={(event) => patch(role.id, { name: event.target.value })}
              placeholder="例如：方案设计师"
            />
          </label>
          <div role="group" aria-label="角色头像" className="row">
            {avatars.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                aria-label={`头像：${avatar.label}`}
                aria-pressed={role.avatar === avatar.id}
                className="avatar-option"
                onClick={() => patch(role.id, { avatar: avatar.id })}
              >
                <img width={36} height={36} src={avatar.src} alt="" />
              </button>
            ))}
          </div>
          <label>
            角色职责
            <textarea
              maxLength={8000}
              value={role.instructions}
              onChange={(event) =>
                patch(role.id, { instructions: event.target.value })
              }
              placeholder="定义角色擅长的工作、执行要求和输出方式"
            />
          </label>
          {usedRoleIds.has(role.id) ? (
            <small>此角色正在被流程引用，移除引用后才能删除。</small>
          ) : null}
        </article>
      ))}
    </section>
  );
}
