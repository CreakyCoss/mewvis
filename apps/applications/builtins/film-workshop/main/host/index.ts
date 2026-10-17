import { defineApplication } from "@mewvis/app-sdk";
import tools from "./tools";
import skills from "./skills";
import { createProposalTool } from "./proposals";
import { createMediaRequestTool } from "./media";

export default defineApplication({
  name: "@mewvis/film-workshop",
  inject: ["tools", "skills", "storage", "files"],
  apply(context) {
    for (const tool of [
      ...tools,
      createProposalTool(context),
      createMediaRequestTool(context),
    ])
      context.tools.register(tool);
    for (const skill of skills)
      context.skills.register({ ...skill, source: "bundled" });
  },
});
