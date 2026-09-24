/** Plugin-owned vector assets, bundled with the editor. No host avatar IDs or URLs. */
const definitions = [
  [
    "compass",
    "罗盘",
    "#e0edff",
    "#315da8",
    '<path d="m32 13 9 19-9 19-9-19z"/><path d="m13 32 19-9 19 9-19 9z"/>',
  ],
  [
    "prism",
    "棱镜",
    "#eee5ff",
    "#7451ad",
    '<path d="m32 12 20 34H12z"/><path d="M32 12v34m-20 0 20-12 20 12"/>',
  ],
  [
    "spark",
    "星芒",
    "#fff0d0",
    "#a36b13",
    '<path d="m32 12 6 14 14 6-14 6-6 14-6-14-14-6 14-6z"/>',
  ],
  [
    "leaf",
    "叶片",
    "#dff5e9",
    "#327452",
    '<path d="M16 46C12 23 28 16 48 16c0 22-8 36-28 30Z"/><path d="m17 49 23-25"/>',
  ],
  [
    "orbit",
    "轨道",
    "#ffe4ed",
    "#a54367",
    '<circle cx="32" cy="32" r="6"/><ellipse cx="32" cy="32" rx="22" ry="12" transform="rotate(-35 32 32)"/>',
  ],
  [
    "wave",
    "波纹",
    "#dbf2f5",
    "#2a7281",
    '<path d="M12 23q10-12 20 0t20 0M12 33q10-12 20 0t20 0M12 43q10-12 20 0t20 0"/>',
  ],
] as const;
export const avatars = definitions.map(
  ([id, label, background, stroke, shape]) => ({
    id,
    label,
    src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${background}"/><g fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`)}`,
  }),
);
export type AvatarId = (typeof definitions)[number][0];
export const avatarIds = definitions.map(([id]) => id);
export function avatarSource(id: AvatarId) {
  return avatars.find((item) => item.id === id)!.src;
}
