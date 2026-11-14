import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class NotFoundError extends Error {}

// Every error leaves the API in one shape: { error: { code, message } }.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "invalid_request", message: err.issues.map((i) => i.message).join("; ") },
    });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: "not_found", message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
};
