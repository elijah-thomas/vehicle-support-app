# Workload Identity Federation: lets the Vercel app call the private Cloud Run API with no
# long-lived secret. See docs/decisions.md#boundary-auth
#
# Vercel OIDC token ─► STS (this pool/provider) ─► federated credential
#   ─► generateIdToken for vehicle-support-caller ─► Cloud Run IAM checks run.invoker

resource "google_iam_workload_identity_pool" "vercel" {
  workload_identity_pool_id = "vercel"
  display_name              = "Vercel"
  description               = "Trusts OIDC tokens from the Vercel team that hosts the web app."
}

resource "google_iam_workload_identity_pool_provider" "vercel" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.vercel.workload_identity_pool_id
  workload_identity_pool_provider_id = "vercel"
  display_name                       = "Vercel OIDC"

  # Team issuer: only tokens minted for this Vercel team are accepted.
  oidc {
    issuer_uri        = "https://oidc.vercel.com/${var.vercel_team_slug}"
    allowed_audiences = ["https://vercel.com/${var.vercel_team_slug}"]
  }

  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.project"     = "assertion.project"
    "attribute.environment" = "assertion.environment"
  }

  # Other projects in the same Vercel team are rejected at the token exchange.
  attribute_condition = "assertion.project == '${var.vercel_project_name}'"
}

# The identity the Vercel app acts as. Its only permission: invoke this one Cloud Run service.
resource "google_service_account" "caller" {
  account_id   = "vehicle-support-caller"
  display_name = "Vercel web app → vehicle API caller"
}

resource "google_cloud_run_v2_service_iam_member" "caller_invokes_api" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = google_service_account.caller.member
}

# Federated identities from the Vercel project may mint ID tokens for the caller account.
resource "google_service_account_iam_member" "vercel_mints_caller_id_tokens" {
  service_account_id = google_service_account.caller.name
  role               = "roles/iam.serviceAccountOpenIdTokenCreator"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.vercel.name}/attribute.project/${var.vercel_project_name}"
}
