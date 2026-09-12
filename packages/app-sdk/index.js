import Schema from "@deepseek-ai/schemastery";
import { isRiskLevel } from "@isle/chat-contracts";

export { Schema as schema };

const SETTINGS_VERSION_KEY = "$version";
const SETTINGS_NAMESPACE = /^[a-z][a-z0-9-]*$/;

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicSettings = (value) => {
  const { [SETTINGS_VERSION_KEY]: _version, ...settings } = isRecord(value)
    ? value
    : {};
  return Object.freeze(settings);
};

const versionedScope = (scope, version) => ({
  get: () => publicSettings(scope.get()),
  update: (patch) => {
    if (!isRecord(patch))
      throw new TypeError("settings update must be a plain object");
    const { [SETTINGS_VERSION_KEY]: _version, ...settings } = patch;
    return scope.update({ ...settings, [SETTINGS_VERSION_KEY]: version });
  },
  replace: (value) => {
    if (!isRecord(value))
      throw new TypeError("settings replacement must be a plain object");
    const { [SETTINGS_VERSION_KEY]: _version, ...settings } = value;
    return scope.replace({ ...settings, [SETTINGS_VERSION_KEY]: version });
  },
  watch: (callback) =>
    scope.watch((next, previous) =>
      callback(publicSettings(next), publicSettings(previous)),
    ),
});

/**
 * Declare one versioned settings namespace. Schema defaults form the bottom
 * layer, `defaults` are the application's composition defaults, and the persisted
 * section is the user override layer. Migrations only transform that raw user
 * layer, so changing a future default does not freeze inherited values.
 */
export const defineSettings = (definition) => {
  if (!isRecord(definition))
    throw new TypeError("settings definition must be an object");
  const namespace =
    typeof definition.namespace === "string" ? definition.namespace : "";
  if (!SETTINGS_NAMESPACE.test(namespace))
    throw new TypeError(`invalid settings namespace: ${namespace}`);
  const version = definition.version;
  if (!Number.isSafeInteger(version) || version < 1)
    throw new TypeError("settings version must be a positive integer");
  if (typeof definition.schema !== "function")
    throw new TypeError("settings schema must be a schema value");
  if (definition.defaults !== undefined && !isRecord(definition.defaults)) {
    throw new TypeError("settings defaults must be a plain object");
  }

  const storageSchema = Schema.intersect([
    definition.schema,
    Schema.object({
      [SETTINGS_VERSION_KEY]: Schema.natural().default(version).hidden(),
    }),
  ]);

  return Object.freeze({
    namespace,
    version,
    schema: definition.schema,
    async register(context) {
      if (typeof context.settings.describe !== "function") {
        throw new Error(
          `settings namespace "${namespace}" requires a host with versioned settings support`,
        );
      }
      const base = {
        ...(definition.defaults ?? {}),
        [SETTINGS_VERSION_KEY]: version,
      };
      const scope = context.settings.register(namespace, storageSchema, {
        base,
        applies: definition.applies ?? "live",
        ...(typeof definition.validate === "function"
          ? { validate: (value) => definition.validate(publicSettings(value)) }
          : {}),
      });
      const descriptor = context.settings
        .describe()
        .find((candidate) => candidate.ns === namespace);
      if (descriptor === undefined)
        throw new Error(`settings namespace "${namespace}" was not registered`);
      const rawUser = isRecord(descriptor?.user)
        ? structuredClone(descriptor.user)
        : undefined;
      if (rawUser === undefined || Object.keys(rawUser).length === 0)
        return versionedScope(scope, version);

      const rawVersion = rawUser[SETTINGS_VERSION_KEY] ?? 0;
      if (!Number.isSafeInteger(rawVersion) || rawVersion < 0) {
        throw new Error(
          `settings namespace "${namespace}" has an invalid ${SETTINGS_VERSION_KEY}`,
        );
      }
      if (rawVersion > version) {
        throw new Error(
          `settings namespace "${namespace}" uses newer version ${rawVersion}; application supports ${version}`,
        );
      }

      delete rawUser[SETTINGS_VERSION_KEY];
      let migrated = rawUser;
      for (
        let nextVersion = rawVersion + 1;
        nextVersion <= version;
        nextVersion += 1
      ) {
        const migrate = definition.migrations?.[nextVersion];
        if (typeof migrate !== "function") {
          throw new Error(
            `settings namespace "${namespace}" is missing migration to version ${nextVersion}`,
          );
        }
        const next = await migrate(structuredClone(migrated));
        if (!isRecord(next)) {
          throw new Error(
            `settings namespace "${namespace}" migration to version ${nextVersion} returned invalid data`,
          );
        }
        delete next[SETTINGS_VERSION_KEY];
        migrated = next;
      }
      if (rawVersion !== version)
        await scope.replace({ ...migrated, [SETTINGS_VERSION_KEY]: version });
      return versionedScope(scope, version);
    },
  });
};

/**
 * Isle applications use Cordis lifecycle semantics. Tool authoring validates the
 * risk declaration used by the host's approval policy.
 */
export const defineApplication = (application) => application;

export const defineTool = (tool) => {
  if (!isRiskLevel(tool?.risk))
    throw new Error("工具必须声明 risk：low、medium 或 high");
  return tool;
};

export const defineSkill = (skill) => skill;
