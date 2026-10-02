import { readFileSync } from "node:fs";

const openRpcDocument = JSON.parse(
  readFileSync(new URL("../../../agent-runtime/protocol/v1/openrpc.json", import.meta.url), "utf8"),
);

const methodByCommandType = new Map(
  openRpcDocument.methods.flatMap((method) => {
    const command = method["x-mewvis-command"];
    return command ? [[command.type, { method: method.name, paramsMode: command.paramsMode }]] : [];
  }),
);

export const jsonRpcMessageForCommand = (command) => {
  const definition = methodByCommandType.get(command?.type);
  if (!definition) {
    throw new Error(`OpenRPC 未定义测试命令：${command?.type ?? "<missing>"}`);
  }

  const { type: _type, requestId, input, ...flatParams } = command;
  const params = definition.paramsMode === "input" ? input : flatParams;
  return {
    jsonrpc: "2.0",
    ...(requestId === undefined ? {} : { id: requestId }),
    method: definition.method,
    params: params ?? {},
  };
};

export const runtimePayloadFromJsonRpcMessage = (message) => {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
    throw new Error(`runtime 输出了非 JSON-RPC 消息：${JSON.stringify(message)}`);
  }

  if (message.method === "runtime/event") {
    return message.params;
  }
  if (message.method === "runtime/result") {
    const { rpcRequestId, ...result } = message.params ?? {};
    return {
      ...result,
      ...(rpcRequestId === undefined ? {} : { requestId: String(rpcRequestId) }),
    };
  }
  if (Object.prototype.hasOwnProperty.call(message, "result")) {
    return {
      ...(message.result && typeof message.result === "object" ? message.result : { value: message.result }),
      requestId: String(message.id),
    };
  }
  if (message.error) {
    return {
      type: "error",
      requestId: message.id === null ? null : String(message.id),
      code: message.error.code,
      message: message.error.message,
      data: message.error.data,
    };
  }

  throw new Error(`无法识别 JSON-RPC runtime 消息：${JSON.stringify(message)}`);
};

export const writeAgentRuntimeCommand = (stdin, command) => {
  stdin.write(`${JSON.stringify(jsonRpcMessageForCommand(command))}\n`);
};
