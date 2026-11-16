import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

// Every error leaves the API in one shape: { error: { code, message } }.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "invalid_request", message: err.issues.map((i) => i.message).join("; ") },
    });
    return;
  }
  // Thrown by express.json() before any route runs: a client mistake, not a server failure.
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "invalid_json", message: "Request body is not valid JSON" } });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "too_large", message: "Request body is too large" } });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: "not_found", message: err.message } });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: { code: "conflict", message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
};
