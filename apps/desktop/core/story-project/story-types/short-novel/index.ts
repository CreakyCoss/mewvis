import { StoryDefinition } from "../../definitions/index.js";
import { LONG_NOVEL_STORY_TYPE } from "../long-novel/index.js";

export const SHORT_NOVEL_STORY_TYPE = StoryDefinition.define({
  ...LONG_NOVEL_STORY_TYPE,
  id: "short-novel",
  label: "短篇小说",
  description: "复用小说基础资源结构，并将篇幅类型初始化为短篇；适合较少分卷与紧凑章节。",
  documents: LONG_NOVEL_STORY_TYPE.documents.map((document) =>
    document.kind === LONG_NOVEL_STORY_TYPE.roles.positioning
      ? {
          ...document,
          fields: document.fields.map((field) => (field.key === "lengthType" ? { ...field, default: "short" } : field)),
        }
      : document,
  ),
});
