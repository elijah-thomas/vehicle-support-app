import "server-only";
import { z } from "zod";

// The only place process.env is read in the web app.
const envSchema = z.object({
  VEHICLE_API_URL: z.url(),
  GCP_PROJECT_NUMBER: z.string().min(1),
  GCP_WORKLOAD_IDENTITY_POOL_ID: z.string().min(1),
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: z.string().min(1),
  GCP_SERVICE_ACCOUNT_EMAIL: z.email(),
});

export const env = envSchema.parse(process.env);
