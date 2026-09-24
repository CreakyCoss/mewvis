import type { Role } from "./index";
import { avatars, avatarSource } from "./avatars";
export function RoleEditor({
  role,
  onChange,
}: {
  role: Role;
  onChange(value: Partial<Role>): void;
}) {
  return (
    <>
      <div className="role-identity">
        <img
          width={56}
          height={56}
          src={avatarSource(role.avatar)}
          alt="当前角色头像"
        />
        <label>
          角色名称
          <input
            autoFocus
            maxLength={64}
            value={role.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="例如：方案设计师"
          />
        </label>
      </div>
      <div className="avatar-field">
        <span className="field-title">头像</span>
        <div role="group" aria-label="角色头像" className="avatar-options">
          {avatars.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              aria-label={`头像：${avatar.label}`}
              title={avatar.label}
              aria-pressed={role.avatar === avatar.id}
              className="avatar-option"
              onClick={() => onChange({ avatar: avatar.id })}
            >
              <img width={32} height={32} src={avatar.src} alt="" />
            </button>
          ))}
        </div>
      </div>
      <label>
        角色职责
        <textarea
          rows={6}
          maxLength={8000}
          value={role.instructions}
          onChange={(event) => onChange({ instructions: event.target.value })}
          placeholder="擅长什么？执行时要遵循哪些要求？希望它如何组织输出？"
        />
        <small>定义这个角色的长期职责，具体任务在流程步骤中填写。</small>
      </label>
    </>
  );
}
