export const ACTIVE_SEARCH_PARAM_VALUE = "1";
export const FULLSCREEN_SEARCH_PARAM = "fullscreen";
export const FULLSCREEN_SEARCH = `?${FULLSCREEN_SEARCH_PARAM}=${ACTIVE_SEARCH_PARAM_VALUE}`;

type SearchParamValue = string | number | boolean | null | undefined;
type SearchParamEntries = Record<string, SearchParamValue> | ReadonlyArray<readonly [string, SearchParamValue]>;

export const buildSearch = (entries: SearchParamEntries) => {
  const params = new URLSearchParams();
  const iterable = Array.isArray(entries) ? entries : Object.entries(entries);

  for (const [key, value] of iterable) {
    if (value === null || value === undefined || value === false || value === "") {
      continue;
    }

    params.set(key, value === true ? ACTIVE_SEARCH_PARAM_VALUE : String(value));
  }

  const search = params.toString();
  return search ? `?${search}` : "";
};

export const isSearchParamActive = (search: string, param: string) =>
  new URLSearchParams(search).get(param) === ACTIVE_SEARCH_PARAM_VALUE;

export const isFullscreenSearch = (search: string) => isSearchParamActive(search, FULLSCREEN_SEARCH_PARAM);
