import { createRequire } from "node:module";

// Runtime CJS load — Next/webpack breaks ESM named imports from this package.
const require = createRequire(import.meta.url);
const cb = require("couchbase") as typeof import("couchbase");

export default cb;
export const {
  connect,
  SearchQuery,
  SearchRequest,
  SearchFacet,
  HighlightStyle,
  DocumentNotFoundError,
  DocumentExistsError,
} = cb;
