import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { IdentityPoolClient } from "google-auth-library";
import { env } from "@/lib/env";

// Vercel OIDC token → GCP STS (Workload Identity Federation) → short-lived Google credential
// → ID token for the caller service account, which Cloud Run IAM checks.
// No long-lived secret exists in this chain. See docs/decisions.md#boundary-auth
const federated = new IdentityPoolClient({
  type: "external_account",
  audience: `//iam.googleapis.com/projects/${env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
  subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
  token_url: "https://sts.googleapis.com/v1/token",
  subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
});

// Reused across requests on the same Fluid Compute instance; refreshed shortly before expiry.
let cached: { token: string; expiresAt: number } | undefined;

export async function getVehicleApiIdToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;

  const { token: accessToken } = await federated.getAccessToken();
  const response = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.GCP_SERVICE_ACCOUNT_EMAIL}:generateIdToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ audience: env.VEHICLE_API_URL, includeEmail: true }),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not get an ID token for the vehicle API (${response.status})`);
  }

  const { token } = (await response.json()) as { token: string };
  // Google ID tokens last one hour.
  cached = { token, expiresAt: Date.now() + 60 * 60_000 };
  return token;
}
