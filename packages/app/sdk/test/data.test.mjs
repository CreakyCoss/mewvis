import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createApplicationDataClient,
  getApplicationDataClient,
  ApplicationDataError,
  APPLICATION_DATA_PERMISSIONS,
} from "@isle/app-sdk/data";

const workspace = {
  id: "ws-1",
  name: "小说",
  path: "/selected/novel",
  isDefault: false,
};
const success = (value) => ({ ok: true, value });
const isCode = (code) => (error) =>
  error instanceof ApplicationDataError && error.code === code;
const connect = (handler) => {
  const requests = [];
  const client = createApplicationDataClient({
    version: 1,
    async request(request) {
      requests.push(request);
      return handler(request);
    },
  });
  return { ...client, requests };
};

test("business storage uses the versioned transport, including empty and reserved-looking keys", async () => {
  const values = new Map();
  const transport = {
    version: 1,
    async request({ method, params }) {
      switch (method) {
        case "storage.getItem":
          return success(values.get(params.key) ?? null);
        case "storage.setItem":
          values.set(params.key, params.value);
          return success(null);
        case "storage.removeItem":
          values.delete(params.key);
          return success(null);
        case "storage.clear":
          values.clear();
          return success(null);
        case "storage.keys":
          return success([...values.keys()]);
        default:
          assert.fail(method);
      }
    },
  };
  const first = createApplicationDataClient(transport).storage;
  const second = createApplicationDataClient(transport).storage;
  assert.equal(await first.getItem("missing"), null);
  for (const key of ["", "__proto__", "workspaces", "editor"]) {
    await first.setItem(key, { line: 12, selection: [0, 4], enabled: true });
    assert.deepEqual(await second.getItem(key), {
      line: 12,
      selection: [0, 4],
      enabled: true,
    });
  }
  assert.deepEqual(
    new Set(await second.keys()),
    new Set(["", "__proto__", "workspaces", "editor"]),
  );
  await second.setItem("editor", false);
  assert.equal(await first.getItem("editor"), false);
  await first.removeItem("missing");
  await first.removeItem("editor");
  assert.equal(await second.getItem("editor"), null);
  await second.clear();
  assert.deepEqual(await first.keys(), []);
});

test("requests carry only operation data, never caller identity or storage details", async () => {
  const client = connect(({ method }) =>
    success(method === "workspaces.get" ? workspace : null),
  );
  await client.storage.getItem("editor");
  await client.storage.setItem("editor", { line: 1 });
  await client.storage.removeItem("editor");
  await client.storage.clear();
  await client.workspaces.get("ws-1");
  assert.deepEqual(client.requests, [
    { version: 1, method: "storage.getItem", params: { key: "editor" } },
    {
      version: 1,
      method: "storage.setItem",
      params: { key: "editor", value: { line: 1 } },
    },
    { version: 1, method: "storage.removeItem", params: { key: "editor" } },
    { version: 1, method: "storage.clear" },
    { version: 1, method: "workspaces.get", params: { id: "ws-1" } },
  ]);
  assert.deepEqual(APPLICATION_DATA_PERMISSIONS, {
    storage: "application-data",
    workspaces: "application-workspaces",
  });
});

test("writes snapshot JSON before dispatch and reads do not share transport-owned objects", async () => {
  let finish;
  const response = { nested: { value: 1 } };
  const client = connect(({ method }) =>
    method === "storage.setItem"
      ? new Promise((resolve) => {
          finish = () => resolve(success(null));
        })
      : success(response),
  );
  const input = { nested: { value: 1 } };
  const saving = client.storage.setItem("key", input);
  input.nested.value = 2;
  assert.equal(client.requests[0].params.value.nested.value, 1);
  finish();
  await saving;
  const loaded = await client.storage.getItem("key");
  loaded.nested.value = 3;
  assert.equal(response.nested.value, 1);
  const shared = { value: "same object in two positions" };
  await connect(() => success(null)).storage.setItem("key", [shared, shared]);
});

test("non-JSON data is rejected before dispatch instead of silently losing values", async () => {
  const cycle = {};
  cycle.self = cycle;
  let getterCalls = 0;
  const accessor = {
    get value() {
      getterCalls++;
      return 1;
    },
  };
  const extendedArray = Object.assign([1], { extra: 2 });
  class CustomArray extends Array {}
  const invalid = [
    undefined,
    NaN,
    Infinity,
    1n,
    Symbol("value"),
    () => {},
    new Date(),
    new Map(),
    { child: undefined },
    [undefined],
    new Array(2),
    extendedArray,
    new CustomArray(1, 2),
    cycle,
    accessor,
    { [Symbol("hidden")]: 1 },
    Object.defineProperty({}, "hidden", { value: 1 }),
  ];
  const client = connect(() =>
    assert.fail("invalid values must not reach transport"),
  );
  for (const value of invalid)
    await assert.rejects(
      client.storage.setItem("key", value),
      isCode("INVALID_ARGUMENT"),
    );
  await assert.rejects(
    client.storage.setItem(1, "value"),
    isCode("INVALID_ARGUMENT"),
  );
  assert.equal(getterCalls, 0);
  assert.equal(client.requests.length, 0);
});

test("workspace creation supports the host picker, an explicit path, and cancellation", async () => {
  const client = connect(({ params }) =>
    success(params.path ? workspace : null),
  );
  assert.equal(await client.workspaces.create({ name: "小说" }), null);
  const created = await client.workspaces.create({
    name: "小说",
    path: "/selected/novel",
  });
  assert.deepEqual(created, workspace);
  assert.ok(Object.isFrozen(created));
  assert.deepEqual(client.requests, [
    { version: 1, method: "workspaces.create", params: { name: "小说" } },
    {
      version: 1,
      method: "workspaces.create",
      params: { name: "小说", path: "/selected/novel" },
    },
  ]);
});

test("workspace lookups never join, create, or inject membership and confirmation flags", async () => {
  const client = connect(({ method }) =>
    success(method === "workspaces.list" ? [workspace] : workspace),
  );
  assert.deepEqual(await client.workspaces.list(), [workspace]);
  assert.deepEqual(await client.workspaces.get("ws-1"), workspace);
  assert.deepEqual(
    client.requests.map(({ method }) => method),
    ["workspaces.list", "workspaces.get"],
  );
  const before = client.requests.length;
  for (const input of [
    { name: "" },
    { name: "小说", path: " " },
    { name: "小说", applicationId: "other" },
    { name: "小说", approved: true },
    { name: "小说", applications: ["other"] },
    { name: "小说", workspaceId: "other" },
  ])
    await assert.rejects(
      client.workspaces.create(input),
      isCode("INVALID_ARGUMENT"),
    );
  await assert.rejects(client.workspaces.get(""), isCode("INVALID_ARGUMENT"));
  assert.equal(client.requests.length, before);
});

test("host permission errors remain structured for every operation, with no fallback or retry", async () => {
  const client = connect(() => ({
    ok: false,
    error: { code: "PERMISSION_DENIED", message: "未声明权限" },
  }));
  const operations = [
    () => client.storage.getItem("key"),
    () => client.storage.setItem("key", 1),
    () => client.storage.removeItem("key"),
    () => client.storage.clear(),
    () => client.storage.keys(),
    () => client.workspaces.create({ name: "小说" }),
    () => client.workspaces.list(),
    () => client.workspaces.get("ws-1"),
  ];
  for (const operation of operations) {
    await assert.rejects(
      operation(),
      (error) =>
        isCode("PERMISSION_DENIED")(error) && error.message === "未声明权限",
    );
  }
  assert.equal(client.requests.length, operations.length);
});

test("missing directories and unavailable confirmation are errors, not creation or cancellation", async () => {
  for (const code of [
    "WORKSPACE_NOT_FOUND",
    "WORKSPACE_UNAVAILABLE",
    "WORKSPACE_MARKER_INVALID",
    "CONFIRMATION_UNAVAILABLE",
  ]) {
    const client = connect(() => ({
      ok: false,
      error: { code, message: code },
    }));
    await assert.rejects(client.workspaces.get("ws-1"), isCode(code));
    assert.equal(client.requests.length, 1);
  }
});

test("malformed responses never appear as successful empty reads or writes", async () => {
  for (const response of [
    undefined,
    {},
    { ok: "true" },
    { ok: false, error: { code: "TYPO", message: "bad" } },
    success(undefined),
  ]) {
    await assert.rejects(
      connect(() => response).storage.getItem("key"),
      isCode("INVALID_RESPONSE"),
    );
  }
  await assert.rejects(
    connect(() => success(false)).storage.setItem("key", 1),
    isCode("INVALID_RESPONSE"),
  );
  await assert.rejects(
    connect(() => success([1])).storage.keys(),
    isCode("INVALID_RESPONSE"),
  );
  await assert.rejects(
    connect(() => success(null)).workspaces.get("ws-1"),
    isCode("INVALID_RESPONSE"),
  );
  await assert.rejects(
    connect(() => success([{}])).workspaces.list(),
    isCode("INVALID_RESPONSE"),
  );
  await assert.rejects(
    connect(() => success({ ...workspace, path: "" })).workspaces.create({
      name: "小说",
    }),
    isCode("INVALID_RESPONSE"),
  );
});

test("uncertain transport failures are not retried or reported as host denial", async () => {
  const cause = new Error("connection closed after dispatch");
  const client = connect(() => {
    throw cause;
  });
  await assert.rejects(
    client.storage.setItem("key", 1),
    (error) => isCode("TRANSPORT_ERROR")(error) && error.cause === cause,
  );
  assert.equal(client.requests.length, 1);
});

test("browser clients require an explicit supported bridge and follow bridge replacement", async () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "isleApplication",
  );
  try {
    for (const host of [
      undefined,
      { version: 1 },
      { version: 1, data: { version: 2, request() {} } },
    ]) {
      globalThis.isleApplication = host;
      assert.throws(getApplicationDataClient, isCode("CAPABILITY_UNAVAILABLE"));
    }
    for (const value of ["first connection", "new connection"]) {
      globalThis.isleApplication = {
        version: 1,
        data: { version: 1, request: async () => success(value) },
      };
      assert.equal(
        await getApplicationDataClient().storage.getItem("key"),
        value,
      );
    }
  } finally {
    if (previous)
      Object.defineProperty(globalThis, "isleApplication", previous);
    else delete globalThis.isleApplication;
  }
});
test("directory selection, exclusive creation and removal use the generic workspace transport", async () => {
  const client = connect((request) =>
    success(
      request.method === "workspaces.selectDirectory"
        ? "/chosen"
        : request.method === "workspaces.create"
          ? workspace
          : null,
    ),
  );
  assert.equal(await client.workspaces.selectDirectory(), "/chosen");
  await client.workspaces.create({
    name: "小说",
    path: "/new",
    exclusive: true,
  });
  await client.workspaces.remove({ id: "ws-1", deleteContent: true });
  assert.deepEqual(client.requests, [
    { version: 1, method: "workspaces.selectDirectory" },
    {
      version: 1,
      method: "workspaces.create",
      params: { name: "小说", path: "/new", exclusive: true },
    },
    {
      version: 1,
      method: "workspaces.remove",
      params: { id: "ws-1", deleteContent: true },
    },
  ]);
  await assert.rejects(
    client.workspaces.remove({ id: "ws-1", deleteContent: "yes" }),
    isCode("INVALID_ARGUMENT"),
  );
  await assert.rejects(
    client.workspaces.create({ name: "小说", exclusive: "yes" }),
    isCode("INVALID_ARGUMENT"),
  );
});
