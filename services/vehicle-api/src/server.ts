import express from "express";
import { env } from "./env.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Cloud Run injects PORT; 8080 is its default.
app.listen(env.PORT, () => {
  console.log(`vehicle-api listening on :${env.PORT}`);
});
