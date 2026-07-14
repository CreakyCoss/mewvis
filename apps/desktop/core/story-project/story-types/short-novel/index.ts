import { LONG_NOVEL_LAYOUT } from "../long-novel/layout.js";
import { LONG_NOVEL_PROFILE_SOURCE } from "../long-novel/profile.js";
import type { StoryProjectApi } from "../../api.js";
import type { StoryCompiledProject } from "../../types.js";
import type { StoryProjectTypeDefinition } from "../types.js";

export const SHORT_NOVEL_STORY_TYPE: StoryProjectTypeDefinition = Object.freeze({
  id: "short-novel",
  label: "短篇小说",
  description: "复用小说基础资源结构，并将篇幅类型初始化为短篇；适合较少分卷与紧凑章节。",
  profile: LONG_NOVEL_PROFILE_SOURCE,
  layout: LONG_NOVEL_LAYOUT,
  initialize: (projectApi: StoryProjectApi, project: StoryCompiledProject) => {
    const positioningKind = projectApi.describe().documentRoles.positioning;
    if (!positioningKind) return project;
    const info = projectApi.projectInfo(project);
    return projectApi.applyChanges(project, {
      profileId: projectApi.identity.profileId,
      profileVersion: projectApi.identity.profileVersion,
      storyId: info.storyId,
      baseRevision: info.revision,
      validationProfile: "draft",
      operations: [
        {
          type: "patch",
          path: projectApi.resolveDocument(positioningKind),
          value: { lengthType: "short" },
        },
      ],
    }).project;
  },
});
