# Identity AI Gateway uses to call Gemini on Vertex (BYOK), so model spend lands on the GCP
# commitment. AI Gateway's Vertex BYOK accepts only a service account key, so this account's
# key is the one long-lived credential in the system. It is scoped to Vertex AI User only, its
# key is created in the Google Cloud console (never in Terraform state), and it is stored only
# in AI Gateway's BYOK settings. Decision (D5). See docs/decisions.md#models
resource "google_service_account" "vertex" {
  account_id   = "vehicle-support-vertex"
  display_name = "AI Gateway → Vertex AI (BYOK)"
}

resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = google_service_account.vertex.member
}

output "vertex_byok_service_account" {
  description = "Create a JSON key for this account in the console and add it to AI Gateway BYOK (Google Vertex AI)."
  value       = google_service_account.vertex.email
}
