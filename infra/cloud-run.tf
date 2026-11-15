# Runtime identity for the API: may connect to Cloud SQL and log in as its IAM database user.
resource "google_service_account" "api" {
  account_id   = "vehicle-support-api"
  display_name = "vehicle-support-app API runtime"
}

resource "google_project_iam_member" "api_sql" {
  for_each = toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"])
  project  = var.project_id
  role     = each.value
  member   = google_service_account.api.member
}

# Terraform owns the service's shape (identity, env, scaling, who may call it).
# GitHub Actions owns which image is running, so Terraform ignores image changes.
resource "google_cloud_run_v2_service" "api" {
  name                = "vehicle-support-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      max_instance_count = 3
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/vehicle-support/vehicle-api:spike"

      resources {
        limits            = { cpu = "1000m", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.main.connection_name
      }
      env {
        name  = "DB_IAM_USER"
        value = google_sql_user.api.name
      }
      env {
        name  = "DB_NAME"
        value = google_sql_database.app.name
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
      template[0].labels,
      template[0].annotations,
    ]
  }
}

import {
  to = google_service_account.api
  id = "projects/${var.project_id}/serviceAccounts/vehicle-support-api@${var.project_id}.iam.gserviceaccount.com"
}
import {
  for_each = toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"])
  to       = google_project_iam_member.api_sql[each.value]
  id       = "${var.project_id} ${each.value} serviceAccount:vehicle-support-api@${var.project_id}.iam.gserviceaccount.com"
}
import {
  to = google_cloud_run_v2_service.api
  id = "projects/${var.project_id}/locations/${var.region}/services/vehicle-support-api"
}
