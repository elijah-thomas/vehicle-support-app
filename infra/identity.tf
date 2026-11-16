# Decision (D3): Workload Identity Federation lets the Vercel app call the private Cloud Run API
# with no long-lived secret. Trade-off: identity, not network isolation (Secure Compute is the
# production step). See docs/decisions.md#boundary-auth
#
# Vercel OIDC token ─► STS (this pool/provider) ─► federated credential
#   ─► generateIdToken for the caller account ─► Cloud Run IAM checks run.invoker
#
# Vercel preview and development tokens can only become the staging caller; production
# tokens can only become the production caller. See docs/decisions.md#environments

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
    "attribute.deployment"  = "assertion.project + ':' + assertion.environment"
  }

  # Other projects in the same Vercel team are rejected at the token exchange.
  attribute_condition = "assertion.project == '${var.vercel_project_name}'"
}

# The identity the Vercel app acts as. Its only permission: invoke its environment's API.
resource "google_service_account" "caller" {
  for_each     = local.environments
  account_id   = "vehicle-support-caller${each.value.suffix}"
  display_name = "Vercel web app → vehicle API caller (${each.key})"
}

resource "google_cloud_run_v2_service_iam_member" "caller_invokes_api" {
  for_each = local.environments
  name     = google_cloud_run_v2_service.api[each.key].name
  location = var.region
  role     = "roles/run.invoker"
  member   = google_service_account.caller[each.key].member
}

resource "google_service_account_iam_member" "vercel_mints_caller_id_tokens" {
  for_each           = local.vercel_bindings
  service_account_id = google_service_account.caller[each.value.env].name
  role               = "roles/iam.serviceAccountOpenIdTokenCreator"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.vercel.name}/attribute.deployment/${var.vercel_project_name}:${each.value.vercel_env}"
}

moved {
  from = google_service_account.caller
  to   = google_service_account.caller["production"]
}
moved {
  from = google_cloud_run_v2_service_iam_member.caller_invokes_api
  to   = google_cloud_run_v2_service_iam_member.caller_invokes_api["production"]
}
