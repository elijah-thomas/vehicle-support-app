import { app } from "./app.js";
import { env } from "./env.js";

// Cloud Run injects PORT; 8080 is its default.
app.listen(env.PORT, () => {
  console.log(`vehicle-api listening on :${env.PORT}`);
});
