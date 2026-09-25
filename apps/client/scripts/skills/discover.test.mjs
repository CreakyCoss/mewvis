import assert from "node:assert/strict";
import test from "node:test";
import { formatMarketplaceUpdatedAt } from "../../src/workbench/pages/skills/discover/utils.ts";
import { useMarketplaceStore } from "../../src/workbench/pages/skills/discover/store.ts";

test("marketplace dates accept numeric timestamps and ignore invalid values", () => {
  const seconds = 1_700_000_000;
  assert.equal(formatMarketplaceUpdatedAt(seconds), formatMarketplaceUpdatedAt(seconds * 1000));
  assert.equal(formatMarketplaceUpdatedAt(String(seconds)), formatMarketplaceUpdatedAt(seconds));
  assert.equal(formatMarketplaceUpdatedAt({}), null);
  assert.equal(formatMarketplaceUpdatedAt(Number.NaN), null);
});

test("discovery starts without a search and can return to the empty state", () => {
  const store = useMarketplaceStore;
  assert.equal(store.getState().query, "");
  assert.equal(store.getState().hasLoaded, false);

  store.getState().setSearchResult(
    { query: "设计", sortBy: "stars" },
    {
      skills: [{ name: "design", githubUrl: "https://example.com/design" }],
      pagination: null,
    },
  );
  assert.equal(store.getState().query, "设计");
  assert.equal(store.getState().hasLoaded, true);

  store.getState().clearSearch();
  assert.equal(store.getState().query, "");
  assert.equal(store.getState().hasLoaded, false);
  assert.deepEqual(store.getState().results, []);
});
