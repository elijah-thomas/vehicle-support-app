import express from "express";
import { errorHandler } from "./errors.js";
import { rateLimitPerCaller } from "./rate-limit.js";
import { casesRouter } from "./routes/cases.js";
import { customersRouter } from "./routes/customers.js";
import { vehiclesRouter } from "./routes/vehicles.js";

export const app = express();

// Cloud Run sits behind Google's load balancer; trust it for the client IP (the local fallback key).
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Backstop only; the per-person limits sit in front of the app on Vercel.
app.use(rateLimitPerCaller);

app.use("/customers", customersRouter);
app.use("/vehicles", vehiclesRouter);
app.use("/cases", casesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
});
app.use(errorHandler);
