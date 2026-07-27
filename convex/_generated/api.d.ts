/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as dailySnapshots from "../dailySnapshots.js";
import type * as duneMetadata from "../duneMetadata.js";
import type * as graduatedTokens from "../graduatedTokens.js";
import type * as observed_peak_budget from "../observed_peak_budget.js";
import type * as observedPeaks from "../observedPeaks.js";
import type * as snapshot_guards from "../snapshot_guards.js";
import type * as syncRuns from "../syncRuns.js";
import type * as token_validator from "../token_validator.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  dailySnapshots: typeof dailySnapshots;
  duneMetadata: typeof duneMetadata;
  graduatedTokens: typeof graduatedTokens;
  observed_peak_budget: typeof observed_peak_budget;
  observedPeaks: typeof observedPeaks;
  snapshot_guards: typeof snapshot_guards;
  syncRuns: typeof syncRuns;
  token_validator: typeof token_validator;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
