resource "google_artifact_registry_repository" "images" {
  repository_id = "vehicle-support"
  location      = var.region
  format        = "DOCKER"
  description   = "vehicle-support-app container images"
}

# Builds run as their own service account rather than the project's shared default compute
# account, with only the three permissions a build needs.
resource "google_service_account" "build" {
  account_id   = "vehicle-support-build"
  display_name = "vehicle-support-app image builds"
}

resource "google_artifact_registry_repository_iam_member" "build_push" {
  repository = google_artifact_registry_repository.images.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.build.member
}

resource "google_storage_bucket_iam_member" "build_read_source" {
  bucket = "${var.project_id}_cloudbuild"
  role   = "roles/storage.objectViewer"
  member = google_service_account.build.member
}

resource "google_project_iam_member" "build_logs" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = google_service_account.build.member
}

import {
  to = google_artifact_registry_repository.images
  id = "projects/${var.project_id}/locations/${var.region}/repositories/vehicle-support"
}
import {
  to = google_service_account.build
  id = "projects/${var.project_id}/serviceAccounts/vehicle-support-build@${var.project_id}.iam.gserviceaccount.com"
}
import {
  to = google_artifact_registry_repository_iam_member.build_push
  id = "projects/${var.project_id}/locations/${var.region}/repositories/vehicle-support roles/artifactregistry.writer serviceAccount:vehicle-support-build@${var.project_id}.iam.gserviceaccount.com"
}
import {
  to = google_storage_bucket_iam_member.build_read_source
  id = "b/${var.project_id}_cloudbuild roles/storage.objectViewer serviceAccount:vehicle-support-build@${var.project_id}.iam.gserviceaccount.com"
}
import {
  to = google_project_iam_member.build_logs
  id = "${var.project_id} roles/logging.logWriter serviceAccount:vehicle-support-build@${var.project_id}.iam.gserviceaccount.com"
}
