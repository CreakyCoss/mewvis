import { APP_DISPLAY_NAME, productId } from "@mewvis/product-config";
import { defineApplication, defineTool } from "@mewvis/app-sdk";
import book from "../../../../docs/.generated/book.json" with { type: "json" };
import { createLibrary } from "./library.js";

const library = createLibrary(book);
const string = { type: "string" };
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const entry = {
  id: string,
  title: string,
  group: string,
  depth: { type: "integer" },
};
const array = (items) => ({ type: "array", items });
const definitions = [
  [
    productId("_docs_catalog"),
    `列出 ${APP_DISPLAY_NAME} 中文文档的章节与页面。`,
    object({}),
    object({ title: string, language: string, entries: array(object(entry)) }),
    () => library.catalog(),
  ],
  [
    productId("_docs_read"),
    `读取目录中的一篇 ${APP_DISPLAY_NAME} 中文文档。`,
    object({ id: { ...string, minLength: 1, maxLength: 240 } }),
    object({
      ...entry,
      html: string,
      headings: array(
        object({ id: string, title: string, level: { type: "integer" } }),
      ),
    }),
    ({ id }) => library.read(id),
  ],
  [
    productId("_docs_search"),
    `全文搜索 ${APP_DISPLAY_NAME} 中文文档，最多返回 30 项。`,
    object({ query: { ...string, maxLength: 200 } }),
    object({
      total: { type: "integer" },
      results: array(
        object({ id: string, title: string, group: string, excerpt: string }),
      ),
    }),
    ({ query }) => library.search(query),
  ],
];

export default defineApplication({
  name: "@mewvis/docs-reader",
  inject: ["tools"],
  apply(ctx) {
    for (const [
      name,
      description,
      parameters,
      schema,
      execute,
    ] of definitions) {
      ctx.tools.register(
        defineTool({
          risk: "low",
          name,
          description,
          parameters,
          output: {
            schema,
            render: (_args, value) => [
              { type: "text", text: JSON.stringify(value) },
            ],
          },
          execute,
        }),
      );
    }
  },
});
