import "dotenv/config";
import { z } from "zod";

// Two ways to reach Postgres:
// - Local: DATABASE_URL points at Docker Postgres.
// - Cloud Run: Cloud SQL connector with IAM login (no password). See docs/decisions.md#db-access
const envSchema = z
  .object({
    PORT: z.coerce.number().default(8080),
    DATABASE_URL: z.url().optional(),
    INSTANCE_CONNECTION_NAME: z.string().optional(),
    DB_NAME: z.string().default("vehicle_support"),
    DB_IAM_USER: z.string().optional(),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(1200),
  })
  .refine((env) => env.DATABASE_URL || (env.INSTANCE_CONNECTION_NAME && env.DB_IAM_USER), {
    message: "Set DATABASE_URL, or INSTANCE_CONNECTION_NAME and DB_IAM_USER",
  });

export const env = envSchema.parse(process.env);
