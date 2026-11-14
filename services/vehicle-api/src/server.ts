import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Cloud Run injects PORT; 8080 is its default.
const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`vehicle-api listening on :${port}`);
});
