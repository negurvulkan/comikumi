import type { NextFunction, Request, RequestHandler, Response } from "express";

/** None of this app's routes use Express 5's wildcard/array-capturing param syntax
 * (`*name`) — every `:param` is a single named segment — so `req.params.xxx` is always
 * a plain string. Pinning the Request's param generic to Record<string, string> here
 * (instead of the default ParamsDictionary, which Express 5 widened to
 * `string | string[]` to account for wildcard routes) keeps that true for every handler
 * wrapped in asyncHandler, without an `as string`/`Array.isArray` check at each call site. */
type StringParams = Record<string, string>;

/** Express 4 doesn't forward a rejected promise from an async route handler to
 * `next()` on its own — an unhandled rejection just leaves the request hanging
 * instead of producing a response. Wrapping every handler in this forwards any
 * thrown/rejected error to the error-handling middleware in index.ts. */
export function asyncHandler(
  fn: (req: Request<StringParams>, res: Response, next: NextFunction) => Promise<void>
): RequestHandler<StringParams> {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
