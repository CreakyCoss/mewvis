type ProtocolMethodName<TApi extends object> = Extract<
  {
    [TKey in keyof TApi]-?: TApi[TKey] extends (...args: never[]) => unknown ? TKey : never;
  }[keyof TApi],
  string
>;

type ProtocolPropertyName<TApi extends object> = Exclude<Extract<keyof TApi, string>, ProtocolMethodName<TApi>>;

export type ProtocolMemberDefinition = Readonly<{
  description?: string;
}>;

declare const PROTOCOL_API: unique symbol;

export type ProtocolDefinition<TApi extends object = object> = Readonly<{
  id: string;
  version: number;
  methods: Readonly<Record<ProtocolMethodName<TApi>, ProtocolMemberDefinition>>;
  properties: Readonly<Record<ProtocolPropertyName<TApi>, ProtocolMemberDefinition>>;
  [PROTOCOL_API]?: TApi;
}>;

export type AnyProtocolDefinition = ProtocolDefinition<object>;

export type ProtocolApi<TProtocol extends AnyProtocolDefinition> =
  TProtocol extends ProtocolDefinition<infer TApi> ? TApi : never;

export const defineProtocol =
  <TApi extends object>() =>
  <const TProtocol extends ProtocolDefinition<TApi>>(protocol: TProtocol) =>
    Object.freeze({
      ...protocol,
      methods: Object.freeze({ ...protocol.methods }),
      properties: Object.freeze({ ...protocol.properties }),
    }) as TProtocol & ProtocolDefinition<TApi>;

export const protocolKey = (protocol: AnyProtocolDefinition) => `${protocol.id}@${protocol.version}`;

export const missingProtocolMembers = (provided: AnyProtocolDefinition, required: AnyProtocolDefinition) => ({
  methods: Object.keys(required.methods).filter((method) => !(method in provided.methods)),
  properties: Object.keys(required.properties).filter((property) => !(property in provided.properties)),
});

export const protocolSatisfies = (provided: AnyProtocolDefinition, required: AnyProtocolDefinition) => {
  if (provided.id !== required.id || provided.version !== required.version) return false;
  const missing = missingProtocolMembers(provided, required);
  return missing.methods.length === 0 && missing.properties.length === 0;
};

export const assertProtocolImplementation = (protocol: AnyProtocolDefinition, implementation: object) => {
  const value = implementation as Record<string, unknown>;
  const missingMethods = Object.keys(protocol.methods).filter((method) => typeof value[method] !== "function");
  const missingProperties = Object.keys(protocol.properties).filter((property) => !(property in value));
  if (missingMethods.length === 0 && missingProperties.length === 0) return;
  const details = [
    ...(missingMethods.length > 0 ? [`方法：${missingMethods.join(", ")}`] : []),
    ...(missingProperties.length > 0 ? [`属性：${missingProperties.join(", ")}`] : []),
  ];
  throw new Error(`协议 ${protocolKey(protocol)} 实现不完整，缺少${details.join("；")}`);
};
