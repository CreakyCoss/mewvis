import assert from "node:assert/strict";
import { test } from "node:test";
import { Skills } from "../../dist/modules/skills/service.js";

test("empty marketplace query loads popular or recent skills", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input) => {
    requests.push(new URL(input));
    return new Response(
      JSON.stringify({
        success: true,
        data: { skills: [{ name: "example" }], pagination: null },
      }),
      { headers: { "content-type": "application/json" } },
    );
  };

  try {
    const service = new Skills(null, "/unused");
    assert.deepEqual((await service.search({ query: "" })).skills, [{ name: "example" }]);
    assert.deepEqual((await service.search({ query: " ", sortBy: "updatedAt" })).skills, [
      { name: "example" },
    ]);
    await service.search({ query: "debugging", sortBy: "stars" });

    assert.deepEqual(
      requests.map((url) => [url.searchParams.get("q"), url.searchParams.get("sortBy")]),
      [
        ["skill", "stars"],
        ["skill", "recent"],
        ["debugging", "stars"],
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
