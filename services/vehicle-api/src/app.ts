import express from "express";
import { rateLimit } from "express-rate-limit";
import { errorHandler } from "./errors.js";
import { casesRouter } from "./routes/cases.js";
import { customersRouter } from "./routes/customers.js";
import { vehiclesRouter } from "./routes/vehicles.js";

export const app = express();

// Cloud Run sits behind Google's load balancer; trust it for the client IP used by rate limiting.
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Backstop only; the primary limit sits in front of the AI routes on Vercel.
// See docs/decisions.md#rate-limiting
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));

app.use("/customers", customersRouter);
app.use("/vehicles", vehiclesRouter);
app.use("/cases", casesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
});
app.use(errorHandler);
