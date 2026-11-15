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
