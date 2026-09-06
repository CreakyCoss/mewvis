import { parentPort, workerData } from "node:worker_threads";
import Ajv from "ajv";
import { loadTools } from "./project.mjs";

const ajv = new Ajv({ allErrors: true, strict: false });
const tools = new Map(
  (await loadTools({ toolsEntry: workerData })).map((tool) => [
    tool.name,
    {
      tool,
      validate: ajv.compile(tool.parameters),
      validateOutput: ajv.compile(tool.output.schema),
    },
  ]),
);
parentPort.postMessage({
  tools: [...tools.values()].map(({ tool }) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  })),
});
parentPort.on("message", async ({ id, name, args }) => {
  try {
    const entry = tools.get(name);
    if (!entry) throw new Error("插件不能调用未注册或其他插件的工具");
    if (!entry.validate(args))
      throw new Error(ajv.errorsText(entry.validate.errors));
    const value = await entry.tool.execute(args);
    if (!entry.validateOutput(value))
      throw new Error(
        "工具输出无效：" + ajv.errorsText(entry.validateOutput.errors),
      );
    const content = await entry.tool.output.render(args, value);
    parentPort.postMessage({ id, result: { value, content, meta: {} } });
  } catch (error) {
    parentPort.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
