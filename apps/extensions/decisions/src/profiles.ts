import { z } from "zod";

const common = {
  id: z.string().regex(/^[a-z][a-z0-9_]{0,24}$/),
  name: z.string().trim().min(1).max(64),
  instructions: z.string().trim().min(1).max(8000),
  threshold: z.number().min(0).max(1),
};
const choices = z.array(z.string().trim().min(1).max(300)).min(2).max(10);
export const profileSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("choice"), choices }).strict(),
  z.object({ ...common, type: z.literal("score"), choices }).strict(),
  z.object({ ...common, type: z.literal("noul") }).strict(),
]);
export const configurationSchema = z
  .object({
    profiles: z.array(profileSchema).max(32),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;

export function readProfiles(config: unknown): Profile[] {
  const parsed = configurationSchema.safeParse(config);
  if (!parsed.success)
    throw new Error(
      "请填写模板名称、判断要求和有效的选项，置信度阈值须在 0 到 1 之间。",
    );
  const ids = new Set<string>();
  for (const profile of parsed.data.profiles) {
    if (ids.has(profile.id)) throw new Error("判断模板的标识不能重复。");
    ids.add(profile.id);
    if (
      profile.type !== "noul" &&
      new Set(profile.choices).size !== profile.choices.length
    )
      throw new Error(`“${profile.name}”的选项不能重复。`);
  }
  return parsed.data.profiles;
}
