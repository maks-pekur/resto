import type { paths as allPaths } from './generated/api.js';

export type paths = Pick<allPaths, Extract<keyof allPaths, `/internal/v1/${string}`>>;
export type { components, operations } from './generated/api.js';
