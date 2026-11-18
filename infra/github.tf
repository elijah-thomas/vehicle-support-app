# GitHub Actions deploys the API with no stored GCP key: GitHub's OIDC token is exchanged via
# WIF. Only this repository is trusted (matched by immutable ID, so a renamed or recreated repo
# with the same name can't impersonate it), and each branch can only act as its environment's
# deployer: develop → staging, master → production. See docs/decisions.md#environments

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub OIDC"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository"    = "assertion.repository"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
  }

  attribute_condition = "assertion.repository_id == '${var.github_repository_id}'"
}

resource "google_service_account" "deployer" {
  for_each     = local.environments
  account_id   = "vehicle-support-deploy${each.value.suffix}"
  display_name = "GitHub Actions deployer (${each.key})"
}

# Only workflow runs on this environment's branch may act as its deployer.
resource "google_service_account_iam_member" "github_acts_as_deployer" {
  for_each           = local.environments
  service_account_id = google_service_account.deployer[each.key].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.ref/${each.value.branch}"
}

# Push images to the shared repository.
resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  for_each   = local.environments
  repository = google_artifact_registry_repository.images.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer[each.key].member
}

# Roll out new revisions of its own service only.
resource "google_cloud_run_v2_service_iam_member" "deployer_deploys_api" {
  for_each = local.environments
  name     = google_cloud_run_v2_service.api[each.key].name
  location = var.region
  role     = "roles/run.developer"
  member   = google_service_account.deployer[each.key].member
}

# Deploying a revision that runs as the API service account requires actAs on it.
resource "google_service_account_iam_member" "deployer_acts_as_api" {
  for_each           = local.environments
  service_account_id = google_service_account.api[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer[each.key].member
}

# Run migrations through the Cloud SQL Auth Proxy as its IAM database user.
resource "google_project_iam_member" "deployer_sql" {
  for_each = {
    for pair in setproduct(keys(local.environments), local.sql_roles) :
    "${pair[0]}:${pair[1]}" => { env = pair[0], role = pair[1] }
  }
  project = var.project_id
  role    = each.value.role
  member  = google_service_account.deployer[each.value.env].member
}
