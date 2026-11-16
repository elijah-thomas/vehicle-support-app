variable "project_id" {
  description = "GCP project that hosts the customer's existing systems."
  type        = string
}

variable "project_number" {
  description = "Numeric project number (used in Workload Identity Federation principals)."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Cloud SQL, and Artifact Registry."
  type        = string
  default     = "us-central1"
}

variable "vercel_team_slug" {
  description = "Vercel team whose OIDC tokens GCP trusts."
  type        = string
}

variable "vercel_project_name" {
  description = "The only Vercel project allowed to call the vehicle API."
  type        = string
  default     = "vehicle-support-app"
}

variable "db_migrator_email" {
  description = "Google account that runs Prisma migrations as an IAM database user."
  type        = string
}

variable "github_repository_id" {
  description = "Immutable numeric ID of the GitHub repo allowed to deploy (gh api repos/OWNER/REPO --jq .id)."
  type        = string
}

variable "billing_account_id" {
  description = "Billing account the project is linked to, for the spend alert (gcloud billing projects describe PROJECT)."
  type        = string
}
