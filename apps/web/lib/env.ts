import "server-only";
import { z } from "zod";

// The only place process.env is read in the web app.
const deployedEnv = z.object({
  VEHICLE_API_AUTH: z.literal("oidc"),
  VEHICLE_API_URL: z.url(),
  GCP_PROJECT_NUMBER: z.string().min(1),
  GCP_WORKLOAD_IDENTITY_POOL_ID: z.string().min(1),
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: z.string().min(1),
  GCP_SERVICE_ACCOUNT_EMAIL: z.email(),
});

// `pnpm dev:local` runs against the API in Docker, which has no Cloud Run IAM in front of it.
// Refused on any Vercel deployment so a stray variable can't switch off auth there.
const localEnv = z.object({
  VEHICLE_API_AUTH: z.literal("none"),
  VEHICLE_API_URL: z.url(),
  VERCEL_ENV: z.literal("development", { error: "VEHICLE_API_AUTH=none is for local development only" }).optional(),
});

const envSchema = z.discriminatedUnion("VEHICLE_API_AUTH", [deployedEnv, localEnv]);

export type DeployedEnv = z.infer<typeof deployedEnv>;

export const env = envSchema.parse({ VEHICLE_API_AUTH: "oidc", ...process.env });
