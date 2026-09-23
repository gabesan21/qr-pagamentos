// The reserved invalid-filters notice pair: every directory query resolver
// that resolves `invalid-query` from URL input redirects to its reset path
// carrying this exact pair instead of rendering the closed `invalid-query`
// component state. No I/O, no dictionary, no React — resolvers and the
// `NoticeToast` bridge consumer both import this module directly.
export const DIRECTORY_INVALID_FILTERS_PARAM = "filters";
export const DIRECTORY_INVALID_FILTERS_VALUE = "ignored";

// Builds the reset location a resolver redirects to when URL input cannot be
// canonicalized: the bare reset `path` plus the reserved pair, never an
// echoed value. Every resolver must also strip this pair before its own
// canonicalization so the redirect never loops.
export function directoryInvalidFiltersLocation(path: string): string {
  return `${path}?${DIRECTORY_INVALID_FILTERS_PARAM}=${DIRECTORY_INVALID_FILTERS_VALUE}`;
}
