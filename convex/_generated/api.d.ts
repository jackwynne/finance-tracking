/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountMerge from "../accountMerge.js";
import type * as akahu from "../akahu.js";
import type * as akahuActions from "../akahuActions.js";
import type * as akahuClient from "../akahuClient.js";
import type * as connectionTables from "../connectionTables.js";
import type * as crons from "../crons.js";
import type * as finance from "../finance.js";
import type * as fxActions from "../fxActions.js";
import type * as http from "../http.js";
import type * as importAction from "../importAction.js";
import type * as imports from "../imports.js";
import type * as investmentImportAction from "../investmentImportAction.js";
import type * as investmentImports from "../investmentImports.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_counterpartyDefaults from "../lib/counterpartyDefaults.js";
import type * as lib_finance from "../lib/finance.js";
import type * as lib_fxSource from "../lib/fxSource.js";
import type * as lib_investmentValidators from "../lib/investmentValidators.js";
import type * as lib_portfolioMath from "../lib/portfolioMath.js";
import type * as lib_portfolioPerformanceMath from "../lib/portfolioPerformanceMath.js";
import type * as lib_portfolioValidation from "../lib/portfolioValidation.js";
import type * as lib_spendingMath from "../lib/spendingMath.js";
import type * as lib_updateContract from "../lib/updateContract.js";
import type * as lib_updatePortfolio from "../lib/updatePortfolio.js";
import type * as lib_validators from "../lib/validators.js";
import type * as mcpConnections from "../mcpConnections.js";
import type * as mcpServer from "../mcpServer.js";
import type * as portfolio from "../portfolio.js";
import type * as portfolioHistory from "../portfolioHistory.js";
import type * as portfolioPerformance from "../portfolioPerformance.js";
import type * as portfolioTables from "../portfolioTables.js";
import type * as profiles from "../profiles.js";
import type * as setup from "../setup.js";
import type * as spending from "../spending.js";
import type * as updateTables from "../updateTables.js";
import type * as updates from "../updates.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountMerge: typeof accountMerge;
  akahu: typeof akahu;
  akahuActions: typeof akahuActions;
  akahuClient: typeof akahuClient;
  connectionTables: typeof connectionTables;
  crons: typeof crons;
  finance: typeof finance;
  fxActions: typeof fxActions;
  http: typeof http;
  importAction: typeof importAction;
  imports: typeof imports;
  investmentImportAction: typeof investmentImportAction;
  investmentImports: typeof investmentImports;
  "lib/auth": typeof lib_auth;
  "lib/counterpartyDefaults": typeof lib_counterpartyDefaults;
  "lib/finance": typeof lib_finance;
  "lib/fxSource": typeof lib_fxSource;
  "lib/investmentValidators": typeof lib_investmentValidators;
  "lib/portfolioMath": typeof lib_portfolioMath;
  "lib/portfolioPerformanceMath": typeof lib_portfolioPerformanceMath;
  "lib/portfolioValidation": typeof lib_portfolioValidation;
  "lib/spendingMath": typeof lib_spendingMath;
  "lib/updateContract": typeof lib_updateContract;
  "lib/updatePortfolio": typeof lib_updatePortfolio;
  "lib/validators": typeof lib_validators;
  mcpConnections: typeof mcpConnections;
  mcpServer: typeof mcpServer;
  portfolio: typeof portfolio;
  portfolioHistory: typeof portfolioHistory;
  portfolioPerformance: typeof portfolioPerformance;
  portfolioTables: typeof portfolioTables;
  profiles: typeof profiles;
  setup: typeof setup;
  spending: typeof spending;
  updateTables: typeof updateTables;
  updates: typeof updates;
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
